# Removed temporary test features

This file is the archive for temporary development-only functionality removed
from the running game on 2026-09-09. Nothing in this document is imported or
executed by the client or server.

## Test inventory

Removed from `server/ws.js` and `server/worker.js`.

```js
function seedTestInventory(player) {
  for (const type of Object.keys(PETAL_TYPES)) {
    if (type === 'pharcrown') continue;
    for (let rarity = 0; rarity < RARITIES.length; rarity++) {
      const key = `${type}:${rarity}`;
      const missing = Math.max(0, 10 - (player.inventory.get(key) || 0));
      for (let i = 0; i < missing; i++) player.addToInventory(type, rarity, true);
    }
  }
}
```

The server version called this after a player joined. The local worker version
gave 10 of every non-`pharcrown` petal at every rarity. The `DEV_TEST_INVENTORY`
entry was also removed from `.env.example`.

## Fake leaderboard data

Removed with `client/src/social.js`; its import and `initSocial()` call were
removed from `client/src/main.js`.

```js
const players = [
  ['ajz', 'Westglide', 1], ['GODSPEED', 'Westglide', 2],
  ['plo', 'Moeshie', 3], ['wibuu', 'Tung', 4], ['Meh', 'No guild', 5],
  ['Oracle', 'Tung', 6], ['Jobmob', 'Moeshie', 7], ['DadyX', 'No guild', 8],
];

const myStatsRows = [
  ['Playtime', '32.5 h', '#5', '#2', '#4'],
  ['Damage dealt', '245,920', '#8', '#6', '#7'],
  ['Crafting attempts', '214 pts', '#4', '#1', '#3'],
  ['Kill messages', '8 pts', '#6', '#4', '#5'],
  ['Obtained petals', '146 pts', '#7', '#3', '#6'],
];
```

The fake window used Global/Daily/Weekly periods, a public ranking list, and a
private “My stats” list. It did not request real server data.

## Fake guild data and scenarios

Also removed from `client/src/social.js`.

```js
const guilds = [
  { id: 1, name: 'Westglide', tag: 'WG', leader: 'ajz', members: 18,
    score: 96.8, req: 'Global rank top 50, Discord required.' },
  { id: 2, name: 'Moeshie', tag: 'MOES', leader: 'plo', members: 14,
    score: 82.4, req: 'Be active each week.' },
  { id: 3, name: 'Tung', tag: 'SHR', leader: 'wibuu', members: 11,
    score: 74.2, req: 'No minimum rank.' },
];
```

The removed scenarios were `none`, `member`, `leader`, and `developer`.
They displayed these preview-only details:

- Member guild: Westglide `[WG]`, leader `ajz`, score `84.2`, and online
  members `ajz`, `GODSPEED`, and `Cubing_Hater`.
- Leader application: `Cubing_Hater` with the text “I play every day and want
  to craft with the guild.”
- Developer queue: Moon Petals `[MP]`, submitted by Oracle.
- All Apply/Accept/Reject/Start buttons only showed browser `alert()` preview
  messages; they never changed server data.

## Removed HTML and styling

Removed from `client/index.html`:

- The interactive `Leaderboards` and `Guilds` buttons. Visible, disabled
  “Coming soon” buttons were added back afterwards; they do not open data or
  execute test code.
- `#guildTestPanel` with No guild / Member / Leader / Developer buttons.
- `#socialModal` and `#guildModal` markup.
- All `.social-*`, `.guild-*`, `.leaderboard-*`, `#leaderboardBtn`, and
  `#guildBtn` CSS rules used only by the preview.

## Removed development authentication route

Removed from `server/auth.js` and `.env.example`:

```text
GET /auth/dev?id=<id>&name=<name>
DEV_AUTH=1
```

When enabled, it created a Discord-like account with `discordId` in the form
`dev:<id>` and signed it in. Real Discord authentication remains unchanged.

## Real guild/leaderboard backend

The data schema and API implementation remain in `server/db.js` and
`server/leaderboards.js`. As of the activation after this cleanup,
`server/index.js` routes to these APIs and `client/src/social.js` is a new
live-data UI. It is separate from the removed preview implementation above:
it contains no test players, fake guilds, scenario buttons, or seeded stats.
