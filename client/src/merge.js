import { PETAL_TYPES, RARITIES } from '../../shared/config.js';
import { PETAL_ICONS } from './ui.js';
import { apiUrl } from './api.js';

function shade(hex, f = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.round(((n >> shift) & 0xff) * f);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

// Builds the petal grid for one side of the comparison. `summary` is the
// { level, petals, total } shape the server produces in summarizeSave() —
// petals already include everything from the inventory and both loadout rows.
function petalGrid(summary) {
  const grid = document.createElement('div');
  grid.className = 'mg-petals';
  if (!summary.petals.length) {
    const empty = document.createElement('div');
    empty.className = 'mg-empty';
    empty.textContent = 'No petals';
    grid.appendChild(empty);
    return grid;
  }
  for (const { type, rarity, count } of summary.petals) {
    const def = PETAL_TYPES[type];
    const rar = RARITIES[rarity];
    if (!def || !rar) continue;
    const icon = PETAL_ICONS[type];
    const tile = document.createElement('div');
    tile.className = 'mg-tile';
    tile.style.background = rar.color;
    tile.style.borderColor = shade(rar.color);
    tile.title = `${rar.name} ${def.name} ×${count}`;
    tile.innerHTML =
      (icon
        ? `<img class="mg-icon" src="${icon}" alt="${def.name}" />`
        : `<div class="mg-dot" style="background:${def.color}"></div>`) +
      `<div class="mg-count">${count}</div>`;
    grid.appendChild(tile);
  }
  return grid;
}

function sideCard(title, summary, onKeep) {
  const card = document.createElement('div');
  card.className = 'mg-card';

  const head = document.createElement('div');
  head.className = 'mg-cardhead';
  head.innerHTML =
    `<div class="mg-cardtitle">${title}</div>` +
    `<div class="mg-cardmeta">Level ${summary.level} · ${summary.total} petal${summary.total === 1 ? '' : 's'}</div>`;
  card.appendChild(head);

  card.appendChild(petalGrid(summary));

  const btn = document.createElement('button');
  btn.className = 'mg-keep';
  btn.textContent = 'Keep this save';
  btn.onclick = onKeep;
  card.appendChild(btn);
  return card;
}

// Shows the "which save do you want to keep?" popup. `data` is the JSON from
// GET /auth/merge. Resolves after the choice has been committed server-side
// (the caller reloads the page so the game picks up the winning save).
export function showMergeModal(data) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.id = 'mergemodal';

    const box = document.createElement('div');
    box.className = 'mg-box';
    box.innerHTML =
      '<div class="mg-title stroke">Two saves found</div>' +
      `<div class="mg-sub">Your guest progress and the account <b>${(data.username || 'your account').replace(/</g, '&lt;')}</b> ` +
      'both have progress. Pick the one to keep — the other is deleted permanently.</div>';

    const row = document.createElement('div');
    row.className = 'mg-row';

    let busy = false;
    const choose = async (keep) => {
      if (busy) return;
      busy = true;
      box.querySelectorAll('.mg-keep').forEach((b) => { b.disabled = true; });
      try {
        await fetch(apiUrl('/auth/merge'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ keep }),
        });
      } catch { /* best effort — reload will reflect whatever committed */ }
      backdrop.remove();
      resolve();
    };

    row.appendChild(sideCard('Guest progress', data.guest, () => choose('guest')));
    row.appendChild(sideCard(`${data.username || 'Discord account'}`, data.discord, () => choose('discord')));
    box.appendChild(row);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
  });
}
