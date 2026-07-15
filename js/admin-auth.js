import { supabase } from './supabase-client.js';

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
    document.title = `Admin Login — ${data.name}`;
  }
  if (data.description) {
    document.getElementById('brand-tag').textContent = data.description;
  }
  if (data.logo_url) {
    document.getElementById('brand-logo').src = data.logo_url;
  }
}
loadBranding();

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = '';
  errorEl.className = 'status-msg';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.className = 'status-msg error';
    return;
  }

  const { data: adminRow } = await supabase
    .from('admins')
    .select('id')
    .eq('id', data.user.id)
    .single();

  if (!adminRow) {
    errorEl.textContent = 'This account is not an admin.';
    errorEl.className = 'status-msg error';
    await supabase.auth.signOut();
    return;
  }

  window.location.href = 'dashboard.html';
});

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = '';
  errorEl.className = 'status-msg';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.className = 'status-msg error';
    return;
  }

  // Confirm this user is actually an admin, not just any logged-in account
  const { data: adminRow } = await supabase
    .from('admins')
    .select('id')
    .eq('id', data.user.id)
    .single();

  if (!adminRow) {
    errorEl.textContent = 'This account is not an admin.';
    errorEl.className = 'status-msg error';
    await supabase.auth.signOut();
    return;
  }

  window.location.href = 'dashboard.html';
});