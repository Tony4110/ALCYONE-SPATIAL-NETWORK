import { getConstellations, getLaunchProviders, getMarkets, getSignals, supabase }
  from './alcyone-supabase.js'

const STATUS_W = { expansion: 1.0, early: 0.85, stable: 0.55, consolidation: 0.35 }
const ADOPT_W  = { mature: 1.0, accelerating: 0.8, early: 0.5 }

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)))
const avg   = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
const frac  = (a, pred) => a.length ? a.filter(pred).length / a.length : 0

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
))

export async function computeScores() {
  const [cons, launchers, markets, signals] = await Promise.all([
    getConstellations(), getLaunchProviders(), getMarkets(), getSignals()
  ])

  const infraBase = avg(cons.map(o => STATUS_W[o.status] ?? 0.5))
  const infraSig  = signals.filter(s => ['capacity_growth','coverage_expansion'].includes(s.signal_type))
  const infraUp   = frac(infraSig, s => s.direction === 'up')
  const infrastructure = clamp((0.7 * infraBase + 0.3 * infraUp) * 100)

  const launchBase = avg(launchers.map(o => STATUS_W[o.status] ?? 0.5))
  const upAll      = frac(signals, s => s.direction === 'up')
  const launch     = clamp((0.8 * launchBase + 0.2 * upAll) * 100)

  const connBase = avg(markets.map(m => ADOPT_W[m.adoption_stage] ?? 0.5))
  const connSig  = signals.filter(s => ['adoption','coverage_expansion'].includes(s.signal_type))
  const connUp   = frac(connSig, s => s.direction === 'up')
  const connectivity = clamp((0.6 * connBase + 0.4 * connUp) * 100)

  const allOps = [...cons, ...launchers]
  const newEntrants = frac(allOps, o => o.status === 'early' || o.status === 'expansion')
  const competition = signals.some(s => s.signal_type === 'competition' && s.direction === 'up') ? 1 : 0.4
  const investment = clamp((0.7 * newEntrants + 0.3 * competition) * 100)

  const spaceEconomy = clamp(0.3 * connectivity + 0.3 * infrastructure + 0.2 * launch + 0.2 * investment)
  return { spaceEconomy, connectivity, infrastructure, launch, investment }
}

const SCORE_DEFS = [
  { key: 'spaceEconomy',   type: 'space_economy',  label: 'Space Economy Score',         sub: 'Global index' },
  { key: 'connectivity',   type: 'connectivity',   label: 'Connectivity Score',          sub: 'Coverage · adoption · demand' },
  { key: 'infrastructure', type: 'infrastructure', label: 'Infrastructure Growth Score', sub: 'Constellations · orbital capacity' },
  { key: 'launch',         type: 'launch',         label: 'Launch Activity Score',       sub: 'Cadence · momentum' },
  { key: 'investment',     type: 'investment',     label: 'Investment Momentum Score',   sub: 'New entrants · competition' },
]
const colorFor = (v) => v >= 80 ? 'var(--up)' : v >= 60 ? 'var(--gold)' : 'var(--down)'

function asList(value) {
  if (Array.isArray(value)) return value.filter(v => v != null && String(v).trim() !== '')
  if (typeof value === 'string') {
    try { return asList(JSON.parse(value)) } catch { return value.trim() ? [value] : [] }
  }
  return []
}

function statusTone(status) {
  const s = String(status ?? '').toLowerCase()
  if (['watch', 'caution', 'weak', 'soft'].includes(s)) return 'var(--gold)'
  if (['strong', 'expanding', 'accelerating', 'building'].includes(s)) return 'var(--up)'
  return 'var(--muted)'
}

// Real variation only when 2 stored snapshots exist. One row (or a non-numeric
// gap) → "Baseline". Never invent a percentage from a single point.
function variationBadge(current, snapshots) {
  const rows = Array.isArray(snapshots) ? snapshots : []
  if (rows.length < 2) return { text: 'Baseline', cls: '', color: 'var(--gold)' }

  const last = Number(rows[0]?.score)
  const cur  = Number(current)
  if (!Number.isFinite(last) || !Number.isFinite(cur)) {
    return { text: 'Baseline', cls: '', color: 'var(--gold)' }
  }

  const delta = Math.round(cur) - Math.round(last)
  if (delta > 0) return { text: `↑ +${delta}`, cls: 'up', color: 'var(--up)' }
  if (delta < 0) return { text: `↓ −${Math.abs(delta)}`, cls: 'down', color: 'var(--down)' }
  return { text: 'Stable', cls: '', color: 'var(--muted)' }
}

async function getScoreMetaByType() {
  const { data, error } = await supabase
    .from('score_meta')
    .select('score_type,label,status,why_it_matters,key_drivers,watch')
  if (error) throw error
  return Object.fromEntries((data ?? []).map(row => [row.score_type, row]))
}

async function getScoreHistoryByType() {
  const { data, error } = await supabase
    .from('score_history')
    .select('score_type,score,date')
    .order('date', { ascending: false })
  if (error) throw error
  const byType = {}
  for (const row of data ?? []) {
    (byType[row.score_type] ??= []).push(row)
  }
  return byType
}

function renderList(items, itemClass = '') {
  const list = asList(items)
  if (!list.length) return `<div class="why" style="color:var(--faint)">—</div>`
  const cls = itemClass ? ` class="${itemClass}"` : ''
  return `<ul class="score-list">${list.map(item => `<li${cls}>${esc(item)}</li>`).join('')}</ul>`
}

async function renderScores() {
  const grid = document.querySelector('.cards4')
  if (!grid) return
  try {
    const [scores, metaByType, historyByType] = await Promise.all([
      computeScores(),
      getScoreMetaByType().catch(e => { console.error('[score_meta]', e); return {} }),
      getScoreHistoryByType().catch(e => { console.error('[score_history]', e); return {} }),
    ])

    grid.innerHTML = SCORE_DEFS.map(d => {
      const v = scores[d.key]
      const c = colorFor(v)
      const meta = metaByType[d.type] ?? {}
      const label = meta.label || d.label
      const status = meta.status || d.sub
      const badge = variationBadge(v, historyByType[d.type])
      return `<div class="stat">
        <div class="label">${esc(label)}</div>
        <div class="val" style="color:${c}">${v}<span style="font-size:15px;color:var(--faint)">/100</span></div>
        <div class="score-head">
          <span class="trend" style="color:${statusTone(meta.status)}">${esc(status)}</span>
          <span class="trend ${esc(badge.cls)}" style="color:${badge.color}">${esc(badge.text)}</span>
        </div>
        <div style="margin-top:12px;height:5px;border-radius:3px;background:var(--line-2)">
          <div style="height:100%;width:${v}%;border-radius:3px;background:${c}"></div>
        </div>
      </div>`
    }).join('')

    let briefs = document.querySelector('.score-briefs')
    if (!briefs) {
      briefs = document.createElement('div')
      briefs.className = 'score-briefs'
      grid.after(briefs)
    }
    briefs.innerHTML = SCORE_DEFS.map(d => {
      const meta = metaByType[d.type]
      if (!meta) return ''
      const label = meta.label || d.label
      const status = meta.status ? `<span class="pill">${esc(meta.status)}</span>` : ''
      return `<div class="panel score-brief">
        <div class="panel-h">
          <h3>${esc(label)}</h3>
          ${status}
        </div>
        <div class="meta">
          <div>
            <div class="k">Why it matters</div>
            <div class="why">${esc(meta.why_it_matters)}</div>
          </div>
          <div>
            <div class="k">Key drivers</div>
            ${renderList(meta.key_drivers)}
          </div>
          <div>
            <div class="k">Watch</div>
            ${renderList(meta.watch, 'risk')}
          </div>
        </div>
      </div>`
    }).join('')
  } catch (e) { console.error('[scores]', e) }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderScores)
} else {
  renderScores()
}
