import { supabase } from './supabase-client.js';
import { renderResultsChart } from './results-shared.js';

let currentAssociationId = null; // tracks whether we insert or update

// ---- 1. ROUTE GUARD: runs before anything else on this page ----
async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  const { data: adminRow } = await supabase
    .from('admins')
    .select('id')
    .eq('id', session.user.id)
    .single();

  if (!adminRow) {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }

  return session.user;
}

// ---- 2. Load existing branding info, if any, into the form ----
async function loadAssociationInfo() {
  const { data, error } = await supabase
    .from('association')
    .select('*')
    .limit(1)
    .maybeSingle(); // won't throw if no row exists yet

  if (error) {
    console.error(error);
    return;
  }

  if (data) {
    currentAssociationId = data.id;
    document.getElementById('assoc-name').value = data.name || '';
    document.getElementById('assoc-description').value = data.description || '';

    if (data.name) {
      document.getElementById('brand-name').textContent = data.name;
      document.getElementById('brand-footer').textContent = data.name;
    }

    if (data.logo_url) {
      const preview = document.getElementById('current-logo-preview');
      preview.src = data.logo_url;
      preview.style.display = 'block';
      document.getElementById('brand-logo').src = data.logo_url;
    }
  }
}

// ---- 3. Save (insert or update) branding info ----
async function saveAssociationInfo(name, description, logoFile) {
  const statusEl = document.getElementById('branding-status');
  statusEl.className = 'status-msg';
  statusEl.textContent = 'Saving...';

  let logo_url = null;

  if (logoFile) {
    const filePath = `logos/${Date.now()}-${logoFile.name}`;
    const { error: uploadError } = await supabase.storage
      .from('branding')
      .upload(filePath, logoFile);

    if (uploadError) {
      statusEl.textContent = 'Logo upload failed: ' + uploadError.message;
      statusEl.className = 'status-msg error';
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('branding').getPublicUrl(filePath);
    logo_url = publicUrlData.publicUrl;
  }

  const payload = { name, description };
  if (logo_url) payload.logo_url = logo_url; // only overwrite if a new logo was picked

  let error;

  if (currentAssociationId) {
    // Update the existing single row
    ({ error } = await supabase
      .from('association')
      .update(payload)
      .eq('id', currentAssociationId));
  } else {
    // First time setup — insert the one and only row
    const { data, error: insertError } = await supabase
      .from('association')
      .insert(payload)
      .select()
      .single();

    error = insertError;
    if (data) currentAssociationId = data.id;
  }

  if (error) {
    statusEl.textContent = 'Error: ' + error.message;
    statusEl.className = 'status-msg error';
  } else {
    statusEl.textContent = 'Saved successfully.';
    statusEl.className = 'status-msg success';
    if (logo_url) document.getElementById('brand-logo').src = logo_url;
  }
}

// ---- 4. Wire everything up ----
async function init() {
  const user = await requireAdmin();
  if (!user) return; // already redirected

  await loadAssociationInfo();

  document.getElementById('branding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('assoc-name').value;
    const description = document.getElementById('assoc-description').value;
    const logoFile = document.getElementById('assoc-logo').files[0]; // undefined if none picked
    await saveAssociationInfo(name, description, logoFile);
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

init();

const EDGE_FUNCTION_URL = "https://mfwxtgjkrviylxyyuhho.supabase.co/functions/v1/create-student";
const ADMIN_FUNCTION_SECRET = "qwertyuioplkjhgfdsazxcvbnm"; // must match the secret set via `supabase secrets set`
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_n3aIM_62ocWvL4S8FBd9sQ_TwEWYCU9"; // same one used in supabase-client.js

async function callCreateStudentFunction(payload) {
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ secret: ADMIN_FUNCTION_SECRET, ...payload }),
  });
  return response.json();
}

function renderRegistrationResults(result) {
  const container = document.getElementById("registration-results");
  let html = "";

  if (result.succeeded && result.succeeded.length > 0) {
    html += `<div class="data-table-wrap">
      <h4>Registered (${result.succeeded.length})</h4>
      <table class="data-table"><tr><th>Matric Number</th><th>Name</th></tr>`;
      for (const s of result.succeeded) {
        html += `<tr><td>${s.matric_number}</td><td>${s.full_name}</td></tr>`;
      }
    html += `</table></div>`;
  }

  if (result.failed && result.failed.length > 0) {
    html += `<div class="data-table-wrap">
      <h4 class="error-heading">Failed (${result.failed.length})</h4>
      <table class="data-table error-table"><tr><th>Matric Number</th><th>Reason</th></tr>`;
    for (const f of result.failed) {
      html += `<tr><td>${f.matric_number}</td><td>${f.reason}</td></tr>`;
    }
    html += `</table></div>`;
  }

  if (!html) html = '<p class="empty-note mt-2">No results.</p>';
  container.innerHTML = html;
}

// --- Single student registration ---
document.getElementById("single-register-btn")?.addEventListener("click", async () => {
  const matric_number = document.getElementById("single-matric").value.trim();
  const full_name = document.getElementById("single-name").value.trim();

  if (!matric_number || !full_name) {
    alert("Please enter both matric number and full name.");
    return;
  }

  const result = await callCreateStudentFunction({ matric_number, full_name });
  renderRegistrationResults(result);
});

// --- Bulk CSV registration ---
function parseStudentCSV(text) {
  const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  // Skip header row
  const dataLines = lines[0].toLowerCase().includes("matric") ? lines.slice(1) : lines;

  return dataLines.map(line => {
    const [matric_number, full_name] = line.split(",").map(v => v.trim());
    return { matric_number, full_name };
  }).filter(s => s.matric_number && s.full_name);
}

document.getElementById("bulk-register-btn")?.addEventListener("click", async () => {
  const fileInput = document.getElementById("csv-file-input");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please choose a CSV file first.");
    return;
  }

  const text = await file.text();
  const students = parseStudentCSV(text);

  if (students.length === 0) {
    alert("No valid rows found in CSV.");
    return;
  }

  const result = await callCreateStudentFunction({ students });
  renderRegistrationResults(result);
});

async function loadPositionsAndCandidates() {
  const { data, error } = await supabase
    .from('positions')
    .select('*, candidates(*)')
    .order('created_at', { ascending: true })
    .order('created_at', { ascending: true, foreignTable: 'candidates' });

  if (error) {
    console.error(error);
    return;
  }

  renderPositionsList(data);
}

function renderPositionsList(positions) {
  const container = document.getElementById('positions-list');
  container.innerHTML = '';

  if (!positions || positions.length === 0) {
    container.innerHTML = '<p class="empty-note mt-2">No positions yet. Add one above.</p>';
    return;
  }

  positions.forEach(position => {
    const block = document.createElement('div');
    block.className = 'position-card';

    let candidatesHtml = '';
    (position.candidates || []).forEach(c => {
      candidatesHtml += `
        <div class="candidate-row-admin">
          ${c.photo_url
            ? `<img class="candidate-photo" src="${c.photo_url}" alt="${c.full_name}">`
            : `<div class="candidate-photo"></div>`}
          <div class="candidate-info">
            <span class="candidate-name">${c.full_name}</span>
            ${c.bio ? `<span class="candidate-bio">${c.bio}</span>` : ''}
          </div>
          <button data-candidate-id="${c.id}" class="delete-candidate-btn btn-danger btn-secondary">Delete</button>
        </div>`;
    });

    if (!candidatesHtml) {
      candidatesHtml = '<p class="empty-note">No candidates added yet.</p>';
    }

    block.innerHTML = `
      <div class="position-card-header">
        <h3>${position.title}</h3>
        <button data-position-id="${position.id}" class="delete-position-btn btn-danger btn-secondary">Delete Position</button>
      </div>
      ${candidatesHtml}
      <div class="add-candidate-form" data-position-id="${position.id}">
        <input type="text" class="candidate-name-input" placeholder="Candidate full name">
        <input type="file" class="candidate-photo-input" accept="image/*">
        <textarea class="candidate-bio-input" placeholder="Short bio (optional)"></textarea>
        <button class="add-candidate-btn btn-secondary" data-position-id="${position.id}">Add Candidate</button>
      </div>
    `;

    container.appendChild(block);
  });

  attachPositionListEvents();
}

function attachPositionListEvents() {
  document.querySelectorAll('.delete-position-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this position and all its candidates? This cannot be undone.')) return;
      const positionId = btn.dataset.positionId;

      // Delete candidates under this position first (avoids foreign key errors)
      const { error: candErr } = await supabase.from('candidates').delete().eq('position_id', positionId);
      if (candErr) { alert('Error deleting candidates: ' + candErr.message); return; }

      const { error } = await supabase.from('positions').delete().eq('id', positionId);
      if (error) { alert('Error deleting position: ' + error.message); return; }

      loadPositionsAndCandidates();
    });
  });

  document.querySelectorAll('.delete-candidate-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this candidate?')) return;
      const candidateId = btn.dataset.candidateId;
      const { error } = await supabase.from('candidates').delete().eq('id', candidateId);
      if (error) { alert('Error deleting candidate: ' + error.message); return; }
      loadPositionsAndCandidates();
    });
  });

  document.querySelectorAll('.add-candidate-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const positionId = btn.dataset.positionId;
      const formDiv = document.querySelector(`.add-candidate-form[data-position-id="${positionId}"]`);
      const nameInput = formDiv.querySelector('.candidate-name-input');
      const photoInput = formDiv.querySelector('.candidate-photo-input');
      const bioInput = formDiv.querySelector('.candidate-bio-input');

      const full_name = nameInput.value.trim();
      if (!full_name) { alert('Please enter candidate name.'); return; }

      let photo_url = null;
      const file = photoInput.files[0];
      if (file) {
        const filePath = `candidates/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('branding').upload(filePath, file);
        if (uploadError) { alert('Photo upload failed: ' + uploadError.message); return; }
        const { data: urlData } = supabase.storage.from('branding').getPublicUrl(filePath);
        photo_url = urlData.publicUrl;
      }

      const { error } = await supabase.from('candidates').insert({
        position_id: positionId,
        full_name,
        bio: bioInput.value.trim() || null,
        photo_url,
      });

      if (error) { alert('Error adding candidate: ' + error.message); return; }

      loadPositionsAndCandidates();
    });
  });
}

document.getElementById('add-position-btn')?.addEventListener('click', async () => {
  const titleInput = document.getElementById('new-position-title');
  const title = titleInput.value.trim();
  if (!title) { alert('Please enter a position title.'); return; }

  const { error } = await supabase.from('positions').insert({ title });
  if (error) { alert('Error adding position: ' + error.message); return; }

  titleInput.value = '';
  loadPositionsAndCandidates();
});

// Load positions on page load
loadPositionsAndCandidates();

// --- Results & Publish Toggle ---

let currentSettingsRow = null;

async function loadPublishStatus() {
  const { data, error } = await supabase
    .from('election_settings')
    .select('*')
    .limit(1)
    .single();

  const label = document.getElementById('publish-status-label');
  const btn = document.getElementById('toggle-publish-btn');
  const panel = document.getElementById('publish-panel');

  if (error || !data) {
    label.textContent = 'No election settings found.';
    btn.textContent = 'N/A';
    btn.disabled = true;
    return;
  }

  currentSettingsRow = data;

  if (data.results_published) {
    label.textContent = 'Published — students can see results';
    btn.textContent = 'Unpublish Results';
    panel.classList.add('is-published');
  } else {
    label.textContent = 'Not published — students cannot see results yet';
    btn.textContent = 'Publish Results';
    panel.classList.remove('is-published');
  }
}

document.getElementById('toggle-publish-btn')?.addEventListener('click', async () => {
  if (!currentSettingsRow) return;

  const newValue = !currentSettingsRow.results_published;

  const { error } = await supabase
    .from('election_settings')
    .update({ results_published: newValue })
    .eq('id', currentSettingsRow.id);

  if (error) {
    alert('Error updating publish status: ' + error.message);
    return;
  }

  await loadPublishStatus();
});

async function loadAdminResults() {
  const { data, error } = await supabase.rpc('get_results');
  const container = document.getElementById('results-chart-container');

  if (error) {
    container.innerHTML = `<p class="status-msg error">Error loading results: ${error.message}</p>`;
    return;
  }

  renderResultsChart(container, data);
}

loadPublishStatus();
loadAdminResults();

// admin-ui.js — layout behaviour only (sidebar drawer + tab switching).
// Does not touch Supabase, auth, or data logic — that all stays in admin.js.

(function () {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburgerBtn');
  const links = Array.from(document.querySelectorAll('.sidebar-link'));
  const sections = links
    .map(link => document.getElementById(link.dataset.section))
    .filter(Boolean);

  // Mark the app as JS-driven so CSS hides all sections except the active one.
  // (If this script fails to load, the CSS default keeps every section visible.)
  document.body.classList.add('js-tabs-ready');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    hamburger.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  hamburger?.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  overlay?.addEventListener('click', closeSidebar);

  function showSection(targetId, updateHash) {
    sections.forEach(section => {
      section.classList.toggle('active-panel', section.id === targetId);
    });
    links.forEach(link => {
      link.classList.toggle('active', link.dataset.section === targetId);
    });
    if (updateHash && history.pushState) {
      history.pushState(null, '', '#' + targetId);
    }
    // Scroll back to the top of the content area when switching tabs.
    document.querySelector('.dashboard-content')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showSection(link.dataset.section, true);
      closeSidebar();
    });
  });

  // Respect a deep link like admin.html#positions-section, otherwise default
  // to the first tab (Branding).
  const hashId = window.location.hash ? window.location.hash.slice(1) : null;
  const firstId = sections[0] && sections[0].id;
  const initialId = sections.some(s => s.id === hashId) ? hashId : firstId;
  if (initialId) showSection(initialId, false);

  // Support browser back/forward between tabs.
  window.addEventListener('popstate', () => {
    const id = window.location.hash ? window.location.hash.slice(1) : firstId;
    if (sections.some(s => s.id === id)) showSection(id, false);
  });
})();