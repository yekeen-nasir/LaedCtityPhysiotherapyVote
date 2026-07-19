import { supabase } from './supabase-client.js';

const form = document.getElementById('login-form');
const statusEl = document.getElementById('login-status');

// --- Load branding (name + logo) into the header/footer ---
// ASSUMPTION: election_settings has association_name and logo_url columns.
// If your column names differ, adjust the .select() and property names below.
async function loadBranding() {
  const { data, error } = await supabase
  .from('association')
  .select('name, description, logo_url')
  .limit(1)
  .maybeSingle();

if (error || !data) return;

if (data.name) {
  document.getElementById('brand-name').textContent = data.name;
  document.getElementById('brand-footer').textContent = data.name;
  document.title = `Student Login — ${data.name}`;
}
if (data.description) {
  document.getElementById('brand-tag').textContent = data.description;
}
if (data.logo_url) {
  document.getElementById('brand-logo').src = data.logo_url;
}
}
loadBranding();

// --- If already logged in, skip straight to voting ---
const { data: { session: existingSession } } = await supabase.auth.getSession();
if (existingSession) {
  window.location.href = 'vote.html';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Logging in...';
  statusEl.className = 'status-msg';

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const matricRaw = document.getElementById('matric').value;
  const fullNameRaw = document.getElementById('fullname').value;

  const matric = matricRaw.trim().toLowerCase().replace(/\s+/g, '');
  const fullName = fullNameRaw.trim().toLowerCase().replace(/\s+/g, '');
  const email = `${matric}@physiovote.local`;
  const password = matric + fullName;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    statusEl.textContent = 'Login failed: incorrect matric number or full name.';
    statusEl.className = 'status-msg error';
    submitBtn.disabled = false;
    return;
  }

  window.location.href = 'vote.html';
});