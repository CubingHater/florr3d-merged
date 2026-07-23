import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const DB_PATH = process.env.DB_PATH
  || fileURLToPath(new URL('../accounts.db', import.meta.url));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

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

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
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

// Generic key-value store for admin-tunable gameplay settings (drop rates,
// sacrifice spawn weights, etc.) so they survive a server restart instead of
// silently resetting to the hardcoded defaults.
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
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
  RETURNING id, discord_id AS discordId, username, avatar, save
`);
const upsertGuestStmt = db.prepare(`
  INSERT INTO accounts (guest_id, username, created_at, last_seen)
  VALUES (@guestId, @username, @now, @now)
  ON CONFLICT(guest_id) DO UPDATE SET last_seen = @now
  RETURNING id, discord_id AS discordId, username, avatar, save
`);
const getStmt = db.prepare(
  'SELECT id, discord_id AS discordId, username, avatar, save FROM accounts WHERE id = ?',
);
const getFullStmt = db.prepare(
  'SELECT id, discord_id, guest_id, username, avatar, save, last_seen FROM accounts WHERE id = ?',
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
  return upsertStmt.get({ discordId, username, avatar, now: Date.now() });
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

export function writeSave(id, save) {
  saveStmt.run(JSON.stringify(save), Date.now(), id);
}

export function loadSave(id) {
  const row = getStmt.get(id);
  if (!row?.save) return null;
  try { return JSON.parse(row.save); } catch { return null; }
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
  return { ...row, save };
}
