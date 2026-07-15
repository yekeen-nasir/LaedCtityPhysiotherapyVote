// Groups flat rows from get_results() RPC into { position_id, position_title, candidates: [...] }
// and renders a bar chart into the given container element.
export function renderResultsChart(container, rows) {
  container.innerHTML = '';

  if (!rows || rows.length === 0) {
    container.innerHTML = '<p class="empty-note">No results to display yet.</p>';
    return;
  }

  // Group by position
  const positionsMap = new Map();
  rows.forEach(row => {
    if (!positionsMap.has(row.position_id)) {
      positionsMap.set(row.position_id, {
        title: row.position_title,
        candidates: [],
      });
    }
    positionsMap.get(row.position_id).candidates.push({
      name: row.candidate_name,
      votes: Number(row.vote_count),
    });
  });

  positionsMap.forEach(position => {
    const totalVotes = position.candidates.reduce((sum, c) => sum + c.votes, 0);
    const sorted = [...position.candidates].sort((a, b) => b.votes - a.votes);
    const topVotes = sorted.length > 0 ? sorted[0].votes : 0;
    // Only mark a leader when there's at least one vote and no tie at the top
    const hasSoleLeader = totalVotes > 0 && sorted.filter(c => c.votes === topVotes).length === 1;

    const block = document.createElement('div');
    block.className = 'results-position-card';

    let rowsHtml = '';
    sorted.forEach(c => {
      const pct = totalVotes > 0 ? Math.round((c.votes / totalVotes) * 100) : 0;
      const isLeading = hasSoleLeader && c.votes === topVotes;

      rowsHtml += `
        <div class="results-row${isLeading ? ' leading' : ''}">
          <div class="results-row-top">
            <span class="results-candidate-name">
              ${c.name}
              ${isLeading ? '<span class="badge-leading">Leading</span>' : ''}
            </span>
            <span class="results-vote-count">${c.votes} vote${c.votes === 1 ? '' : 's'} · ${pct}%</span>
          </div>
          <div class="results-bar-track">
            <div class="results-bar-fill" style="width:${pct}%;"></div>
          </div>
        </div>`;
    });

    block.innerHTML = `
      <h3>${position.title}</h3>
      <p class="results-total">Total votes: ${totalVotes}</p>
      ${rowsHtml}
    `;

    container.appendChild(block);
  });
}