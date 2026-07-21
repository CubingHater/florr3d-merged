import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  upsertAccount, upsertGuestAccount, getAccount, writeSave, deleteAccount,
} from './db.js';

const SESSION_DAYS = 30;
// How long a pending guest→Discord merge decision stays valid (the player
// picks which save to keep right after logging in, so an hour is plenty).
const MERGE_TTL_MS = 60 * 60 * 1000;

// The secret used to sign session cookies. If it changes, every existing
// cookie stops validating and players silently lose their (guest) account —
// which is exactly what happened when the old code generated a fresh random
// secret on every restart. To keep guest progress across restarts *and* code
// updates with zero setup, we persist an auto-generated secret to a small
// gitignored file next to the database. An explicit SESSION_SECRET env var
// still wins if you'd rather manage it yourself.
function loadOrCreateSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const path = process.env.SESSION_SECRET_FILE
    || fileURLToPath(new URL('../.session-secret', import.meta.url));
  try {
    const existing = readFileSync(path, 'utf8').trim();
    if (existing) return existing;
  } catch { /* file doesn't exist yet — fall through and create it */ }
  const generated = randomBytes(32).toString('hex');
  try {
    writeFileSync(path, generated, { mode: 0o600 });
    console.log(`auth: generated a persistent session secret at ${path}`);
  } catch (err) {
    console.warn('auth: could not persist session secret —', err.message,
      '\n      guest sessions will not survive a restart; set SESSION_SECRET to fix this');
  }
  return generated;
}
const secret = loadOrCreateSecret();

const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');

// Signed, self-describing token of the form `<id>.<expiryMs>.<hmac>`. Used for
// both session cookies (id = account id) and merge cookies (id = guest account
// id awaiting a keep/discard decision).
function signToken(id, expiryMs) {
  const payload = `${id}.${expiryMs}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const mac = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  const [id, expiry] = payload.split('.');
  if (Date.now() > Number(expiry)) return null;
  return Number(id);
}

const makeSession = (accountId) => signToken(accountId, Date.now() + SESSION_DAYS * 86400_000);
const makeMergeToken = (guestId) => signToken(guestId, Date.now() + MERGE_TTL_MS);
const verifySession = verifyToken;

export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function sessionFromCookie(cookieHeader) {
  return verifySession(parseCookies(cookieHeader).sid);
}

// The backend and frontend can be deployed on different origins (e.g. a
// Vercel-hosted client talking to a separately-hosted API). When that's the
// case, session/merge/human cookies need SameSite=None (plus Secure, which
// modern browsers require alongside it) so the browser will still send them
// on cross-origin requests. Same-origin deployments keep the stricter Lax.
const crossOrigin = !!(process.env.FRONTEND_URL || '').trim();
const cookieSameSite = crossOrigin ? 'SameSite=None' : 'SameSite=Lax';
const frontendHome = () => (process.env.FRONTEND_URL || '').split(',')[0].trim() || '/';

const setSession = (res, token) => res.appendHeader('Set-Cookie',
  `sid=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; ${cookieSameSite}`);

const setMerge = (res, token) => res.appendHeader('Set-Cookie',
  `merge=${token}; Path=/; Max-Age=${MERGE_TTL_MS / 1000}; HttpOnly; ${cookieSameSite}`);
const clearMerge = (res) => res.appendHeader('Set-Cookie',
  `merge=; Path=/; Max-Age=0; HttpOnly; ${cookieSameSite}`);

function parseSave(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

// Rolls a save up into { level, petals } for the merge comparison popup.
// Crucially this counts petals from *every* place a player can hold them:
// the inventory AND both equipped loadout rows (primary + secondary), so a
// petal that happens to be equipped when the player logs in is never missed.
function summarizeSave(save) {
  const counts = new Map();
  const add = (type, rarity, n = 1) => {
    if (!type || !Number.isInteger(rarity) || !(n > 0)) return;
    const key = `${type}:${rarity}`;
    counts.set(key, (counts.get(key) || 0) + n);
  };
  if (save) {
    for (const [key, n] of (Array.isArray(save.inventory) ? save.inventory : [])) {
      const [type, rarity] = String(key).split(':');
      add(type, Number(rarity), Number(n));
    }
    for (const slot of (Array.isArray(save.primary) ? save.primary : [])) {
      if (slot) add(slot.type, slot.rarity);
    }
    for (const slot of (Array.isArray(save.secondary) ? save.secondary : [])) {
      if (slot) add(slot.type, slot.rarity);
    }
  }
  const petals = [...counts.entries()]
    .map(([key, count]) => {
      const [type, rarity] = key.split(':');
      return { type, rarity: Number(rarity), count };
    })
    .sort((a, b) => (b.rarity - a.rarity) || (a.type < b.type ? -1 : 1));
  const total = petals.reduce((sum, p) => sum + p.count, 0);
  return { level: Number.isInteger(save?.level) ? save.level : 1, petals, total };
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10_000) req.destroy();
    });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

// Guarantees the request has a valid, saved account — Discord-linked or
// not — and makes sure the response carries a session cookie for it.
// Call this early (before the player ever reaches the game socket) so
// that by the time the WebSocket connects, the browser already has the
// cookie and progress can be loaded/saved right away, on any domain.
export function ensureSession(req, res) {
  const existing = sessionFromCookie(req.headers.cookie);
  if (existing != null && getAccount(existing)) return existing;
  const guestId = randomBytes(12).toString('hex');
  const account = upsertGuestAccount({ guestId, username: `Guest${guestId.slice(0, 4)}` });
  setSession(res, makeSession(account.id));
  return account.id;
}

export function isDiscordAccount(accountId) {
  const account = accountId != null ? getAccount(accountId) : null;
  return account?.discordId != null;
}

const redirect = (res, to) => { res.writeHead(302, { location: to }); res.end(); };
const json = (res, obj) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

export async function handleAuth(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/auth/')) return false;

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI
    || `https://${req.headers.host}/auth/callback`;

  switch (url.pathname) {
    case '/auth/discord': {
      if (!clientId) { res.writeHead(503); res.end('login not configured'); return true; }
      const q = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri,
        response_type: 'code', scope: 'identify', prompt: 'none',
      });
      redirect(res, `https://discord.com/oauth2/authorize?${q}`);
      return true;
    }

    case '/auth/callback': {
      const code = url.searchParams.get('code');
      if (!code || !clientId) return redirect(res, frontendHome()), true;

      // Who was this browser before it logged in? If it was a guest with
      // saved progress, we may need to fold that into the Discord account.
      const priorId = sessionFromCookie(req.headers.cookie);
      const prior = priorId != null ? getAccount(priorId) : null;

      try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId, client_secret: clientSecret,
            grant_type: 'authorization_code', code, redirect_uri: redirectUri,
          }),
        });
        if (!tokenRes.ok) throw new Error(`token exchange ${tokenRes.status}`);
        const { access_token } = await tokenRes.json();
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { authorization: `Bearer ${access_token}` },
        });
        if (!userRes.ok) throw new Error(`users/@me ${userRes.status}`);
        const user = await userRes.json();
        const account = upsertAccount({
          discordId: user.id,
          username: user.global_name || user.username,
          avatar: user.avatar,
        });
        setSession(res, makeSession(account.id));

        // Guest → Discord merge. Only relevant when the pre-login account was
        // an anonymous guest (no discordId) distinct from the one we just
        // signed into, and it actually carried progress worth keeping.
        const wasGuest = prior && prior.discordId == null && prior.id !== account.id;
        const guestSave = wasGuest ? parseSave(prior.save) : null;
        if (guestSave) {
          const discordSave = parseSave(account.save);
          if (!discordSave) {
            // Fresh Discord account (no progress of its own) — adopt the
            // guest's save outright, no decision needed.
            writeSave(account.id, guestSave);
            deleteAccount(prior.id);
          } else {
            // Both sides have progress: hand the choice to the player. Stash
            // the guest account id in a short-lived signed cookie and let the
            // client show a comparison; /auth/merge finishes the job.
            setMerge(res, makeMergeToken(prior.id));
            return redirect(res, `${frontendHome()}?merge=1`), true;
          }
        } else if (wasGuest) {
          // Empty guest account — nothing to keep, so tidy up the stray row.
          deleteAccount(prior.id);
        }
      } catch (err) {
        console.error('auth: discord login failed —', err.message);
      }
      redirect(res, frontendHome());
      return true;
    }

    case '/auth/merge': {
      const cookies = parseCookies(req.headers.cookie);
      const discordId = verifySession(cookies.sid);
      const guestId = verifyToken(cookies.merge);
      const discord = discordId != null ? getAccount(discordId) : null;
      const guest = guestId != null ? getAccount(guestId) : null;
      // A merge is only valid between a real (Discord) account and a distinct
      // guest account that still exists.
      const valid = !!discord && !!guest
        && guest.discordId == null && guest.id !== discord.id;

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const keep = body?.keep;
        if (valid && (keep === 'guest' || keep === 'discord')) {
          // keep === 'guest': overwrite the Discord save with the guest's
          //   (the Discord account's old progress is thereby discarded).
          // keep === 'discord': leave the Discord save untouched.
          // Either way the guest row — and whichever save wasn't chosen — is
          // permanently deleted.
          if (keep === 'guest') {
            const guestSave = parseSave(guest.save);
            if (guestSave) writeSave(discord.id, guestSave);
          }
          deleteAccount(guest.id);
        }
        clearMerge(res);
        json(res, { ok: valid });
        return true;
      }

      if (!valid) { json(res, { pending: false }); return true; }
      json(res, {
        pending: true,
        username: discord.username,
        guest: summarizeSave(parseSave(guest.save)),
        discord: summarizeSave(parseSave(discord.save)),
      });
      return true;
    }

    case '/auth/me': {
      const accountId = sessionFromCookie(req.headers.cookie);
      const account = accountId != null ? getAccount(accountId) : null;
      json(res, account?.discordId != null
        ? { loggedIn: true, username: account.username, avatar: account.avatar }
        : { loggedIn: false, loginEnabled: !!clientId });
      return true;
    }

    case '/auth/logout': {
      res.setHeader('Set-Cookie', `sid=; Path=/; Max-Age=0; HttpOnly; ${cookieSameSite}`);
      redirect(res, frontendHome());
      return true;
    }

    case '/auth/dev': {
      if (process.env.DEV_AUTH !== '1') { res.writeHead(404); res.end(); return true; }
      const account = upsertAccount({
        discordId: `dev:${url.searchParams.get('id') || 'tester'}`,
        username: url.searchParams.get('name') || 'DevTester',
        avatar: null,
      });
      setSession(res, makeSession(account.id));
      json(res, { loggedIn: true, username: account.username });
      return true;
    }

    default:
      res.writeHead(404);
      res.end();
      return true;
  }
}
