import { supabase } from './supabase-client.js';

const statusMessageEl = document.getElementById('election-status-message');
const positionsContainer = document.getElementById('positions-container');
const progressPanel = document.getElementById('progress-panel');
const progressLabel = document.getElementById('progress-label');
const progressRingFill = document.getElementById('progress-ring-fill');

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
    document.title = `Cast Your Vote — ${data.name}`;
  }
  if (data.logo_url) {
    document.getElementById('brand-logo').src = data.logo_url;
  }
}
loadBranding();

function setStatus(message, type = '') {
  statusMessageEl.textContent = message;
  statusMessageEl.className = type ? `status-msg ${type}` : 'status-msg';
}

function updateProgress(votedCount, totalCount) {
  if (totalCount === 0) {
    progressPanel.style.display = 'none';
    return;
  }
  progressPanel.style.display = 'flex';
  progressLabel.textContent = `${votedCount} / ${totalCount} positions voted`;
  const percent = (votedCount / totalCount) * 100;
  progressRingFill.style.strokeDashoffset = String(100 - percent);
}

async function init() {
  // 1. Check voting window
  const { data: settings, error: settingsError } = await supabase
    .from('election_settings')
    .select('*')
    .limit(1)
    .single();

  if (settingsError || !settings) {
    setStatus('Voting is not currently configured. Please contact an admin.', 'error');
    return;
  }

  const now = new Date();
  const start = settings.voting_start ? new Date(settings.voting_start) : null;
  const end = settings.voting_end ? new Date(settings.voting_end) : null;

  if (start && now < start) {
    setStatus(`Voting has not started yet. It opens on ${start.toLocaleString()}.`);
    return;
  }
  if (end && now > end) {
    setStatus('Voting has closed.');
    return;
  }

  setStatus('');

  // 2. Load positions + candidates, in the order the admin created them
  const { data: positions, error: posError } = await supabase
    .from('positions')
    .select('*, candidates(*)')
    .order('created_at', { ascending: true })
    .order('created_at', { ascending: true, foreignTable: 'candidates' });

  if (posError) {
    setStatus('Error loading positions: ' + posError.message, 'error');
    return;
  }

  // 3. Find out which positions this student already voted for.
  const { data: votedRows, error: votedError } = await supabase.rpc('get_voted_positions');

  if (votedError) {
    setStatus('Error checking voting status: ' + votedError.message, 'error');
    return;
  }

  const votedSet = new Set(
    (votedRows || []).map(row => (typeof row === 'object' && row !== null) ? Object.values(row)[0] : row)
  );

  updateProgress(votedSet.size, positions.length);
  renderPositions(positions, votedSet);
}

function renderPositions(positions, votedSet) {
  positionsContainer.innerHTML = '';

  if (!positions || positions.length === 0) {
    positionsContainer.innerHTML = '<p class="empty-note">No positions have been set up yet.</p>';
    return;
  }

  positions.forEach(position => {
    const block = document.createElement('div');
    const alreadyVoted = votedSet.has(position.id);
    block.className = `position-card${alreadyVoted ? ' voted' : ''}`;

    if (alreadyVoted) {
      block.innerHTML = `
        <div class="position-card-header">
          <h3>${position.title}</h3>
          <span class="badge badge-voted">Voted</span>
        </div>
        <p class="empty-note">You've already voted for this position.</p>`;
      positionsContainer.appendChild(block);
      return;
    }

    const candidates = position.candidates || [];

    if (candidates.length === 0) {
      block.innerHTML = `
        <div class="position-card-header"><h3>${position.title}</h3></div>
        <p class="empty-note">No candidates have been added for this position yet.</p>`;
      positionsContainer.appendChild(block);
      return;
    }

    let candidatesHtml = '';
    candidates.forEach(c => {
      candidatesHtml += `
        <label class="candidate-option">
          <input type="radio" name="position-${position.id}" value="${c.id}">
          ${c.photo_url
            ? `<img class="candidate-photo" src="${c.photo_url}" alt="${c.full_name}">`
            : `<div class="candidate-photo"></div>`}
          <div class="candidate-info">
            <span class="candidate-name">${c.full_name}</span>
            ${c.bio ? `<span class="candidate-bio">${c.bio}</span>` : ''}
          </div>
        </label>`;
    });

    block.innerHTML = `
      <div class="position-card-header"><h3>${position.title}</h3></div>
      <form class="vote-form" data-position-id="${position.id}">
        <div class="candidate-list">${candidatesHtml}</div>
        <button type="submit" class="btn-primary">Submit Vote</button>
        <p class="status-msg vote-status"></p>
      </form>
    `;

    positionsContainer.appendChild(block);
  });

  attachVoteFormEvents();
}

function attachVoteFormEvents() {
  // Toggle a .selected class on the chosen candidate card
  document.querySelectorAll('.candidate-option input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const name = radio.name;
      document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
        r.closest('.candidate-option').classList.toggle('selected', r.checked);
      });
    });
  });

  document.querySelectorAll('.vote-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const positionId = form.dataset.positionId;
      const statusEl = form.querySelector('.vote-status');
      const selected = form.querySelector(`input[name="position-${positionId}"]:checked`);
      const submitBtn = form.querySelector('button[type="submit"]');

      if (!selected) {
        statusEl.textContent = 'Please select a candidate.';
        statusEl.className = 'status-msg vote-status error';
        return;
      }

      submitBtn.disabled = true;
      const candidateId = selected.value;
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('votes').insert({
        student_id: user.id,
        position_id: positionId,
        candidate_id: candidateId,
      });

      if (error) {
        submitBtn.disabled = false;
        if (error.code === '23505') {
          statusEl.textContent = 'You have already voted for this position.';
        } else {
          statusEl.textContent = 'Error submitting vote: ' + error.message;
        }
        statusEl.className = 'status-msg vote-status error';
        return;
      }

      const card = form.closest('.position-card');
      const positionTitle = card.querySelector('h3').textContent;
      card.classList.add('voted');
      card.innerHTML = `
        <div class="position-card-header">
          <h3>${positionTitle}</h3>
          <span class="badge badge-voted">Voted</span>
        </div>
        <p class="empty-note">Vote submitted successfully.</p>`;

      // Refresh the progress ring
      const totalCards = document.querySelectorAll('.position-card').length;
      const votedCards = document.querySelectorAll('.position-card.voted').length;
      updateProgress(votedCards, totalCards);
    });
  });
}

init();   