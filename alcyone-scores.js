import { getConstellations, getLaunchProviders, getMarkets, getSignals }
  from './alcyone-supabase.js'

const STATUS_W = { expansion: 1.0, early: 0.85, stable: 0.55, consolidation: 0.35 }
const ADOPT_W  = { mature: 1.0, accelerating: 0.8, early: 0.5 }

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)))
const avg   = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
const frac  = (a, pred) => a.length ? a.filter(pred).length / a.length : 0

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
  { key: 'spaceEconomy',   label: 'Score Économie Spatiale',         sub: 'Indice global' },
  { key: 'connectivity',   label: 'Score Connectivité',              sub: 'Couverture · adoption · demande' },
  { key: 'infrastructure', label: 'Score Croissance Infrastructure', sub: 'Constellations · capacité orbitale' },
  { key: 'launch',         label: 'Score Activité de Lancement',     sub: 'Fréquence · momentum' },
  { key: 'investment',     label: 'Score Momentum Investissement',   sub: 'Nouveaux entrants · concurrence' },
]
const colorFor = (v) => v >= 80 ? 'var(--up)' : v >= 60 ? 'var(--gold)' : 'var(--down)'

async function renderScores() {
  const grid = document.querySelector('.cards4')
  if (!grid) return
  try {
    const scores = await computeScores()
    grid.style.gridTemplateColumns = 'repeat(5, 1fr)'
    grid.innerHTML = SCORE_DEFS.map(d => {
      const v = scores[d.key]; const c = colorFor(v)
      return `<div class="stat">
        <div class="label">${d.label}</div>
        <div class="val" style="color:${c}">${v}<span style="font-size:15px;color:var(--faint)">/100</span></div>
        <div class="ai" style="border-top:none;padding-top:6px"><span class="spark">●</span> ${d.sub}</div>
        <div style="margin-top:12px;height:5px;border-radius:3px;background:var(--line-2)">
          <div style="height:100%;width:${v}%;border-radius:3px;background:${c}"></div>
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