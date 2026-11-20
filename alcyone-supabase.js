// =====================================================================
// alcyone-supabase.js — branchement maquette Alcyone ↔ Supabase
// Usage : <script type="module" src="alcyone-supabase.js"></script>
// Remplir UNIQUEMENT les deux valeurs ci-dessous. Rien d'autre à toucher.
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ====== CONFIG — à remplir ======
const SUPABASE_URL             = 'https://jlvghejppvlmrchuchqj.supabase.co'   // ✅ rempli
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YP3KkPpAFc2Bwlp7pvOmvA_3Wj2hkD8'   // ✅ rempli
// (La publishable key est sûre côté client : la RLS protège les données.
//  Ne JAMAIS mettre la secret key sb_secret_... ici.)
// =================================

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// petite fonction d'échappement HTML (sécurité d'affichage)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
))

// =====================================================================
// QUERIES — les 5 tables du knowledge graph
// =====================================================================
export async function getInsights(locale = 'en') {
  const { data, error } = await supabase
    .from('insights')
    .select('ref,title,pillar,what_happened,why_it_matters,who_benefits,what_to_watch,published_at')
    .eq('status', 'published')
    .eq('locale', locale)
    .order('published_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getConstellations() {
  const { data, error } = await supabase
    .from('operators').select('*')
    .eq('category', 'constellation')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function getLaunchProviders() {
  const { data, error } = await supabase
    .from('operators').select('*')
    .eq('category', 'launch_provider')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function getAllOperators() {
  const { data, error } = await supabase
    .from('operators')
    .select('name, category, status, active_satellites, orbit, description, sort_order')
    .order('active_satellites', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

export async function getMarkets() {
  const { data, error } = await supabase
    .from('markets').select('*').order('sort_order')
  if (error) throw error
  return data
}

export async function getSignals() {
  const { data, error } = await supabase
    .from('signals').select('title,direction,signal_type')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getLaunches(timeFrame, limit = 4) {
  const { data, error } = await supabase
    .from('launches')
    .select('name,provider,rocket,status,net,time_frame')
    .eq('time_frame', timeFrame)
    .order('net', { ascending: timeFrame === 'upcoming' })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function getWeeklyEditions() {
  const { data, error } = await supabase
    .from('weekly_editions')
    .select('week_label, edition_date, index_value, connectivity, infrastructure, launch, market, auto_summary, narrative, confidence, methodology_version, sources')
    .order('edition_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getSatelliteMomentum() {
  // Récupère l'historique des satellites, 2 dernières mesures par opérateur
  const { data, error } = await supabase
    .from('satellite_history')
    .select('operator_name, active_satellites, date')
    .order('date', { ascending: false })
  if (error) throw error
  const rows = data ?? []

  // Regroupe par opérateur, garde les 2 dernières mesures
  const byOp = {}
  for (const r of rows) {
    if (!byOp[r.operator_name]) byOp[r.operator_name] = []
    if (byOp[r.operator_name].length < 2) byOp[r.operator_name].push(r)
  }

  // Calcule la croissance % pour chaque opérateur qui a 2 mesures
  let totalGrowthPct = 0
  let opsWithHistory = 0
  let totalOps = 0
  for (const op in byOp) {
    totalOps++
    const m = byOp[op]
    if (m.length === 2 && m[1].active_satellites > 0) {
      const latest = m[0].active_satellites
      const previous = m[1].active_satellites
      const pct = ((latest - previous) / previous) * 100
      totalGrowthPct += pct
      opsWithHistory++
    }
  }

  // Momentum = croissance moyenne des opérateurs avec historique
  const hasMomentum = opsWithHistory >= 1
  const avgGrowth = hasMomentum ? (totalGrowthPct / opsWithHistory) : null

  // Confidence basée sur la couverture (combien d'opérateurs ont un historique)
  let confidence = 'Low'
  if (opsWithHistory >= 6) confidence = 'High'
  else if (opsWithHistory >= 3) confidence = 'Medium'

  return {
    hasMomentum,
    momentum: avgGrowth,          // null si pas d'historique
    opsWithHistory,               // combien d'opérateurs ont 2 mesures
    totalOps,                     // total d'opérateurs suivis
    confidence,                   // High / Medium / Low
  }
}

export async function getActors() {
  const { data, error } = await supabase
    .from('actors')
    .select('id, slug, name, website, category, subcategory, hq_country, regions, short_description, status, alcyone_score, source_url, last_verified_at')
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

// =====================================================================
// RENDER — injecte les données dans le DOM existant de la maquette
// =====================================================================

// --- Page AI Insights (priorité — le cœur de valeur) ---
async function renderInsights() {
  const grid = document.querySelector('.ins-grid')
  if (!grid) return
  try {
    const insights = await getInsights('en')
    if (!insights.length) return
    grid.innerHTML = insights.map((i, n) => `
      <div class="insight">
        <div class="num">${esc(i.ref ?? 'INSIGHT ' + String(n + 1).padStart(2, '0'))}</div>
        <h3>${esc(i.title)}</h3>
        <div class="sum">${esc(i.what_happened)}</div>
        <div class="meta">
          <div><div class="k">Why it matters</div><div class="why">${esc(i.why_it_matters)}</div></div>
          <div><div class="k">Potential winners</div><div class="win">${esc(i.who_benefits)}</div></div>
          <div><div class="k">Potential risks</div><div class="risk">${esc(i.what_to_watch)}</div></div>
        </div>
      </div>`).join('')
  } catch (e) {
    console.error('[insights]', e)
  }
}

// --- Constellation Monitor (Pilier 1) ---
const STATUS_BADGE = {
  expansion:     ['Expansion', 'b-exp'],
  stable:        ['Stable', 'b-stable'],
  consolidation: ['Consolidation', 'b-cons'],
  early:         ['Early', 'b-exp'],
}
async function renderConstellations() {
  // trouve le panneau "Constellation Monitor" sans avoir à modifier le HTML
  const h3 = [...document.querySelectorAll('.panel-h h3')]
    .find(e => /constellation monitor|moniteur des constellations/i.test(e.textContent))
  const table = h3?.closest('.panel')?.querySelector('table')
  if (!table) return
  try {
    const rows = await getConstellations()
    const header = table.querySelector('tr')?.outerHTML ?? ''
    table.innerHTML = header + rows.map(o => {
      const [label, cls] = STATUS_BADGE[o.status] ?? ['—', 'b-stable']
      const stage = o.deployment_stage ?? o.orbit ?? ''        // colonnes additives optionnelles
      return `<tr>
        <td class="op">${esc(o.name)}</td>
        <td><span class="badge ${cls}">${esc(label)}</span></td>
        <td>${esc(stage)}</td>
      </tr>`
    }).join('')
  } catch (e) {
    console.error('[constellations]', e)
  }
}

// --- Ticker (signals) ---
const ARROW = { up: '▲', down: '▼', neutral: '•' }
async function renderTicker() {
  const span = document.querySelector('.ticker span')
  if (!span) return
  try {
    const sig = await getSignals()
    if (!sig.length) return
    const unit = sig.map(s => `${esc(s.title)} <b>${ARROW[s.direction] ?? ''}</b>`)
      .join(' &nbsp;·&nbsp; ')
    span.innerHTML = unit + ' &nbsp;·&nbsp; ' + unit   // doublé pour la boucle de scroll
  } catch (e) {
    console.error('[ticker]', e)
  }
}

function fmtLaunchDate(net, timeFrame) {
  if (!net) return timeFrame === 'upcoming' ? 'UPCOMING' : 'RECENT'
  const d = new Date(net)
  const now = new Date()
  const days = Math.round(Math.abs(d - now) / 86400000)
  const prefix = timeFrame === 'upcoming' ? 'UPCOMING · ~' : 'RECENT · '
  return prefix + days + (timeFrame === 'upcoming' ? ' d' : ' d ago')
}

async function renderLaunches() {
  const h3 = [...document.querySelectorAll('.panel-h h3')]
    .find(e => /marché des lancements|launch market/i.test(e.textContent))
  const panel = h3?.closest('.panel')
  if (!panel) return
  try {
    const [upcoming, recent] = await Promise.all([
      getLaunches('upcoming', 3),
      getLaunches('recent', 3),
    ])
    const all = [...recent, ...upcoming]
    if (!all.length) return
    const rows = all.map(l => {
      const cls = l.time_frame === 'recent' ? 'up' : ''
      const rocket = l.rocket || l.provider || ''
      const mission = (l.name || '').split('|').pop().trim()
      return `<div class="launch-row">
        <span><b>${esc(rocket)}</b> · ${esc(mission)}</span>
        <span class="mono ${cls}">${esc(fmtLaunchDate(l.net, l.time_frame))}</span>
      </div>`
    }).join('')
    const aiSummary = panel.querySelector('.ai-summary')
    panel.querySelectorAll('.launch-row').forEach(r => r.remove())
    if (aiSummary) aiSummary.insertAdjacentHTML('beforebegin', rows)
    else panel.insertAdjacentHTML('beforeend', rows)
  } catch (e) {
    console.error('[launches]', e)
  }
}

async function renderMarketCompanies() {
  const tbody = document.querySelector('.market-companies tbody')
  if (!tbody) return
  try {
    const ops = await getAllOperators()
    if (!ops.length) return
    const catLabel = { constellation: 'Constellation', launch_provider: 'Launch Provider' }
    const statusBadge = {
      expansion: ['Expansion','b-exp'], early: ['Early','b-exp'],
      stable: ['Stable','b-stable'], consolidation: ['Consolidation','b-cons']
    }
    tbody.innerHTML = ops.map((o, i) => {
      const [label, cls] = statusBadge[o.status] ?? ['—','b-stable']
      const sats = (o.active_satellites != null && o.active_satellites >= 0)
        ? o.active_satellites.toLocaleString('fr-FR') : '—'
      return `<tr>
        <td class="rank-no">${String(i+1).padStart(2,'0')}</td>
        <td class="op">${esc(o.name)}</td>
        <td>${esc(catLabel[o.category] ?? o.category ?? '—')}</td>
        <td class="mono">${sats}</td>
        <td><span class="badge ${cls}">${esc(label)}</span></td>
      </tr>`
    }).join('')
  } catch (e) { console.error('[market]', e) }
}

async function renderWeeklyEditions() {
  const box = document.querySelector('.weekly-editions')
  if (!box) return
  try {
    const editions = await getWeeklyEditions()
    if (!editions.length) return
    box.innerHTML = editions.map(e => {
      const text = e.narrative || e.auto_summary || ''
      return `<div class="panel" style="margin-top:18px">
        <div class="panel-h">
          <h3>Alcyone Space Economy Index — ${esc(e.week_label)}</h3>
          <span class="pill">${esc(e.edition_date)}</span>
        </div>
        <div class="val" style="font-family:var(--serif);font-size:56px;color:var(--up);letter-spacing:-2px">${e.index_value}<span style="font-size:20px;color:var(--faint)">/100</span></div>
        <div class="mono" style="color:var(--muted);margin:10px 0;font-size:13px">Connectivity ${e.connectivity} · Infrastructure ${e.infrastructure} · Launch ${e.launch} · Market ${e.market}</div>
        <div style="margin-top:14px">
          <div class="k" style="font-family:var(--mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--faint);margin-bottom:6px">What moved it</div>
          <div class="why" style="color:var(--text);line-height:1.6">${esc(text)}</div>
        </div>
        <div class="mono" style="color:var(--faint);font-size:11px;margin-top:16px;padding-top:12px;border-top:1px solid var(--line)">Confidence: ${esc(e.confidence)} · Methodology ${esc(e.methodology_version)} · Sources: ${esc(e.sources)}</div>
      </div>`
    }).join('')
  } catch (err) { console.error('[weekly]', err) }
}

// --- Verified registry (actors + claims / submissions) ---
let verifiedActors = []
let verifiedFilter = 'all'
let verifiedMode = 'claim'
let verifiedActor = null
let verifiedClaimPrefill = false
let verifiedBound = false
const actorById = new Map()

function rememberActors(list) {
  for (const a of list || []) {
    if (a && a.id != null && a.id !== '') actorById.set(String(a.id), a)
  }
}

function labelize(value) {
  return String(value ?? '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

function coverageText(regions) {
  if (Array.isArray(regions)) return regions.map(r => String(r ?? '').trim()).filter(Boolean).join(', ')
  if (typeof regions === 'string') return regions.trim()
  return ''
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value))
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
  } catch (_) {}
  return ''
}

function scoreText(score) {
  if (score === null || score === undefined || score === '') return ''
  const n = Number(score)
  if (!Number.isFinite(n)) return ''
  return `Alcyone Score ${Number.isInteger(n) ? n : score}/100`
}

function statusBadge(status) {
  if (status === 'verified') return { cls: 'b-verified', label: '✓ Verified' }
  if (status === 'claimed') return { cls: 'b-stable', label: 'Claimed' }
  if (status === 'auto') return { cls: 'b-auto', label: 'Unclaimed' }
  return { cls: 'b-auto', label: status ? labelize(status) : 'Unclaimed' }
}

function setVerifiedNote(text, isError) {
  const el = document.getElementById('v-status')
  if (!el) return
  el.hidden = !text
  el.classList.toggle('err', !!isError)
  el.textContent = text || ''
}

function setVerifiedEmpty(text) {
  const el = document.getElementById('v-empty')
  if (!el) return
  el.hidden = !text
  el.textContent = text || ''
}

function setFormError(text) {
  const el = document.getElementById('v-form-error')
  if (!el) return
  el.hidden = !text
  el.textContent = text || ''
}

function renderVerifiedFilters() {
  const host = document.getElementById('v-filters')
  if (!host) return
  const cats = []
  const seen = new Set()
  for (const a of verifiedActors) {
    if (!a.category || seen.has(a.category)) continue
    seen.add(a.category)
    cats.push(a.category)
  }
  host.innerHTML = [['all', 'All'], ...cats.map(c => [c, labelize(c)])].map(([id, label]) =>
    `<button type="button" data-cat="${esc(id)}" class="${id === verifiedFilter ? 'active' : ''}">${esc(label)}</button>`
  ).join('')
}

function renderVerifiedCards() {
  const grid = document.getElementById('v-grid')
  if (!grid) return
  const rows = verifiedActors.filter(a => verifiedFilter === 'all' || a.category === verifiedFilter)
  if (!rows.length) {
    grid.innerHTML = ''
    setVerifiedEmpty(verifiedActors.length ? 'Nothing in this category.' : 'No actors listed yet.')
    return
  }
  setVerifiedEmpty('')
  grid.innerHTML = rows.map(a => {
    const badge = statusBadge(a.status)
    const cov = coverageText(a.regions)
    const site = safeHttpUrl(a.website)
    const score = scoreText(a.alcyone_score)
    const chips = [a.category, a.subcategory].filter(Boolean)
      .map(c => `<span class="pill">${esc(labelize(c))}</span>`).join('')
    return `<article class="insight v-card">
      <div class="panel-h"><h3>${esc(a.name)}</h3><span class="badge ${badge.cls}">${esc(badge.label)}</span></div>
      ${chips ? `<div class="v-chips">${chips}</div>` : ''}
      ${(a.hq_country || cov) ? `<div class="v-meta">${a.hq_country ? `<div><b>HQ</b>${esc(a.hq_country)}</div>` : ''}${cov ? `<div><b>Coverage</b>${esc(cov)}</div>` : ''}</div>` : ''}
      ${score ? `<div class="v-score">${esc(score)}</div>` : ''}
      <div class="v-actions">
        ${site ? `<a class="v-link" href="${esc(site)}" target="_blank" rel="noopener noreferrer">Website</a>` : '<span></span>'}
        <button type="button" class="btn btn-ghost" data-claim="${esc(a.id)}">Claim this company</button>
      </div>
    </article>`
  }).join('')
}

function closeVerifiedModal() {
  const modal = document.getElementById('v-modal')
  const banner = document.getElementById('v-claim-banner')
  if (banner) banner.hidden = true
  if (modal) modal.hidden = true
}

function setField(form, name, value) {
  const field = form.elements[name]
  if (field) field.value = value == null ? '' : String(value)
}

function openVerifiedModal(mode, actor, opts = {}) {
  const modal = document.getElementById('v-modal')
  const form = document.getElementById('v-form')
  const title = document.getElementById('v-modal-title')
  if (!modal || !form || !title) return
  const prefill = !!opts.prefill
  verifiedMode = mode
  verifiedActor = actor || null
  verifiedClaimPrefill = prefill
  form.reset()
  setFormError('')
  setVerifiedNote('')
  const banner = document.getElementById('v-claim-banner')
  if (banner) banner.hidden = !prefill
  title.textContent = mode === 'claim' ? 'Claim this company' : 'Submit your company'
  form.querySelectorAll('[data-for]').forEach(el => {
    const roles = el.dataset.for.split(/\s+/)
    const on = roles.includes(mode) || (prefill && roles.includes('profile'))
    el.hidden = !on
    el.querySelectorAll('input,textarea,select').forEach(input => { input.disabled = !on })
  })
  setField(form, 'actor_id', actor?.id ?? '')
  if (prefill && actor) {
    setField(form, 'company_name', actor.name)
    setField(form, 'website', actor.website)
    setField(form, 'category', actor.category)
    setField(form, 'country', actor.hq_country)
    setField(form, 'regions', coverageText(actor.regions))
    setField(form, 'description', actor.short_description)
  }
  form.elements.company_name.required = mode === 'submit' || prefill
  const send = document.getElementById('v-form-send')
  send.disabled = false
  send.textContent = 'Send'
  modal.hidden = false
  const focusName = prefill ? 'company_name' : (mode === 'claim' ? 'contact_email' : 'company_name')
  form.elements[focusName]?.focus()
}

async function onVerifiedSubmit(e) {
  e.preventDefault()
  const form = e.currentTarget
  const send = document.getElementById('v-form-send')
  const val = (name) => String(form.elements[name]?.value ?? '').trim()
  const contact_email = val('contact_email')
  const contact_name = val('contact_name')
  const contact_role = val('contact_role')
  if (!contact_email) {
    setFormError('Email is required.')
    return
  }
  let row
  let thanks
  if (verifiedMode === 'claim') {
    const actorId = val('actor_id') || verifiedActor?.id
    if (!actorId) return
    row = {
      actor_id: actorId,
      kind: 'claim',
      company_name: verifiedActor?.name,
      contact_name: contact_name || null,
      contact_email,
      contact_role: contact_role || null,
      message: val('message') || null,
    }
    if (verifiedClaimPrefill) {
      const company_name = val('company_name')
      if (!company_name) {
        setFormError('Company name is required.')
        return
      }
      row.company_name = company_name
      row.website = val('website') || null
      row.category = val('category') || null
      row.country = val('country') || null
      row.regions = val('regions') || null
      row.description = val('description') || null
    }
    thanks = "Thanks — we'll review your claim"
  } else {
    const company_name = val('company_name')
    if (!company_name) {
      setFormError('Company name is required.')
      return
    }
    row = {
      kind: 'submit',
      company_name,
      website: val('website') || null,
      category: val('category') || null,
      country: val('country') || null,
      description: val('description') || null,
      contact_name: contact_name || null,
      contact_email,
      contact_role: contact_role || null,
    }
    thanks = "Thanks — we'll review your submission"
  }
  send.disabled = true
  send.textContent = 'Sending…'
  setFormError('')
  try {
    const { error } = await supabase.from('actor_submissions').insert(row)
    if (error) throw error
    closeVerifiedModal()
    setVerifiedNote(thanks)
  } catch (err) {
    console.error('[verified submit]', err)
    setFormError('Something went wrong. Please try again.')
    send.disabled = false
    send.textContent = 'Send'
  }
}

function bindVerifiedUi() {
  if (verifiedBound) return
  const modal = document.getElementById('v-modal')
  const form = document.getElementById('v-form')
  const grid = document.getElementById('v-grid')
  const filters = document.getElementById('v-filters')
  const openSubmit = document.getElementById('v-submit-open')
  const closeBtn = document.getElementById('v-modal-close')
  if (!modal || !form || !grid || !filters || !openSubmit || !closeBtn) return
  verifiedBound = true
  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]')
    if (!btn) return
    verifiedFilter = btn.dataset.cat
    renderVerifiedFilters()
    renderVerifiedCards()
  })
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-claim]')
    if (!btn) return
    const actor = actorById.get(String(btn.dataset.claim))
      || verifiedActors.find(a => String(a.id) === btn.dataset.claim)
    if (actor) openVerifiedModal('claim', actor)
  })
  openSubmit.addEventListener('click', () => openVerifiedModal('submit'))
  document.getElementById('cx-claim-open')?.addEventListener('click', () => openVerifiedModal('submit'))
  closeBtn.addEventListener('click', closeVerifiedModal)
  modal.addEventListener('click', (e) => { if (e.target === modal) closeVerifiedModal() })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeVerifiedModal()
  })
  form.addEventListener('submit', onVerifiedSubmit)
}

async function openClaimFromQuery() {
  const q = new URLSearchParams(location.search)
  if (q.get('view') !== 'verified') return
  const verified = document.getElementById('verified')
  if (verified && !verified.classList.contains('active') && typeof show === 'function') show('verified')
  const token = String(q.get('claim') ?? '').trim()
  if (!token) return
  bindVerifiedUi()
  try {
    const { data, error } = await supabase.rpc('get_actor_by_claim_token', { p_token: token })
    if (error) throw error
    const actor = Array.isArray(data) ? data[0] : null
    if (!actor || actor.id == null || actor.id === '') return
    openVerifiedModal('claim', actor, { prefill: true })
  } catch (err) {
    console.error('[claim token]', err)
  }
}

async function renderVerified() {
  const grid = document.getElementById('v-grid')
  if (!grid) return
  bindVerifiedUi()
  openClaimFromQuery()
  try {
    verifiedActors = await getActors()
    rememberActors(verifiedActors)
    renderVerifiedFilters()
    renderVerifiedCards()
  } catch (e) {
    console.error('[verified]', e)
    setVerifiedNote('The registry could not be loaded.', true)
  }
}

function bindAssessment() {
  const form = document.getElementById('a-form')
  if (!form || form.dataset.bound) return
  form.dataset.bound = '1'
  form.addEventListener('submit', onAssessmentSubmit)
}

async function onAssessmentSubmit(e) {
  e.preventDefault()
  const form = e.currentTarget
  const note = document.getElementById('a-status')
  const send = document.getElementById('a-send')
  const val = (name) => String(form.elements[name]?.value ?? '').trim()
  const setNote = (text, isError) => {
    if (!note) return
    note.hidden = !text
    note.classList.toggle('err', !!isError)
    note.textContent = text || ''
  }
  const contact_email = val('contact_email')
  const consent = !!form.elements.consent?.checked
  if (!contact_email) {
    setNote('Email is required.', true)
    return
  }
  if (!consent) {
    setNote('Consent is required.', true)
    return
  }
  const row = {
    sector: val('sector') || null,
    use_case: val('use_case') || null,
    locations: val('locations') || null,
    bandwidth_need: val('bandwidth_need') || null,
    availability_need: val('availability_need') || null,
    redundancy: val('redundancy') || null,
    budget_band: val('budget') || null,
    timeline: val('timeline') || null,
    company: val('company') || null,
    contact_name: val('contact_name') || null,
    contact_email,
    consent: true,
  }
  if (send) { send.disabled = true; send.textContent = 'Sending…' }
  setNote('')
  try {
    const { error } = await supabase.from('connectivity_requests').insert(row)
    if (error) throw error
    form.reset()
    setNote("Thanks — we'll review your requirements and come back with suitable options.")
  } catch (err) {
    console.error('[assessment]', err)
    setNote('Something went wrong. Please try again.', true)
  } finally {
    if (send) { send.disabled = false; send.textContent = 'Send request' }
  }
}

// =====================================================================
// CONNECTIVITY HOME — featured maritime providers + marketplace
// (does not touch scores, weekly editions, or the Index)
// =====================================================================
async function getMaritimeProviders(limit = 8) {
  const { data, error } = await supabase
    .from('actors')
    .select('id, slug, name, website, category, subcategory, hq_country, regions, short_description, status')
    .eq('is_published', true)
    .or('category.ilike.%maritime%,subcategory.ilike.%maritime%,short_description.ilike.%maritime%')
    .order('name', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

async function getPublishedActors() {
  const { data, error } = await supabase
    .from('actors')
    .select('id, slug, name, website, category, subcategory, hq_country, regions, short_description, status')
    .eq('is_published', true)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

function providerBadge(status) {
  if (status === 'verified') return { cls: 'cx-badge-gold', label: '✓ Verified' }
  if (status === 'claimed') return { cls: 'cx-badge-blue', label: 'Claimed' }
  if (status === 'auto' || !status) return { cls: 'cx-badge-muted', label: 'Unclaimed' }
  return { cls: 'cx-badge-muted', label: labelize(status) }
}

function providerTags(actor) {
  const out = []
  const push = (value) => {
    const t = String(value ?? '').trim()
    if (!t || t.length > 24) return
    if (/(\$|€|mbps|gbps|latency|\bms\b|price|throughput)/i.test(t)) return
    if (out.some(x => x.toLowerCase() === t.toLowerCase())) return
    out.push(t)
  }
  if (actor.subcategory) push(labelize(actor.subcategory))
  const regions = Array.isArray(actor.regions) ? actor.regions : []
  if (regions[0]) push(String(regions[0]))
  return out.slice(0, 3)
}

function providerCard(actor) {
  const name = actor.name || 'Provider'
  const initial = (name.trim().charAt(0) || '•').toUpperCase()
  const badge = providerBadge(actor.status)
  const meta = labelize(actor.category || 'Provider')
  const tags = providerTags(actor).map(t => `<span>${esc(t)}</span>`).join('')
  const unclaimed = actor.status === 'auto' || !actor.status
  const cta = unclaimed
    ? `<button type="button" class="cx-cta cx-cta-gold" data-claim="${esc(actor.id)}">Is this you? Claim →</button>`
    : `<a class="cx-cta" href="/?actor=${esc(actor.slug || actor.id)}">View solution →</a>`
  return `<article class="cx-card cx-providers">
    <div class="cx-card-top">
      <div class="cx-chip" aria-hidden="true">${esc(initial)}</div>
      <span class="cx-badge ${badge.cls}">${esc(badge.label)}</span>
    </div>
    <h3>${esc(name)}</h3>
    <p class="cx-meta">${esc(meta)}</p>
    <div class="cx-tags">${tags}</div>
    ${cta}
  </article>`
}

function placeholderProviderCards() {
  return [1, 2, 3, 4].map(n => `<article class="cx-card cx-providers">
    <div class="cx-card-top">
      <div class="cx-chip" aria-hidden="true">${n}</div>
      <span class="cx-badge cx-badge-muted">Unclaimed</span>
    </div>
    <h3>Maritime provider</h3>
    <p class="cx-meta">Connectivity provider</p>
    <div class="cx-tags"><span>Placeholder</span></div>
    <a class="cx-cta" href="/?view=marketplace">View solution →</a>
  </article>`).join('')
}

async function renderFeaturedProviders() {
  const host = document.getElementById('cx-providers')
  if (!host) return
  try {
    const rows = await getMaritimeProviders(8)
    rememberActors(rows)
    host.innerHTML = rows.length ? rows.map(providerCard).join('') : placeholderProviderCards()
  } catch (e) {
    console.error('[maritime providers]', e)
    host.innerHTML = placeholderProviderCards()
  }
}

async function renderMarketplace() {
  const host = document.getElementById('mkt-grid')
  if (!host) return
  try {
    const rows = await getPublishedActors()
    rememberActors(rows)
    host.innerHTML = rows.length
      ? rows.map(providerCard).join('')
      : '<p class="cx-pending">No providers published yet.</p>'
  } catch (e) {
    console.error('[marketplace]', e)
    host.innerHTML = '<p class="cx-pending">The marketplace could not be loaded.</p>'
  }
}

async function renderActorFiche() {
  const host = document.getElementById('actor-body')
  if (!host) return
  const slug = new URLSearchParams(location.search).get('actor')
  if (!slug) {
    host.innerHTML = '<p class="lead">This provider profile is unavailable.</p>'
    return
  }
  try {
    const { data, error } = await supabase
      .from('actors')
      .select('id, slug, name, website, category, subcategory, hq_country, regions, short_description, status')
      .eq('is_published', true)
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      host.innerHTML = '<p class="lead">This provider profile is unavailable.</p>'
      return
    }
    rememberActors([data])
    const badge = providerBadge(data.status)
    const meta = labelize(data.category || 'Provider')
    const tags = providerTags(data).map(t => `<span>${esc(t)}</span>`).join('')
    const site = safeHttpUrl(data.website)
    const cov = coverageText(data.regions)
    const unclaimed = data.status === 'auto' || !data.status
    host.innerHTML = `<article class="actor-fiche cx-providers">
      <div class="panel-h">
        <h2 style="font-family:var(--serif);font-weight:500;font-size:clamp(28px,4vw,40px);letter-spacing:-.5px">${esc(data.name)}</h2>
        <span class="cx-badge ${badge.cls}">${esc(badge.label)}</span>
      </div>
      <p class="cx-meta">${esc(meta)}</p>
      ${tags ? `<div class="cx-tags">${tags}</div>` : ''}
      ${data.short_description ? `<p class="lead">${esc(data.short_description)}</p>` : ''}
      ${(data.hq_country || cov) ? `<div class="v-meta">${data.hq_country ? `<div><b>HQ</b>${esc(data.hq_country)}</div>` : ''}${cov ? `<div><b>Coverage</b>${esc(cov)}</div>` : ''}</div>` : ''}
      <div class="v-actions" style="justify-content:flex-start">
        ${site ? `<a class="v-link" href="${esc(site)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}
        ${unclaimed ? `<button type="button" class="btn btn-gold" data-claim="${esc(data.id)}">Is this you? Claim →</button>` : ''}
      </div>
    </article>`
  } catch (e) {
    console.error('[actor]', e)
    host.innerHTML = '<p class="lead">This provider profile could not be loaded.</p>'
  }
}

// =====================================================================
// MARKET DISCOVERY — signals, companies, activity totals
// =====================================================================
async function getMarketSignals() {
  const { data, error } = await supabase
    .from('market_signals')
    .select('signal_type, title, summary, event_date, source_url, confidence')
    .order('event_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

async function getMarketDiscoveryActors() {
  const { data, error } = await supabase
    .from('actors')
    .select('name, company_type, hq_country, short_description, website, source_url, last_verified_at')
    .eq('in_market_discovery', true)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

async function getMarketActivityRows() {
  const [contracts, funding] = await Promise.all([
    supabase.from('contracts').select('amount_eur, currency, awarded_date, source_url'),
    supabase.from('funding_rounds').select('amount_eur, currency, announced_date, source_url'),
  ])
  if (contracts.error) throw contracts.error
  if (funding.error) throw funding.error
  return { contracts: contracts.data ?? [], funding: funding.data ?? [] }
}

function isoDate(value) {
  const s = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

function sourceLink(url, label) {
  const href = safeHttpUrl(url)
  if (!href) return `<span class="cx-cta" style="cursor:default">No source</span>`
  return `<a class="cx-cta" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`
}

function confidenceBadge(value) {
  const v = String(value ?? '').toLowerCase()
  if (v === 'high') return { cls: 'b-exp', label: 'High' }
  if (v === 'medium') return { cls: 'b-stable', label: 'Medium' }
  if (v === 'low') return { cls: 'b-cons', label: 'Low' }
  return { cls: 'cx-badge-muted', label: v ? labelize(v) : '—' }
}

function latestDated(rows, dateKey) {
  let best = null
  for (const row of rows) {
    const d = isoDate(row[dateKey])
    if (!d) continue
    if (!best || d > best.date) best = { date: d, source_url: row.source_url }
  }
  return best
}

function formatMoney(amount, currency) {
  const code = currency || 'USD'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${code} ${Math.round(amount).toLocaleString('en-US')}`
  }
}

function knownAmountSummary(rows, dateKey) {
  const sums = {}
  let known = 0
  let latest = null
  for (const row of rows) {
    if (row.amount_eur == null || row.amount_eur === '') continue
    const n = Number(row.amount_eur)
    if (!Number.isFinite(n)) continue
    known++
    const code = row.currency || 'USD'
    sums[code] = (sums[code] || 0) + n
    const d = isoDate(row[dateKey])
    if (d && (!latest || d > latest.date)) latest = { date: d, source_url: row.source_url }
  }
  const text = Object.entries(sums).map(([code, total]) => formatMoney(total, code)).join(' · ')
  return { known, text: text || '—', latest }
}

function signalCard(row) {
  const type = labelize(row.signal_type || 'Signal')
  const initial = (type.trim().charAt(0) || '•').toUpperCase()
  const confidence = confidenceBadge(row.confidence)
  const date = isoDate(row.event_date) || '—'
  return `<article class="cx-card cx-providers">
    <div class="cx-card-top">
      <div class="cx-chip" aria-hidden="true">${esc(initial)}</div>
      <span class="cx-badge cx-badge-accent">${esc(type)}</span>
    </div>
    <h3>${esc(row.title || 'Signal')}</h3>
    <p class="md-sum">${esc(row.summary || '—')}</p>
    <p class="cx-meta">${esc(date)}</p>
    <span class="badge ${confidence.cls}">${esc(confidence.label)}</span>
    ${sourceLink(row.source_url, 'Source →')}
  </article>`
}

function companyCard(row) {
  const name = row.name || 'Company'
  const initial = (name.trim().charAt(0) || '•').toUpperCase()
  const type = row.company_type ? labelize(row.company_type) : '—'
  const date = isoDate(row.last_verified_at) || '—'
  const website = safeHttpUrl(row.website)
  return `<article class="cx-card cx-providers">
    <div class="cx-card-top">
      <div class="cx-chip" aria-hidden="true">${esc(initial)}</div>
      <span class="cx-badge cx-badge-accent">${esc(type)}</span>
    </div>
    <h3>${esc(name)}</h3>
    <p class="cx-meta">${esc(row.hq_country || '—')}</p>
    <p class="md-sum">${esc(row.short_description || '—')}</p>
    <p class="cx-meta">${esc(date)}</p>
    ${website ? sourceLink(website, 'Website →') : sourceLink(row.source_url, 'Source →')}
  </article>`
}

function activityCard({ chip, badge, value, detail, date, url }) {
  return `<article class="cx-card cx-providers">
    <div class="cx-card-top">
      <div class="cx-chip" aria-hidden="true">${esc(chip)}</div>
      <span class="cx-badge cx-badge-accent">${esc(badge)}</span>
    </div>
    <h3>${esc(value)}</h3>
    <p class="md-sum">${esc(detail)}</p>
    <p class="cx-meta">${esc(date || '—')}</p>
    ${sourceLink(url, 'Source →')}
  </article>`
}

async function renderMarketDiscovery() {
  const signalsHost = document.getElementById('md-signals')
  const companiesHost = document.getElementById('md-companies')
  const activityHost = document.getElementById('md-activity')
  if (!signalsHost || !companiesHost || !activityHost) return

  try {
    const rows = await getMarketSignals()
    signalsHost.innerHTML = rows.length
      ? rows.map(signalCard).join('')
      : '<p class="cx-pending">No signals dated yet.</p>'
  } catch (e) {
    console.error('[market signals]', e)
    signalsHost.innerHTML = '<p class="cx-pending">Signals could not be loaded.</p>'
  }

  try {
    const rows = await getMarketDiscoveryActors()
    companiesHost.innerHTML = rows.length
      ? rows.map(companyCard).join('')
      : '<p class="cx-pending">No companies in market discovery.</p>'
  } catch (e) {
    console.error('[market companies]', e)
    companiesHost.innerHTML = '<p class="cx-pending">Companies could not be loaded.</p>'
  }

  try {
    const { contracts, funding } = await getMarketActivityRows()
    const contractLatest = latestDated(contracts, 'awarded_date')
    const fundingLatest = latestDated(funding, 'announced_date')
    const known = knownAmountSummary(
      [
        ...contracts.map(r => ({ ...r, _date: r.awarded_date })),
        ...funding.map(r => ({ ...r, _date: r.announced_date })),
      ],
      '_date'
    )
    activityHost.innerHTML = [
      activityCard({
        chip: 'C',
        badge: 'Contracts',
        value: String(contracts.length),
        detail: 'Contract records',
        date: contractLatest?.date,
        url: contractLatest?.source_url,
      }),
      activityCard({
        chip: 'F',
        badge: 'Funding rounds',
        value: String(funding.length),
        detail: 'Funding round records',
        date: fundingLatest?.date,
        url: fundingLatest?.source_url,
      }),
      activityCard({
        chip: 'Σ',
        badge: 'Known amounts',
        value: known.text,
        detail: `${known.known} known amount${known.known === 1 ? '' : 's'}`,
        date: known.latest?.date,
        url: known.latest?.source_url,
      }),
    ].join('')
  } catch (e) {
    console.error('[market activity]', e)
    activityHost.innerHTML = '<p class="cx-pending">Activity could not be loaded.</p>'
  }
}

// =====================================================================
// INIT
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  renderInsights()
  renderConstellations()
  renderTicker()
  renderLaunches()
  renderMarketCompanies()
  renderWeeklyEditions()
  renderVerified()
  renderFeaturedProviders()
  renderMarketplace()
  renderMarketDiscovery()
  if (new URLSearchParams(location.search).get('actor')) renderActorFiche()
  bindAssessment()
})

// Note migration bundler / Next.js : remplacer les deux constantes par
//   import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// et importer createClient depuis '@supabase/supabase-js'.
