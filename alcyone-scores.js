// =====================================================================
// alcyone-scores.js — scores Alcyone ↔ Supabase
// Usage : <script type="module" src="alcyone-scores.js"></script>
// =====================================================================
import { supabase } from './alcyone-supabase.js'

// petite fonction d'échappement HTML (sécurité d'affichage)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
))

// =====================================================================
// QUERIES
// =====================================================================
export async function getScores() {
  const { data, error } = await supabase
    .from('scores')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return data
}

// =====================================================================
// RENDER
// =====================================================================

// =====================================================================
// INIT
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  // renderScores()
})
