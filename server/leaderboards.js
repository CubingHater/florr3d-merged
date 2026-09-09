import { getAccount, guildList, isDeveloper, leaderboardRows, playerLeaderboardStats, db } from './db.js';
import { isDiscordAccount } from './auth.js';

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; if (raw.length > 8_000) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve(null); } });
  req.on('error', () => resolve(null));
});
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const linked = (accountId, res) => {
  if (!accountId || !isDiscordAccount(accountId)) { json(res, 401, { error: 'Sign in with Discord to use leaderboards and guilds.' }); return false; }
  return true;
};

export async function handleLeaderboardApi(req, res, url, accountId) {
  if (!url.pathname.startsWith('/api/')) return false;
  const period = ['all', 'daily', 'weekly'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'all';
  if (req.method === 'GET' && url.pathname === '/api/leaderboards') {
    return json(res, 200, { period, rows: leaderboardRows(period), me: accountId && isDiscordAccount(accountId) ? playerLeaderboardStats(accountId, period) : null }), true;
  }
  if (req.method === 'GET' && url.pathname === '/api/guilds') return json(res, 200, { guilds: guildList() }), true;
  if (req.method === 'GET' && url.pathname === '/api/guilds/me') {
    if (!linked(accountId, res)) return true;
    const membership = db.prepare('SELECT g.*,gm.role,a.username AS leader FROM guild_members gm JOIN guilds g ON g.id=gm.guild_id JOIN accounts a ON a.id=g.leader_account_id WHERE gm.account_id=?').get(accountId);
    if (!membership) return json(res, 200, { guild: null }), true;
    const applications = membership.role === 'leader'
      ? db.prepare("SELECT ga.id,ga.message,a.username FROM guild_applications ga JOIN accounts a ON a.id=ga.account_id WHERE ga.guild_id=? AND ga.status='pending' ORDER BY ga.created_at").all(membership.id) : [];
    return json(res, 200, { guild: membership, applications }), true;
  }
  if (req.method === 'POST' && url.pathname === '/api/guilds') {
    if (!linked(accountId, res)) return true;
    const body = await readBody(req); if (!body) return json(res, 400, { error: 'Invalid request.' }), true;
    const name = text(body.name, 32), tag = text(body.tag, 5).toUpperCase(), description = text(body.description, 280);
    if (name.length < 3 || tag.length < 2) return json(res, 400, { error: 'A guild needs a 3+ character name and a 2+ character tag.' }), true;
    try {
      const result = db.prepare('INSERT INTO guilds (name,tag,description,requirements,discord_url,leader_account_id,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(name, tag, description, text(body.requirements, 200), text(body.discordUrl, 200), accountId, Date.now());
      const guildId = Number(result.lastInsertRowid);
      db.prepare("INSERT INTO guild_members (guild_id,account_id,role,joined_at) VALUES (?,?,'leader',?)").run(guildId, accountId, Date.now());
      return json(res, 201, { ok: true, pendingApproval: true, guildId }), true;
    } catch { return json(res, 409, { error: 'That guild name or tag is already in use.' }), true; }
  }
  const match = url.pathname.match(/^\/api\/guilds\/(\d+)\/(apply|applications|decision)$/);
  if (match) {
    if (!linked(accountId, res)) return true;
    const guildId = Number(match[1]), action = match[2];
    if (action === 'apply' && req.method === 'POST') {
      const body = await readBody(req); const message = text(body?.message, 500);
      const guild = db.prepare('SELECT id FROM guilds WHERE id=? AND approved=1').get(guildId);
      if (!guild) return json(res, 404, { error: 'Guild not found.' }), true;
      try { db.prepare('INSERT INTO guild_applications (guild_id,account_id,message,created_at) VALUES (?,?,?,?)').run(guildId, accountId, message, Date.now()); }
      catch { return json(res, 409, { error: 'You already have an application for this guild.' }), true; }
      return json(res, 201, { ok: true }), true;
    }
    const owner = db.prepare('SELECT leader_account_id FROM guilds WHERE id=?').get(guildId);
    if (!owner || owner.leader_account_id !== accountId) return json(res, 403, { error: 'Only this guild leader can do that.' }), true;
    if (action === 'applications' && req.method === 'GET') {
      const rows = db.prepare("SELECT ga.id,ga.message,ga.created_at,a.username,ga.status FROM guild_applications ga JOIN accounts a ON a.id=ga.account_id WHERE ga.guild_id=? AND ga.status='pending' ORDER BY ga.created_at").all(guildId);
      return json(res, 200, { applications: rows }), true;
    }
    if (action === 'decision' && req.method === 'POST') {
      const body = await readBody(req); const application = db.prepare("SELECT * FROM guild_applications WHERE id=? AND guild_id=? AND status='pending'").get(Number(body?.applicationId), guildId);
      if (!application) return json(res, 404, { error: 'Application not found.' }), true;
      const accept = body?.accept === true;
      const run = db.transaction(() => {
        db.prepare('UPDATE guild_applications SET status=? WHERE id=?').run(accept ? 'accepted' : 'rejected', application.id);
        if (accept) { db.prepare('DELETE FROM guild_members WHERE account_id=?').run(application.account_id); db.prepare("INSERT INTO guild_members (guild_id,account_id,role,joined_at) VALUES (?,?,'member',?)").run(guildId, application.account_id, Date.now()); }
      }); run(); return json(res, 200, { ok: true }), true;
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/developer/guilds') {
    if (!linked(accountId, res)) return true;
    if (!isDeveloper(accountId)) return json(res, 403, { error: 'Developer access required.' }), true;
    return json(res, 200, { guilds: db.prepare('SELECT g.*,a.username AS leader FROM guilds g JOIN accounts a ON a.id=g.leader_account_id WHERE g.approved=0 ORDER BY g.created_at').all() }), true;
  }
  const admin = url.pathname.match(/^\/api\/developer\/guilds\/(\d+)\/approve$/);
  if (admin && req.method === 'POST') {
    if (!linked(accountId, res)) return true;
    if (!isDeveloper(accountId)) return json(res, 403, { error: 'Developer access required.' }), true;
    db.prepare('UPDATE guilds SET approved=1 WHERE id=?').run(Number(admin[1])); return json(res, 200, { ok: true }), true;
  }
  return false;
}
