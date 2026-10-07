-- =====================================================================
--  ALCYONE — INSTALL : SCORING v1.1 (édition hebdo pilotée par la donnée)
--  Recalcule l'index Space Economy depuis la donnée RÉELLE captée
--  (satellite_history + launches), écrit weekly_editions + score_history.
--  Mêmes poids que la méthodo v1 ; le momentum Infrastructure & Launch
--  devient data-driven. Connectivity & Market restent des proxys (confiance
--  plus basse) tant que la donnée d'adoption/financement n'est pas captée.
--  Idempotent : upsert par semaine ISO. À coller dans Supabase > SQL Editor.
-- =====================================================================

create or replace function compute_and_publish_edition()
returns jsonb
language plpgsql
as $fn$
declare
  v_infra_base   numeric; v_launch_base numeric; v_conn_base numeric;
  v_conn_up      numeric; v_new_entrants numeric; v_competition numeric;
  v_avg_growth   numeric; v_ops_hist int; v_sat_bonus numeric;
  v_recent_launch int; v_prior_launch int; v_cadence_chg numeric; v_launch_bonus numeric;
  v_infra int; v_launch int; v_conn int; v_market int; v_index int;
  v_conf text; v_week text; v_summary text;
begin
  -- ---- bases structurelles (poids v1, inchangés) ----
  select avg(case status when 'expansion' then 1.0 when 'early' then 0.85
                         when 'stable' then 0.55 when 'consolidation' then 0.35 else 0.5 end)
    into v_infra_base  from operators where category = 'constellation';
  select avg(case status when 'expansion' then 1.0 when 'early' then 0.85
                         when 'stable' then 0.55 when 'consolidation' then 0.35 else 0.5 end)
    into v_launch_base from operators where category = 'launch_provider';
  select avg(case adoption_stage when 'mature' then 1.0 when 'accelerating' then 0.8
                                 when 'early' then 0.5 else 0.5 end)
    into v_conn_base   from markets;
  v_infra_base  := coalesce(v_infra_base, 0.5);
  v_launch_base := coalesce(v_launch_base, 0.5);
  v_conn_base   := coalesce(v_conn_base, 0.5);

  -- ---- connectivity : momentum signaux (proxy, inchangé) ----
  select coalesce(
      count(*) filter (where direction='up' and signal_type in ('adoption','coverage_expansion'))::numeric
      / nullif(count(*) filter (where signal_type in ('adoption','coverage_expansion')), 0), 0)
    into v_conn_up from signals;

  -- ---- market : nouveaux entrants + concurrence (proxy, inchangé) ----
  select coalesce(count(*) filter (where status in ('early','expansion'))::numeric
                  / nullif(count(*),0), 0)
    into v_new_entrants from operators;
  select case when exists(select 1 from signals where signal_type='competition' and direction='up')
              then 1 else 0.4 end
    into v_competition;

  -- ---- momentum satellites RÉEL (croissance par opérateur, 2 dernières captures) ----
  with ranked as (
    select operator_name, active_satellites,
           row_number() over (partition by operator_name order by date desc) rn
    from satellite_history
  ),
  pair as (
    select operator_name,
           max(active_satellites) filter (where rn=1) as latest,
           max(active_satellites) filter (where rn=2) as prev
    from ranked where rn <= 2 group by operator_name
  ),
  growth as (
    select (latest - prev)::numeric / prev * 100 as pct
    from pair where prev is not null and prev > 0 and latest is not null
  )
  select avg(pct), count(*) into v_avg_growth, v_ops_hist from growth;
  -- BONUS SEULEMENT : une vraie croissance monte le score ; une semaine plate
  -- ou en baisse ne le pénalise pas (momentum séparé). +5%/sem -> bonus plein.
  v_sat_bonus := greatest(0, least(1, coalesce(v_avg_growth,0)/5.0));

  -- ---- momentum lancements RÉEL (28 j vs 28 j précédents) ----
  select count(*) into v_recent_launch from launches
    where net > now() - interval '28 days' and net <= now();
  select count(*) into v_prior_launch  from launches
    where net > now() - interval '56 days' and net <= now() - interval '28 days';
  v_cadence_chg := case when v_prior_launch = 0
                        then (case when v_recent_launch > 0 then 1 else 0 end)
                        else (v_recent_launch - v_prior_launch)::numeric / v_prior_launch end;
  -- bonus seulement aussi pour la cadence : +200% -> bonus plein ; plat/baisse -> 0
  v_launch_bonus := greatest(0, least(1, v_cadence_chg / 2.0));

  -- ---- sous-scores : base structurelle STABLE + bonus data-driven (jamais de pénalité) ----
  v_infra  := greatest(0, least(100, round((v_infra_base  + 0.20*v_sat_bonus)    * 100)))::int;
  v_launch := greatest(0, least(100, round((v_launch_base + 0.15*v_launch_bonus) * 100)))::int;
  v_conn   := greatest(0, least(100, round((0.6*v_conn_base   + 0.4*v_conn_up)    * 100)))::int;
  v_market := greatest(0, least(100, round((0.7*v_new_entrants+ 0.3*v_competition)* 100)))::int;
  v_index  := greatest(0, least(100, round(0.3*v_conn + 0.3*v_infra + 0.2*v_launch + 0.2*v_market)))::int;

  v_conf := case when v_ops_hist >= 6 then 'High' when v_ops_hist >= 3 then 'Medium' else 'Low' end;
  v_week := 'Week ' || to_char(current_date,'FMIW') || ', ' || to_char(current_date,'IYYY');
  v_summary := 'Index ' || v_index || '/100. '
    || case when v_avg_growth is null then 'Satellite momentum: baseline. '
            else 'Satellites ' || case when v_avg_growth>=0 then '+' else '' end
                 || round(v_avg_growth,1) || '% vs last capture. ' end
    || v_recent_launch || ' launches in the last 28 days.';

  -- ---- upsert édition hebdo (une par semaine ISO) ----
  if exists (select 1 from weekly_editions where week_label = v_week) then
    update weekly_editions set
      edition_date=current_date, index_value=v_index, connectivity=v_conn,
      infrastructure=v_infra, launch=v_launch, market=v_market,
      auto_summary=v_summary, confidence=v_conf, methodology_version='v1.1',
      sources='Space-Track; Launch Library 2'
    where week_label = v_week;
  else
    insert into weekly_editions(week_label, edition_date, index_value, connectivity,
      infrastructure, launch, market, auto_summary, confidence, methodology_version, sources)
    values (v_week, current_date, v_index, v_conn, v_infra, v_launch, v_market,
      v_summary, v_conf, 'v1.1', 'Space-Track; Launch Library 2');
  end if;

  -- ---- snapshot score_history (idempotent pour aujourd'hui) -> permet le Momentum ----
  delete from score_history where date = current_date and period = 'weekly'
    and score_type in ('space_economy','connectivity','infrastructure','launch','investment');
  insert into score_history(score_type, score, date, period, methodology_version, source_count, confidence)
  values
    ('space_economy',  v_index,  current_date, 'weekly','v1.1', v_ops_hist, v_conf),
    ('connectivity',   v_conn,   current_date, 'weekly','v1.1', v_ops_hist, v_conf),
    ('infrastructure', v_infra,  current_date, 'weekly','v1.1', v_ops_hist, v_conf),
    ('launch',         v_launch, current_date, 'weekly','v1.1', v_ops_hist, v_conf),
    ('investment',     v_market, current_date, 'weekly','v1.1', v_ops_hist, v_conf);

  return jsonb_build_object(
    'week', v_week, 'index', v_index, 'connectivity', v_conn, 'infrastructure', v_infra,
    'launch', v_launch, 'market', v_market, 'confidence', v_conf,
    'avg_sat_growth_pct', round(coalesce(v_avg_growth,0),2), 'ops_with_history', v_ops_hist,
    'launches_28d', v_recent_launch, 'launches_prev_28d', v_prior_launch);
end;
$fn$;

-- ---- planifier chaque lundi 04:00 UTC (après la capture satellites de 03:00) ----
do $$ begin perform cron.unschedule('weekly-edition'); exception when others then null; end $$;
select cron.schedule('weekly-edition', '0 4 * * 1', $$select compute_and_publish_edition();$$);

-- ---- lancer une fois maintenant pour voir l'index bouger ----
select compute_and_publish_edition();
