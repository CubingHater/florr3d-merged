import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { parseCookies } from './auth.js';
import { getAccountFull, searchAccounts, loadSave, writeSave } from './db.js';
import { gameWorld, liveAccounts } from './ws.js';
import { clientIp } from './utils.js';
import { PETAL_TYPES, RARITIES, MOB_TYPES, PLAYER_MODEL_IDS, ARENA_HALF } from '../shared/config.js';
import { settings, patchSettings, SACRIFICE_MOB_TYPES } from './gameSettings.js';
// Side-effect import: loads any previously-saved gameplay settings from the
// db over the defaults, and wires up persistence for future patchSettings()
// calls. Deliberately kept out of gameSettings.js itself — see the comment
// at the top of that file for why.
import './gameSettingsStore.js';

// Admin access is password-only by design: a single shared secret, held only
// as an env var, never written into the source tree or the repo. Leave
// ADMIN_PASSWORD unset to disable the panel entirely.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_TOKEN_DAYS = 7;
const adminCookieSecret = process.env.ADMIN_SESSION_SECRET || randomBytes(32).toString('hex');
if (ADMIN_PASSWORD && !process.env.ADMIN_SESSION_SECRET) {
  console.warn('admin: ADMIN_SESSION_SECRET not set — password-login sessions will not survive a restart');
}
const signAdmin = (payload) => createHmac('sha256', adminCookieSecret).update(payload).digest('base64url');

function makeAdminToken() {
  const payload = `admin.${Date.now() + ADMIN_TOKEN_DAYS * 86400_000}`;
  return `${payload}.${signAdmin(payload)}`;
}

// Returns true if the admtok cookie is a valid, unexpired password-login token.
function verifyAdminToken(token) {
  if (typeof token !== 'string') return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const mac = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(signAdmin(payload));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return false;
  const [tag, expiry] = payload.split('.');
  return tag === 'admin' && Date.now() <= Number(expiry);
}

// Basic brute-force guard for the password login: a handful of attempts per
// IP within a short window. Not a substitute for a strong ADMIN_PASSWORD.
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map(); // ip -> { count, windowStart }

function loginRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 0, windowStart: now });
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginAttempt(ip) {
  const entry = loginAttempts.get(ip);
  if (entry) entry.count += 1;
}

function passwordsMatch(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Returns identity info for whoever is authenticated as admin, or null.
// Password login is the only path in: a valid, unexpired admtok cookie.
function adminIdentity(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (verifyAdminToken(cookies.admtok)) return { via: 'password', username: 'admin' };
  return null;
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

async function readJsonBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function normalizeInventoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const { type, rarity, count } = entry;
  const r = Number(rarity);
  const c = Math.floor(Number(count));
  if (!PETAL_TYPES[type] || !RARITIES[r]) return null;
  if (!Number.isFinite(c) || c <= 0) return null;
  return [`${type}:${r}`, Math.min(c, 999_999)];
}

function normalizeSlot(slot) {
  if (!slot) return null;
  const r = Number(slot.rarity);
  if (!PETAL_TYPES[slot.type] || !RARITIES[r]) return null;
  return { type: slot.type, rarity: r };
}

// Validates and coerces an admin-submitted save payload into the same shape
// Player.applySave()/serializeSave() already use, so it can be written to the
// DB directly and, if the account is online, handed straight to the live
// Player instance.
// `existing` is the player's current save (if any); when the request omits
// primary/secondary (e.g. an older client) we carry the existing loadout
// forward instead of wiping it.
function normalizeSave(body, existing = {}) {
  const level = Number.isInteger(body.level) ? Math.max(1, Math.min(200, body.level)) : 1;
  const xp = Number.isFinite(body.xp) && body.xp >= 0 ? Math.floor(body.xp) : 0;
  const inventory = Array.isArray(body.inventory)
    ? body.inventory.map(normalizeInventoryEntry).filter(Boolean)
    : [];
  const primary = Array.isArray(body.primary)
    ? body.primary.map(normalizeSlot)
    : Array.isArray(existing.primary) ? existing.primary : undefined;
  const secondary = Array.isArray(body.secondary)
    ? body.secondary.map(normalizeSlot)
    : Array.isArray(existing.secondary) ? existing.secondary : undefined;
  const save = { v: 1, level, xp, inventory };
  const playerModel = PLAYER_MODEL_IDS.includes(body.playerModel) ? body.playerModel
    : PLAYER_MODEL_IDS.includes(existing.playerModel) ? existing.playerModel : '';
  if (playerModel) save.playerModel = playerModel;
  if (primary) save.primary = primary;
  if (secondary) save.secondary = secondary;
  return save;
}

function saveToPayload(save) {
  const inventory = Array.isArray(save?.inventory)
    ? save.inventory
      .map(([key, count]) => {
        const [type, rarity] = String(key).split(':');
        if (!PETAL_TYPES[type] || !RARITIES[Number(rarity)]) return null;
        return { type, rarity: Number(rarity), count, name: `${RARITIES[rarity].name} ${PETAL_TYPES[type].name}` };
      })
      .filter(Boolean)
    : [];
  return {
    v: 1,
    level: save?.level ?? 1,
    xp: save?.xp ?? 0,
    inventory,
    primary: Array.isArray(save?.primary) ? save.primary : [],
    secondary: Array.isArray(save?.secondary) ? save.secondary : [],
    playerModel: PLAYER_MODEL_IDS.includes(save?.playerModel) ? save.playerModel : '',
  };
}

function setAdminCookie(res) {
  const crossOrigin = !!(process.env.FRONTEND_URL || '').trim();
  res.setHeader('Set-Cookie',
    `admtok=${makeAdminToken()}; Path=/; Max-Age=${ADMIN_TOKEN_DAYS * 86400}; HttpOnly; ${crossOrigin ? 'SameSite=None; Secure' : 'SameSite=Lax'}`);
}
export async function handleAdmin(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/admin/')) return false;

  // Password being set means someone has deliberately locked the panel down;
  // once that's true, every route below requires a real adminIdentity. With
  // it unset, the panel stays in its original "no login needed" mode — fine
  // for a laptop-only dev server, not for anything reachable by anyone else,
  // so set ADMIN_PASSWORD before deploying.
  const adminConfigured = !!ADMIN_PASSWORD;

  // Login/logout are handled before the auth gate below, since logging in
  // is how you get past that gate in the first place.
  if (url.pathname === '/admin/login' && req.method === 'POST') {
    if (!ADMIN_PASSWORD) { json(res, 404, { error: 'not authorized' }); return true; }
    const ip = clientIp(req);
    if (loginRateLimited(ip)) { json(res, 429, { error: 'too many attempts, try again later' }); return true; }
    let body;
    try { body = await readJsonBody(req); } catch { json(res, 400, { error: 'bad body' }); return true; }
    recordLoginAttempt(ip);
    if (typeof body.password !== 'string' || !passwordsMatch(body.password, ADMIN_PASSWORD)) {
      json(res, 401, { error: 'wrong password' });
      return true;
    }
    setAdminCookie(res);
    json(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === '/admin/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', 'admtok=; Path=/; Max-Age=0');
    json(res, 200, { ok: true });
    return true;
  }

  const admin = adminIdentity(req);

  if (url.pathname === '/admin/session' && req.method === 'GET') {
    if (adminConfigured && !admin) { json(res, 401, { admin: false }); return true; }
    json(res, 200, { admin: !!admin, username: admin?.username ?? 'Developer', via: admin?.via ?? 'development' });
    return true;
  }

  // Every route past this point changes or reveals player data, so once
  // the panel is configured to require login, an unauthenticated request
  // — including one typed directly into a browser console — gets a plain
  // 401 here, no matter what it asks for below.
  if (adminConfigured && !admin) { json(res, 401, { error: 'not authorized' }); return true; }
  if (url.pathname === '/admin/petal-catalog' && req.method === 'GET') {
    json(res, 200, {
      rarities: RARITIES.map((r, i) => ({ id: i, name: r.name })),
      petals: Object.entries(PETAL_TYPES).map(([id, p]) => ({ id, name: p.name })),
    });
    return true;
  }

  if (url.pathname === '/admin/mob-catalog' && req.method === 'GET') {
    json(res, 200, {
      mobs: Object.entries(MOB_TYPES)
        .filter(([id]) => id !== 'assembler')
        .map(([id, mob]) => ({ id, name: mob.name })),
    });
    return true;
  }

  if (url.pathname === '/admin/player-model-catalog' && req.method === 'GET') {
    json(res, 200, { models: PLAYER_MODEL_IDS.map((id) => ({ id, name: MOB_TYPES[id]?.name || id })) });
    return true;
  }

  if (url.pathname === '/admin/game-settings' && req.method === 'GET') {
    json(res, 200, {
      settings,
      rarities: RARITIES.map((r, i) => ({ id: i, name: r.name })),
      sacrificeMobTypes: SACRIFICE_MOB_TYPES.map((id) => ({ id, name: MOB_TYPES[id]?.name || id })),
    });
    return true;
  }

  if (url.pathname === '/admin/game-settings' && req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch { json(res, 400, { error: 'bad body' }); return true; }
    const updated = patchSettings(body);
    console.log(`[admin] ${admin?.username ?? 'Developer'} [${admin?.via ?? 'development'}] updated game settings`);
    json(res, 200, { ok: true, settings: updated });
    return true;
  }

  if (url.pathname === '/admin/spawn-super' && req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch { json(res, 400, { error: 'bad body' }); return true; }
    if (!MOB_TYPES[body.type]) { json(res, 400, { error: 'unknown mob' }); return true; }
    if (!gameWorld) { json(res, 503, { error: 'game server is not ready' }); return true; }
    // rarity is optional; when omitted this behaves exactly like the old
    // "always Super" endpoint.
    const superIdx = RARITIES.findIndex((r) => r.name === 'Super');
    const rarity = body.rarity === undefined ? superIdx : Number(body.rarity);
    if (!Number.isInteger(rarity) || !RARITIES[rarity]) { json(res, 400, { error: 'unknown rarity' }); return true; }
    // x/z are optional world coordinates (e.g. picked on the admin map). When
    // omitted, a random valid position is picked like before.
    const at = (Number.isFinite(body.x) && Number.isFinite(body.z))
      ? { x: Number(body.x), z: Number(body.z) } : null;
    const mob = gameWorld.mobs.spawnAdmin(body.type, rarity, at);
    console.log(`[admin] spawned ${RARITIES[rarity].name} ${MOB_TYPES[body.type].name} (#${mob.id})`);
    json(res, 200, { ok: true, id: mob.id, name: MOB_TYPES[body.type].name, rarity: RARITIES[rarity].name });
    return true;
  }

  if (url.pathname === '/admin/mobs' && req.method === 'GET') {
    if (!gameWorld) { json(res, 503, { error: 'game server is not ready' }); return true; }
    const mobs = gameWorld.mobs.mobs.map((m) => ({
      id: m.id,
      type: m.type,
      name: MOB_TYPES[m.type]?.name || m.type,
      rarity: m.rarity,
      rarityName: RARITIES[m.rarity]?.name || '',
      color: RARITIES[m.rarity]?.color || '#888888',
      x: Math.round(m.pos.x * 10) / 10,
      z: Math.round(m.pos.z * 10) / 10,
      hp: Math.round(m.hp),
      maxHp: Math.round(m.maxHp),
    }));
    json(res, 200, { mobs, arenaHalf: ARENA_HALF });
    return true;
  }

  if (url.pathname === '/admin/despawn-mob' && req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch { json(res, 400, { error: 'bad body' }); return true; }
    if (!gameWorld) { json(res, 503, { error: 'game server is not ready' }); return true; }
    const ok = gameWorld.mobs.despawn(body.id);
    if (!ok) { json(res, 404, { error: 'mob not found' }); return true; }
    console.log(`[admin] despawned mob #${body.id}`);
    json(res, 200, { ok: true });
    return true;
  }

  if (url.pathname.startsWith('/admin/mob-drops/') && req.method === 'GET') {
    const mobTypeId = url.pathname.split('/').pop();
    if (!MOB_TYPES[mobTypeId]) { json(res, 400, { error: 'unknown mob type' }); return true; }
    const dropSlots = MOB_TYPES[mobTypeId].dropSlots || [[], [], [], [], []];
    json(res, 200, { dropSlots });
    return true;
  }

  if (url.pathname.startsWith('/admin/mob-drops/') && req.method === 'POST') {
    const mobTypeId = url.pathname.split('/').pop();
    if (!MOB_TYPES[mobTypeId]) { json(res, 400, { error: 'unknown mob type' }); return true; }
    let body;
    try { body = await readJsonBody(req); } catch { json(res, 400, { error: 'bad body' }); return true; }
    if (!Array.isArray(body.dropSlots) || body.dropSlots.length !== 5) {
      json(res, 400, { error: 'dropSlots must be an array of 5 slots' });
      return true;
    }
    // Update the mob's dropSlots in config
    MOB_TYPES[mobTypeId].dropSlots = body.dropSlots;
    console.log(`[admin] ${admin?.username ?? 'Developer'} updated drop slots for ${MOB_TYPES[mobTypeId].name}`);
    json(res, 200, { ok: true, dropSlots: body.dropSlots });
    return true;
  }

  if (url.pathname === '/admin/search' && req.method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const rows = searchAccounts(q, 25).map((r) => ({
      id: r.id,
      discordId: r.discord_id,
      username: r.username,
      avatar: r.avatar,
      lastSeen: r.last_seen,
      online: liveAccounts.has(r.id),
    }));
    json(res, 200, { accounts: rows });
    return true;
  }

  const accountMatch = url.pathname.match(/^\/admin\/account\/(\d+)$/);
  if (accountMatch && req.method === 'GET') {
    const id = Number(accountMatch[1]);
    const account = getAccountFull(id);
    if (!account) { json(res, 404, { error: 'not found' }); return true; }
    const live = liveAccounts.get(id);
    const save = live ? live.serializeSave() : loadSave(id);
    json(res, 200, {
      id: account.id,
      discordId: account.discord_id,
      username: account.username,
      avatar: account.avatar,
      online: !!live,
      save: saveToPayload(save),
    });
    return true;
  }

  if (accountMatch && req.method === 'POST') {
    const id = Number(accountMatch[1]);
    const account = getAccountFull(id);
    if (!account) { json(res, 404, { error: 'not found' }); return true; }
    let body;
    try { body = await readJsonBody(req); } catch { json(res, 400, { error: 'bad body' }); return true; }
    const live = liveAccounts.get(id);
    const existing = live ? live.serializeSave() : (loadSave(id) || {});
    const save = normalizeSave(body, existing);
    if (live) {
      // applySave() only ever adds/overwrites entries, so clear the current
      // inventory first or removed items would linger on a connected player.
      live.inventory.clear();
      live.applySave(save);
      writeSave(id, live.serializeSave());
    } else {
      writeSave(id, save);
    }
    console.log(`[admin] ${admin?.username ?? 'Developer'} [${admin?.via ?? 'development'}] edited account #${id} (${account.username})`);
    json(res, 200, { ok: true, save: saveToPayload(save), online: !!live });
    return true;
  }

  json(res, 404, { error: 'not found' });
  return true;
}