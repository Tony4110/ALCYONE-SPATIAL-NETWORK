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
let verifiedBound = false

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
  if (modal) modal.hidden = true
}

function openVerifiedModal(mode, actor) {
  const modal = document.getElementById('v-modal')
  const form = document.getElementById('v-form')
  const title = document.getElementById('v-modal-title')
  if (!modal || !form || !title) return
  verifiedMode = mode
  verifiedActor = actor || null
  form.reset()
  setFormError('')
  setVerifiedNote('')
  title.textContent = mode === 'claim' ? 'Claim this company' : 'Submit your company'
  form.querySelectorAll('[data-for]').forEach(el => {
    const on = el.dataset.for === mode
    el.hidden = !on
    el.querySelectorAll('input,textarea').forEach(input => { input.disabled = !on })
  })
  form.elements.company_name.required = mode === 'submit'
  const send = document.getElementById('v-form-send')
  send.disabled = false
  send.textContent = 'Send'
  modal.hidden = false
  form.elements[mode === 'claim' ? 'contact_email' : 'company_name']?.focus()
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
    if (!verifiedActor) return
    row = {
      actor_id: verifiedActor.id,
      kind: 'claim',
      company_name: verifiedActor.name,
      contact_name: contact_name || null,
      contact_email,
      contact_role: contact_role || null,
      message: val('message') || null,
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
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-claim]')
    if (!btn) return
    const actor = verifiedActors.find(a => String(a.id) === btn.dataset.claim)
    if (actor) openVerifiedModal('claim', actor)
  })
  openSubmit.addEventListener('click', () => openVerifiedModal('submit'))
  closeBtn.addEventListener('click', closeVerifiedModal)
  modal.addEventListener('click', (e) => { if (e.target === modal) closeVerifiedModal() })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeVerifiedModal()
  })
  form.addEventListener('submit', onVerifiedSubmit)
}

async function renderVerified() {
  const grid = document.getElementById('v-grid')
  if (!grid) return
  bindVerifiedUi()
  try {
    verifiedActors = await getActors()
    renderVerifiedFilters()
    renderVerifiedCards()
  } catch (e) {
    console.error('[verified]', e)
    setVerifiedNote('The registry could not be loaded.', true)
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
})

// Note migration bundler / Next.js : remplacer les deux constantes par
//   import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// et importer createClient depuis '@supabase/supabase-js'.
