import { apiUrl } from './api.js';

const escape = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[c]));
const number = (value) => Math.round(Number(value) || 0).toLocaleString();
const periods = [['all', 'Global'], ['daily', 'Daily'], ['weekly', 'Weekly']];

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export function initSocial() {
  const leaderboardModal = document.getElementById('socialModal');
  const leaderboardContent = document.getElementById('socialContent');
  const guildModal = document.getElementById('guildModal');
  const guildContent = document.getElementById('guildContent');
  let period = 'all';
  let leaderboardTab = 'global';
  let guildTab = 'leaderboard';

  const close = (modal) => modal.classList.remove('show');
  const periodButtons = () => `<div class="social-periods">${periods.map(([id, label]) =>
    `<button class="social-period ${period === id ? 'active' : ''}" data-period="${id}">${label}</button>`).join('')}</div>`;
  const error = (message) => `<p class="social-note social-error">${escape(message)}</p>`;
  const bindPeriods = (rerender) => leaderboardModal.querySelectorAll('[data-period], #guildContent [data-period]')
    .forEach((button) => { button.onclick = () => { period = button.dataset.period; rerender(); }; });

  async function appendDeveloperPanel() {
    const data = await request('/api/developer/guilds').catch(() => null);
    if (!data) return;
    guildContent.insertAdjacentHTML('beforeend', `<section class="guild-card"><h3>Developer approval queue</h3>${data.guilds.length ? data.guilds.map((guild) => `<p><strong>[${escape(guild.tag)}] ${escape(guild.name)}</strong> — submitted by ${escape(guild.leader)}<br><button class="guild-action" data-approve="${guild.id}">Approve guild</button></p>`).join('') : '<p>No guilds are waiting for approval.</p>'}</section>`);
    guildContent.querySelectorAll('[data-approve]').forEach((button) => { button.onclick = async () => { try { await request(`/api/developer/guilds/${button.dataset.approve}/approve`, { method: 'POST', body: '{}' }); renderGuild(); } catch (err) { alert(err.message); } }; });
  }

  async function renderLeaderboard() {
    leaderboardContent.innerHTML = '<p class="social-note">Loading leaderboard…</p>';
    try {
      const data = await request(`/api/leaderboards?period=${period}`);
      document.querySelectorAll('[data-social-tab]').forEach((button) => button.classList.toggle('active', button.dataset.socialTab === leaderboardTab));
      if (leaderboardTab === 'global') {
        leaderboardContent.innerHTML = `${periodButtons()}<p class="social-note">Global rank is the average of all category ranks. Only Discord-linked players appear here.</p><div class="leaderboard-list">${data.rows.length ? data.rows.map((row) => `<div class="leader-row"><strong>#${row.globalRank}</strong><span>${escape(row.username)}</span><span>${row.guild ? escape(row.guild) : 'No guild'}</span></div>`).join('') : '<p class="social-note">No Discord-linked players have stats for this period yet.</p>'}</div>`;
      } else if (!data.me) {
        leaderboardContent.innerHTML = `${error('Sign in with Discord to view your private stats.')}`;
      } else {
        const metrics = [
          ['Playtime', 'play_seconds', 'h'], ['Damage dealt', 'damage', ''],
          ['Crafting attempts', 'craft_points', ' pts'], ['Kill messages', 'kill_points', ' pts'],
          ['Obtained petals', 'drop_points', ' pts'],
        ];
        leaderboardContent.innerHTML = `<p class="social-note">Your private standings for ${periods.find(([id]) => id === period)[1]}. Global rank: #${data.me.globalRank ?? '—'}.</p><div class="leaderboard-list"><div class="leader-row stats-row"><strong>Category</strong><span>Your total</span><span>Your rank</span></div>${metrics.map(([label, key, suffix]) => {
          const value = key === 'play_seconds' ? `${Math.round(data.me[key] / 360) / 10} h` : `${number(data.me[key])}${suffix}`;
          return `<div class="leader-row stats-row"><strong>${label}</strong><span>${value}</span><span>#${data.me.categoryRanks?.[key] ?? '—'}</span></div>`;
        }).join('')}</div>`;
      }
      bindPeriods(renderLeaderboard);
    } catch (err) { leaderboardContent.innerHTML = error(err.message); }
  }

  async function renderGuild() {
    guildContent.innerHTML = '<p class="social-note">Loading guilds…</p>';
    try {
      document.querySelectorAll('[data-guild-tab]').forEach((button) => button.classList.toggle('active', button.dataset.guildTab === guildTab));
      if (guildTab === 'leaderboard') {
        const data = await request('/api/guilds');
        guildContent.innerHTML = `<p class="social-note">Guild score is based on the average member leaderboard score.</p><div class="leaderboard-list">${data.guilds.length ? data.guilds.map((guild, index) => `<div class="leader-row"><strong>#${index + 1}</strong><span>[${escape(guild.tag)}] ${escape(guild.name)}</span><span>${number(guild.score)} score · ${guild.members} members</span></div>`).join('') : '<p class="social-note">There are no approved guilds yet.</p>'}</div>`;
        await appendDeveloperPanel();
        return;
      }
      await appendDeveloperPanel();
      const [list, mine] = await Promise.all([request('/api/guilds'), request('/api/guilds/me')]);
      if (mine.guild) {
        const guild = mine.guild;
        guildContent.innerHTML = `<section class="guild-card"><h3>[${escape(guild.tag)}] ${escape(guild.name)}</h3><p>Leader: ${escape(guild.leader || '—')} · Your role: ${escape(guild.role)}.</p>${guild.description ? `<p>${escape(guild.description)}</p>` : ''}${guild.discord_url ? `<a class="guild-link" href="${escape(guild.discord_url)}" target="_blank" rel="noopener">Open Discord server</a>` : ''}</section>${guild.role === 'leader' ? `<section class="guild-card"><h3>Applications</h3>${mine.applications.length ? mine.applications.map((application) => `<p><strong>${escape(application.username)}</strong>: ${escape(application.message || 'No message.')}<br><button class="guild-action" data-decision="${application.id}" data-accept="true">Accept</button> <button class="guild-action" data-decision="${application.id}" data-accept="false">Reject</button></p>`).join('') : '<p>No pending applications.</p>'}</section>` : ''}`;
        guildContent.querySelectorAll('[data-decision]').forEach((button) => { button.onclick = async () => { try { await request(`/api/guilds/${guild.id}/decision`, { method: 'POST', body: JSON.stringify({ applicationId: Number(button.dataset.decision), accept: button.dataset.accept === 'true' }) }); renderGuild(); } catch (err) { alert(err.message); } }; });
      } else {
        guildContent.innerHTML = `<p class="social-note">Choose an approved guild to apply, or create one for developer approval.</p><div class="guild-grid">${list.guilds.map((guild) => `<article class="guild-card"><h3>[${escape(guild.tag)}] ${escape(guild.name)}</h3><p>Leader: ${escape(guild.leader)} · ${guild.members} members · ${number(guild.score)} score</p><p>${escape(guild.requirements || 'No requirement set.')}</p><button class="guild-action" data-apply="${guild.id}">Apply to join</button></article>`).join('')}</div><h3>Start a guild</h3><form class="social-form" id="guildStart"><input name="name" required minlength="3" maxlength="32" placeholder="Guild name"><input name="tag" required minlength="2" maxlength="5" placeholder="Guild tag"><textarea name="description" maxlength="280" placeholder="Guild description"></textarea><input name="requirements" maxlength="200" placeholder="Requirement to apply"><input name="discordUrl" maxlength="200" placeholder="Discord server link"><button>Create guild</button></form>`;
        guildContent.querySelectorAll('[data-apply]').forEach((button) => { button.onclick = async () => { const message = prompt('Short application message:'); if (message === null) return; try { await request(`/api/guilds/${button.dataset.apply}/apply`, { method: 'POST', body: JSON.stringify({ message }) }); alert('Application sent.'); } catch (err) { alert(err.message); } }; });
        guildContent.querySelector('#guildStart').onsubmit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await request('/api/guilds', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }); alert('Guild submitted for developer approval.'); renderGuild(); } catch (err) { alert(err.message); } };
      }
    } catch (err) { guildContent.innerHTML = error(err.message); }
  }

  document.getElementById('leaderboardBtn').onclick = () => { leaderboardModal.classList.add('show'); renderLeaderboard(); };
  document.getElementById('guildBtn').onclick = () => { guildModal.classList.add('show'); renderGuild(); };
  document.getElementById('socialClose').onclick = () => close(leaderboardModal);
  document.getElementById('guildClose').onclick = () => close(guildModal);
  leaderboardModal.onclick = (event) => { if (event.target === leaderboardModal) close(leaderboardModal); };
  guildModal.onclick = (event) => { if (event.target === guildModal) close(guildModal); };
  document.querySelectorAll('[data-social-tab]').forEach((button) => { button.onclick = () => { leaderboardTab = button.dataset.socialTab; renderLeaderboard(); }; });
  document.querySelectorAll('[data-guild-tab]').forEach((button) => { button.onclick = () => { guildTab = button.dataset.guildTab; renderGuild(); }; });
}
