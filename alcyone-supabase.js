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

// =====================================================================
// RENDER — injecte les données dans le DOM existant de la maquette
// =====================================================================

// --- Page AI Insights (priorité — le cœur de valeur) ---
async function renderInsights() {
  const grid = document.querySelector('.ins-grid')
  if (!grid) return
  try {
    const insights = await getInsights('fr')
    if (!insights.length) return
    grid.innerHTML = insights.map((i, n) => `
      <div class="insight">
        <div class="num">${esc(i.ref ?? 'INSIGHT ' + String(n + 1).padStart(2, '0'))}</div>
        <h3>${esc(i.title)}</h3>
        <div class="sum">${esc(i.what_happened)}</div>
        <div class="meta">
          <div><div class="k">Pourquoi c'est important</div><div class="why">${esc(i.why_it_matters)}</div></div>
          <div><div class="k">Gagnants potentiels</div><div class="win">${esc(i.who_benefits)}</div></div>
          <div><div class="k">Risques potentiels</div><div class="risk">${esc(i.what_to_watch)}</div></div>
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
  early:         ['Précoce', 'b-exp'],
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
      const pos   = o.market_position ?? o.description ?? ''
      return `<tr>
        <td class="op">${esc(o.name)}</td>
        <td><span class="badge ${cls}">${esc(label)}</span></td>
        <td>${esc(stage)}</td>
        <td>${esc(pos)}</td>
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
  if (!net) return timeFrame === 'upcoming' ? 'À VENIR' : 'RÉCENT'
  const d = new Date(net)
  const now = new Date()
  const days = Math.round(Math.abs(d - now) / 86400000)
  const prefix = timeFrame === 'upcoming' ? 'À VENIR · ~' : 'RÉCENT · il y a '
  return prefix + days + ' j'
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

// =====================================================================
// INIT
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  renderInsights()
  renderConstellations()
  renderTicker()
  renderLaunches()
})

// Note migration bundler / Next.js : remplacer les deux constantes par
//   import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// et importer createClient depuis '@supabase/supabase-js'.
