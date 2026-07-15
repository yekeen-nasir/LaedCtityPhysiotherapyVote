import { supabase } from './supabase-client.js';
import { renderResultsChart } from './results-shared.js';

const messageEl = document.getElementById('results-message');
const chartContainer = document.getElementById('results-chart-container');

// --- Auth guard ---
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  window.location.href = 'index.html';
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

// --- Branding ---
async function loadBranding() {
  const { data } = await supabase
    .from('association')
    .select('name, logo_url')
    .limit(1)
    .maybeSingle();

  if (!data) return;
  if (data.name) {
    document.getElementById('brand-name').textContent = data.name;
    document.getElementById('brand-footer').textContent = data.name;
    document.title = `Results — ${data.name}`;
  }
  if (data.logo_url) {
    document.getElementById('brand-logo').src = data.logo_url;
  }
}
loadBranding();

async function init() {
  const { data, error } = await supabase.rpc('get_results');

  if (error) {
    // This is expected behavior when results aren't published yet, not a bug
    messageEl.innerHTML = '<div class="alert alert-error">Results have not been published yet. Please check back later.</div>';
    return;
  }

  renderResultsChart(chartContainer, data);
}

init();