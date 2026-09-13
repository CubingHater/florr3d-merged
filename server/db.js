import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const DB_PATH = process.env.DB_PATH
  || fileURLToPath(new URL('../accounts.db', import.meta.url));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL'); // Faster than FULL but still safe
db.pragma('cache_size = -64000'); // 64MB cache for better performance
db.pragma('temp_store = MEMORY'); // Store temporary tables in memory

// One-time migration for DBs created before guest accounts existed:
// discord_id used to be UNIQUE NOT NULL, which made it impossible to
// store a guest row (no discord id). Rebuild the table with discord_id
// nullable and a new guest_id column if that's still the old shape.
function migrateLegacySchema() {
  const info = db.prepare('PRAGMA table_info(accounts)').all();
  if (info.length === 0) return; // no existing table — CREATE TABLE below handles it
  const hasGuestId = info.some((c) => c.name === 'guest_id');
  const discordCol = info.find((c) => c.name === 'discord_id');
  const discordIsNotNull = discordCol?.notnull === 1;
  if (hasGuestId && !discordIsNotNull) return; // already on the new shape

  console.log('db: migrating accounts table to support guest saves…');
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE accounts_new (
        id         INTEGER PRIMARY KEY,
        discord_id TEXT UNIQUE,
        guest_id   TEXT UNIQUE,
        username   TEXT NOT NULL,
        avatar     TEXT,
        save       TEXT,
        created_at INTEGER NOT NULL,
        last_seen  INTEGER NOT NULL
      );
    `);
    db.exec(`
      INSERT INTO accounts_new (id, discord_id, username, avatar, save, created_at, last_seen)
      SELECT id, discord_id, username, avatar, save, created_at, last_seen FROM accounts;
    `);
    db.exec('DROP TABLE accounts');
    db.exec('ALTER TABLE accounts_new RENAME TO accounts');
  });
  migrate();
  console.log('db: migration complete');
}

migrateLegacySchema();

// Migration for inventory column
function migrateInventoryColumn() {
  try {
    const info = db.prepare('PRAGMA table_info(accounts)').all();
    const hasInventory = info.some((c) => c.name === 'inventory');
    if (hasInventory) return;

    console.log('db: adding inventory column to accounts table…');
    db.exec('ALTER TABLE accounts ADD COLUMN inventory TEXT');
    console.log('db: inventory column added');
  } catch (error) {
    // Table might not exist yet during build
    console.log('db: inventory migration skipped (table may not exist yet)');
  }
}

migrateInventoryColumn();

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id         INTEGER PRIMARY KEY,
    discord_id TEXT UNIQUE,
    guest_id   TEXT UNIQUE,
    username   TEXT NOT NULL,
    avatar     TEXT,
    save       TEXT,
    inventory  TEXT,
    created_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
  );
`);

// Generic key-value store for admin-tunable gameplay settings (drop rates,
// sacrifice spawn weights, etc.) so they survive a server restart instead of
// silently resetting to the hardcoded defaults.
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Leaderboard data deliberately lives outside a player's save. Saves can be
// merged or replaced; competitive history must remain permanent.
db.exec(`
  CREATE TABLE IF NOT EXISTS leaderboard_stats (
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    period_key TEXT NOT NULL,
    play_seconds REAL NOT NULL DEFAULT 0,
    damage REAL NOT NULL DEFAULT 0,
    craft_points INTEGER NOT NULL DEFAULT 0,
    kill_points INTEGER NOT NULL DEFAULT 0,
    drop_points INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, period, period_key)
  );
  CREATE INDEX IF NOT EXISTS idx_leaderboard_period ON leaderboard_stats(period, period_key);
  CREATE INDEX IF NOT EXISTS idx_leaderboard_account ON leaderboard_stats(account_id);
  CREATE TABLE IF NOT EXISTS guilds (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    requirements TEXT NOT NULL DEFAULT '',
    discord_url TEXT NOT NULL DEFAULT '',
    leader_account_id INTEGER NOT NULL REFERENCES accounts(id),
    approved INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guild_members (
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, account_id),
    UNIQUE(account_id)
  );
  CREATE TABLE IF NOT EXISTS guild_applications (
    id INTEGER PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    UNIQUE(guild_id, account_id)
  );
`);
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

export function getSetting(key) {
  const row = getSettingStmt.get(key);
  if (!row) return undefined;
  try { return JSON.parse(row.value); } catch { return undefined; }
}

export function setSetting(key, value) {
  setSettingStmt.run(key, JSON.stringify(value));
}

const upsertStmt = db.prepare(`
  INSERT INTO accounts (discord_id, username, avatar, created_at, last_seen)
  VALUES (@discordId, @username, @avatar, @now, @now)
  ON CONFLICT(discord_id) DO UPDATE SET
    username = @username, avatar = @avatar, last_seen = @now
  RETURNING id, discord_id AS discordId, username, avatar, save, inventory
`);
const upsertGuestStmt = db.prepare(`
  INSERT INTO accounts (guest_id, username, created_at, last_seen)
  VALUES (@guestId, @username, @now, @now)
  ON CONFLICT(guest_id) DO UPDATE SET last_seen = @now
  RETURNING id, discord_id AS discordId, username, avatar, save, inventory
`);
const getStmt = db.prepare(
  'SELECT id, discord_id AS discordId, username, avatar, save, inventory FROM accounts WHERE id = ?',
);
const getFullStmt = db.prepare(
  'SELECT id, discord_id, guest_id, username, avatar, save, inventory, last_seen FROM accounts WHERE id = ?',
);
const saveStmt = db.prepare('UPDATE accounts SET save = ?, last_seen = ? WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM accounts WHERE id = ?');
const searchStmt = db.prepare(`
  SELECT id, discord_id, username, avatar, last_seen
  FROM accounts
  WHERE discord_id IS NOT NULL
    AND (LOWER(username) LIKE @q OR discord_id LIKE @q)
  ORDER BY last_seen DESC
  LIMIT @limit
`);

export function upsertAccount({ discordId, username, avatar }) {
  const account = upsertStmt.get({ discordId, username, avatar, now: Date.now() });
  ensureLeaderboardRows(account.id);
  return account;
}

// Creates (or refreshes) an anonymous account for a guest player who
// isn't signed in with Discord. guestId only needs to be unique at
// creation time — once a session cookie is issued, that cookie is what
// actually identifies the account on future requests, not guestId itself.
export function upsertGuestAccount({ guestId, username }) {
  return upsertGuestStmt.get({ guestId, username, now: Date.now() });
}

export function getAccount(id) {
  return getStmt.get(id) ?? null;
}

const LEADERBOARD_COLUMNS = new Set(['play_seconds', 'damage', 'craft_points', 'kill_points', 'drop_points']);

// Calendar buckets use North American Central time (including daylight-saving
// changes), as requested. Keys are dates, so historical daily/weekly boards
// never change when the server's own timezone changes.
export function leaderboardPeriodKeys(at = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date(at)).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const dates = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  dates.setUTCDate(dates.getUTCDate() - ((weekday + 6) % 7));
  const week = dates.toISOString().slice(0, 10);
  return { all: 'all', daily: day, weekly: week };
}

const addLeaderboardStatStmt = db.prepare(`
  INSERT INTO leaderboard_stats (account_id, period, period_key, play_seconds, damage, craft_points, kill_points, drop_points)
  VALUES (@accountId, @period, @periodKey, 0, 0, 0, 0, 0)
  ON CONFLICT(account_id, period, period_key) DO NOTHING
`);
function ensureLeaderboardRows(accountId, at = Date.now()) {
  for (const [period, periodKey] of Object.entries(leaderboardPeriodKeys(at))) {
    addLeaderboardStatStmt.run({ accountId, period, periodKey });
  }
}
export function addLeaderboardStat(accountId, column, value, at = Date.now()) {
  if (!Number.isInteger(accountId) || !LEADERBOARD_COLUMNS.has(column) || !(Number(value) > 0)) return;
  const keys = leaderboardPeriodKeys(at);
  const write = db.transaction(() => {
    for (const [period, periodKey] of Object.entries(keys)) {
      addLeaderboardStatStmt.run({ accountId, period, periodKey });
      db.prepare(`UPDATE leaderboard_stats SET ${column} = ${column} + ? WHERE account_id = ? AND period = ? AND period_key = ?`)
        .run(Number(value), accountId, period, periodKey);
    }
  });
  write();
}

export function leaderboardRows(period = 'all', limit = 100) {
  const keys = leaderboardPeriodKeys();
  const periodKey = keys[period] || keys.all;
  
  // Optimized query with proper ordering and limiting
  const rows = db.prepare(`
    SELECT a.id, a.username, COALESCE(g.name, '') AS guild,
      s.play_seconds, s.damage, s.craft_points, s.kill_points, s.drop_points
    FROM leaderboard_stats s
    JOIN accounts a ON a.id = s.account_id AND a.discord_id IS NOT NULL
    LEFT JOIN guild_members gm ON gm.account_id = a.id
    LEFT JOIN guilds g ON g.id = gm.guild_id AND g.approved = 1
    WHERE s.period = ? AND s.period_key = ?
    ORDER BY s.damage DESC
    LIMIT ?
  `).all(period, periodKey, Math.min(Math.max(limit, 1), 10_000));
  
  const metrics = ['play_seconds', 'damage', 'craft_points', 'kill_points', 'drop_points'];
  const ranks = new Map(rows.map((r) => [r.id, []]));
  
  for (const metric of metrics) {
    const sorted = [...rows].sort((a, b) => b[metric] - a[metric] || a.username.localeCompare(b.username));
    let last = null, rank = 0;
    sorted.forEach((r, i) => {
      if (last === null || r[metric] !== last) rank = i + 1;
      ranks.get(r.id).push(rank); last = r[metric];
    });
  }
  
  return rows.map((r) => ({ ...r, globalRank: Math.round(ranks.get(r.id).reduce((a, b) => a + b, 0) / metrics.length) }))
    .sort((a, b) => a.globalRank - b.globalRank || a.username.localeCompare(b.username));
}

export function playerLeaderboardStats(accountId, period = 'all') {
  const keys = leaderboardPeriodKeys();
  const stats = db.prepare(`SELECT play_seconds, damage, craft_points, kill_points, drop_points FROM leaderboard_stats WHERE account_id=? AND period=? AND period_key=?`)
    .get(accountId, period, keys[period] || keys.all) || { play_seconds: 0, damage: 0, craft_points: 0, kill_points: 0, drop_points: 0 };
  
  // Cache leaderboard rows to avoid fetching multiple times
  const rows = leaderboardRows(period, 10000);
  const rank = rows.find((r) => r.id === accountId)?.globalRank ?? null;
  
  const categoryRanks = {};
  for (const metric of ['play_seconds', 'damage', 'craft_points', 'kill_points', 'drop_points']) {
    const sorted = [...rows].sort((a, b) => b[metric] - a[metric] || a.username.localeCompare(b.username));
    const mine = sorted.findIndex((row) => row.id === accountId);
    if (mine < 0) { categoryRanks[metric] = null; continue; }
    const value = sorted[mine][metric];
    categoryRanks[metric] = sorted.findIndex((row) => row[metric] === value) + 1;
  }
  return { ...stats, globalRank: rank, categoryRanks };
}

export function isDeveloper(accountId) {
  // Default owner ID keeps the future guild-approval path configured even
  // while its HTTP routes are deliberately disabled in server/index.js.
  const ids = (process.env.DEVELOPER_DISCORD_IDS || process.env.DEVELOPER_DISCORD_ID || '1453329316833398819').split(',').map((v) => v.trim()).filter(Boolean);
  return ids.includes(String(getAccount(accountId)?.discordId || ''));
}

export function guildList() {
  const guilds = db.prepare(`SELECT g.*, a.username AS leader, COUNT(gm.account_id) AS members FROM guilds g JOIN accounts a ON a.id=g.leader_account_id LEFT JOIN guild_members gm ON gm.guild_id=g.id WHERE g.approved=1 GROUP BY g.id ORDER BY g.name`).all();
  return guilds.map((g) => ({ ...g, score: guildScore(g.id) }));
}
export function guildScore(guildId) {
  const ids = db.prepare('SELECT account_id FROM guild_members WHERE guild_id=?').all(guildId).map((r) => r.account_id);
  if (!ids.length) return 0;
  const scores = ids.map((id) => playerLeaderboardStats(id).globalRank).filter(Number.isFinite).map((rank) => 1 / rank);
  return scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 10 : 0;
}

export function writeSave(id, save) {
  saveStmt.run(JSON.stringify(save), Date.now(), id);
}

export function loadSave(id) {
  const row = getStmt.get(id);
  if (!row?.save) return null;
  try { return JSON.parse(row.save); } catch { return null; }
}

// The Eternal Pharaoh Crown is globally unique. This removes every persisted
// copy before a new Super Pharaoh award is written. Active players are also
// cleared in World.awardEternalPharCrown so a stale save cannot restore one.
export function removePersistedEternalPharCrowns() {
  const rows = db.prepare("SELECT id, save FROM accounts WHERE save LIKE '%pharcrown:9%' OR save LIKE '%crown:9%'").all();
  let removed = 0;
  const run = db.transaction(() => {
    for (const row of rows) {
      let save;
      try { save = row.save ? JSON.parse(row.save) : null; } catch { continue; }
      if (!save) continue;
      const removeItem = (item) => item && (item.type === 'pharcrown' || item.type === 'crown') && item.rarity === 9;
      const inventory = Array.isArray(save.inventory) ? save.inventory : [];
      const before = inventory.length;
      save.inventory = inventory.filter(([key]) => key !== 'pharcrown:9' && key !== 'crown:9');
      let changed = save.inventory.length !== before;
      for (const rowName of ['primary', 'secondary']) {
        if (!Array.isArray(save[rowName])) continue;
        for (let i = 0; i < save[rowName].length; i++) {
          if (removeItem(save[rowName][i])) { save[rowName][i] = null; changed = true; }
        }
      }
      if (changed) {
        db.prepare('UPDATE accounts SET save=?, last_seen=? WHERE id=?').run(JSON.stringify(save), Date.now(), row.id);
        removed++;
      }
    }
  });
  run();
  return removed;
}

// Permanently removes an account row (used when merging a guest save into a
// Discord account — the save that isn't kept is deleted for good).
export function deleteAccount(id) {
  deleteStmt.run(id);
}

// Admin search — Discord-linked accounts only (guest rows aren't manageable
// through the admin panel). `query` matches either the display name or the
// raw Discord id, case-insensitively.
export function searchAccounts(query = '', limit = 25) {
  const q = `%${query.toLowerCase()}%`;
  return searchStmt.all({ q, limit });
}

export function getAccountFull(id) {
  const row = getFullStmt.get(id);
  if (!row) return null;
  let save = null;
  try { save = row.save ? JSON.parse(row.save) : null; } catch { save = null; }
  let inventory = null;
  try { inventory = row.inventory ? JSON.parse(row.inventory) : null; } catch { inventory = null; }
  return { ...row, save, inventory };
}

export { db };
