const $ = (id) => document.getElementById(id);
let catalog = { rarities: [], petals: [] };
let mobCatalog = [];
let currentAccountId = null;
let currentSave = null; // { primary, secondary } carried through untouched
let mobMap = { arenaHalf: 185, mobs: [] };
let mapRefreshTimer = null;
let gameSettings = null;

function toast(msg, kind) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => { t.className = 'toast'; }, 2600);
}

async function api(path, opts) {
  const res = await fetch(path, { credentials: 'include', ...opts });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
  return data;
}

// Loads catalogs + the mob map and reveals the panel. Only called once
// /admin/session has confirmed we're actually logged in.
async function loadMainPanel(username, via) {
  $('statusBox').textContent = via === 'key'
    ? `Adminpaneel (ingelogd met sleutel)`
    : `Adminpaneel (ingelogd als ${username})`;
  $('loginCard').style.display = 'none';
  $('main').style.display = '';
  catalog = await api('/admin/petal-catalog');
  mobCatalog = (await api('/admin/mob-catalog')).mobs;
  const select = $('superMobSelect');
  select.innerHTML = '';
  for (const mob of mobCatalog) {
    const option = document.createElement('option');
    option.value = mob.id; option.textContent = mob.name;
    select.appendChild(option);
  }
  const raritySelect = $('raritySelect');
  raritySelect.innerHTML = '';
  for (const r of catalog.rarities) {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = r.name;
    raritySelect.appendChild(opt);
  }
  // Default to the highest rarity (currently Eternal) to match the old behavior.
  raritySelect.value = String(catalog.rarities.length - 1);
  await refreshMobMap();
  await loadGameSettings();
  if (!mapRefreshTimer) mapRefreshTimer = setInterval(refreshMobMap, 3000);
}

// Checks whether we're already logged in (existing admtok cookie) and shows
// either the main panel or the login screen accordingly. Also called again
// right after a successful login.
async function checkSession() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
  try {
    const res = await fetch('/admin/session', { credentials: 'include', signal: controller.signal });
    clearTimeout(timeoutId);
    let data = null;
    try { data = await res.json(); } catch {}
    if (res.ok && data?.admin) {
      await loadMainPanel(data.username, data.via);
      if (!currentAccountId) doSearch();
      return true;
    }
    $('main').style.display = 'none';
    $('loginCard').style.display = '';
    $('statusBox').textContent = 'Niet ingelogd';
    return false;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// Admin actions live entirely behind server-side checks (see server/admin.js
// — every /admin/* route re-verifies the signed session cookie on every
// request). That's what actually stops someone from just opening devtools
// and calling an admin endpoint from the console: without a valid cookie,
// the server rejects the request itself, regardless of where it came from.
// The password form below only exists to obtain that cookie in the first
// place; nothing after this point trusts the browser on its own.

async function loginWithPassword() {
  const input = $('passwordInput');
  const btn = $('passwordLoginBtn');
  if (!input.value) return;
  btn.disabled = true;
  try {
    await api('/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });
    input.value = '';
    await checkSession();
  } catch (e) {
    toast('Inloggen mislukt: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  try {
    await checkSession();
  } catch (e) {
    console.error('Admin panel init error:', e);
    $('statusBox').textContent = 'Adminpaneel kon niet worden geladen: ' + e.message;
    // Show login card even on error
    $('main').style.display = 'none';
    $('loginCard').style.display = '';
    $('statusBox').textContent = 'Niet ingelogd (fout bij laden)';
  }
}

async function spawnSuper(at) {
  const btn = $('spawnSuperBtn');
  btn.disabled = true;
  try {
    const body = { type: $('superMobSelect').value, rarity: Number($('raritySelect').value) };
    if (at) { body.x = at.x; body.z = at.z; }
    const res = await api('/admin/spawn-super', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    toast(res.rarity + ' ' + res.name + ' gespawnd!', 'ok');
    refreshMobMap();
  } catch (e) {
    toast('Spawnen mislukt: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function despawnMob(id) {
  try {
    await api('/admin/despawn-mob', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    toast('Mob gedespawned', 'ok');
    refreshMobMap();
  } catch (e) {
    toast('Despawnen mislukt: ' + e.message, 'error');
  }
}

async function refreshMobMap() {
  try {
    const data = await api('/admin/mobs');
    mobMap = data;
    drawMobMap();
    renderMobList();
  } catch (e) {
    // Silent: the map just won't update this tick (e.g. server not ready yet).
  }
}

function worldToCanvas(x, z, canvas) {
  const half = mobMap.arenaHalf || 185;
  return {
    cx: ((x + half) / (2 * half)) * canvas.width,
    cy: ((z + half) / (2 * half)) * canvas.height,
  };
}

function canvasToWorld(cx, cy, canvas) {
  const half = mobMap.arenaHalf || 185;
  return {
    x: (cx / canvas.width) * (2 * half) - half,
    z: (cy / canvas.height) * (2 * half) - half,
  };
}

function drawMobMap() {
  const canvas = $('mobMap');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#232a35';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  // Faint center crosshair for orientation.
  ctx.strokeStyle = '#1a2028';
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  for (const mob of mobMap.mobs || []) {
    const { cx, cy } = worldToCanvas(mob.x, mob.z, canvas);
    ctx.beginPath();
    ctx.fillStyle = mob.color || '#888';
    ctx.arc(cx, cy, mob.rarity >= 6 ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderMobList() {
  const list = $('mobList');
  const mobs = [...(mobMap.mobs || [])].sort((a, b) => b.rarity - a.rarity);
  $('mobCountLabel').textContent = mobs.length + ' mob' + (mobs.length === 1 ? '' : 's');
  list.innerHTML = '';
  if (mobs.length === 0) {
    list.innerHTML = '<div class="muted">Geen mobs geladen.</div>';
    return;
  }
  for (const mob of mobs) {
    const el = document.createElement('div');
    el.className = 'mob-item';
    el.innerHTML = `
      <span class="swatch" style="background:${mob.color}"></span>
      <div class="info">
        <div>${escapeHtml(mob.rarityName)} ${escapeHtml(mob.name)}</div>
        <div class="hp">${mob.hp}/${mob.maxHp} hp · (${mob.x}, ${mob.z})</div>
      </div>`;
    const btn = document.createElement('button');
    btn.className = 'danger'; btn.type = 'button'; btn.textContent = 'Despawn';
    btn.addEventListener('click', () => despawnMob(mob.id));
    el.appendChild(btn);
    list.appendChild(el);
  }
}

function nearestMobAtCanvasPoint(cx, cy, canvas) {
  let best = null, bestDist = Infinity;
  for (const mob of mobMap.mobs || []) {
    const p = worldToCanvas(mob.x, mob.z, canvas);
    const d = Math.hypot(p.cx - cx, p.cy - cy);
    if (d < bestDist) { bestDist = d; best = mob; }
  }
  // Only count it as "clicked on a mob" within a small pixel radius.
  return bestDist <= 9 ? best : null;
}

function onMapClick(evt) {
  const canvas = $('mobMap');
  const rect = canvas.getBoundingClientRect();
  const cx = (evt.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (evt.clientY - rect.top) * (canvas.height / rect.height);
  const hit = nearestMobAtCanvasPoint(cx, cy, canvas);
  if (hit) {
    despawnMob(hit.id);
    return;
  }
  const world = canvasToWorld(cx, cy, canvas);
  spawnSuper({ x: Math.round(world.x), z: Math.round(world.z) });
}

function round(v, decimals) {
  const m = 10 ** decimals;
  return Math.round(v * m) / m;
}

async function loadGameSettings() {
  try {
    const data = await api('/admin/game-settings');
    gameSettings = data.settings;
    
    // Populate mob rarity dropdown
    const mobRaritySelect = $('mobRaritySelect');
    mobRaritySelect.innerHTML = '';
    const mobRarities = data.rarities.filter((r) => DROP_TABLE_MOB_RARITIES.includes(r.name));
    for (const r of mobRarities) {
      const opt = document.createElement('option');
      opt.value = r.id; opt.textContent = r.name;
      opt.style.color = r.color || '';
      mobRaritySelect.appendChild(opt);
    }
    
    // Add event listener to update drop rates when selection changes
    mobRaritySelect.addEventListener('change', () => {
      renderDropRarityRow(data.rarities, gameSettings.dropRarityWeights, Number(mobRaritySelect.value));
    });
    
    // Render initial row (first rarity)
    if (mobRarities.length > 0) {
      renderDropRarityRow(data.rarities, gameSettings.dropRarityWeights, mobRarities[0].id);
    }
    
    // Populate mob type dropdown for drop slots
    const mobTypeSelect = $('mobTypeSelect');
    mobTypeSelect.innerHTML = '';
    for (const mob of mobCatalog) {
      const opt = document.createElement('option');
      opt.value = mob.id; opt.textContent = mob.name;
      mobTypeSelect.appendChild(opt);
    }
    
    // Add event listener to update drop slots when selection changes
    mobTypeSelect.addEventListener('change', () => {
      renderMobDropSlots(mobTypeSelect.value);
    });
    
    // Render initial mob drop slots
    if (mobCatalog.length > 0) {
      renderMobDropSlots(mobCatalog[0].id);
    }
    
    renderSacrificeWeightRows(data.sacrificeMobTypes, gameSettings.sacrificeSpawnWeights);
    $('bloodSacrificeChanceInput').value = round(gameSettings.bloodSacrificeDropChance * 100, 4);
    $('goldenLeafPercentInput').value = round(gameSettings.goldenLeafPercentPerRarity * 100, 3);
    $('privetBasePercentInput').value = round(gameSettings.privetBasePercent * 100, 3);
    $('ultraIntervalInput').value = round(gameSettings.ultraSpawnIntervalSec / 60, 3);
    $('superIntervalInput').value = round(gameSettings.superSpawnIntervalSec / 60, 3);
  } catch (e) {
    toast('Instellingen laden mislukt: ' + e.message, 'error');
  }
}

// Mob rarities that actually roll through this table — Super and Eternal
// mobs keep their own special-cased drop logic server-side (see mobs.js
// Mob.die()), so their rows would just be dead weight in the UI.
const DROP_TABLE_MOB_RARITIES = ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultra'];

function renderDropRarityRow(rarities, weights, selectedMobRarityId) {
  const wrap = $('dropUpgradeRows');
  wrap.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'drop-matrix';

  const thead = document.createElement('tr');
  for (const dropR of rarities) {
    const th = document.createElement('th');
    th.textContent = dropR.name;
    th.style.color = dropR.color || '';
    thead.appendChild(th);
  }
  table.appendChild(thead);

  const tr = document.createElement('tr');
  const row = weights[selectedMobRarityId] || [];
  for (const dropR of rarities) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.step = '0.1';
    input.className = 'dropWeightInput';
    input.dataset.mobRarityId = selectedMobRarityId;
    input.dataset.dropRarityId = dropR.id;
    input.value = round(row[dropR.id] ?? 0, 4);
    td.appendChild(input);
    tr.appendChild(td);
  }
  table.appendChild(tr);
  wrap.appendChild(table);
}

function renderSacrificeWeightRows(mobs, weights) {
  const wrap = $('sacrificeWeightRows');
  wrap.innerHTML = '';
  for (const m of mobs) {
    const row = document.createElement('div');
    row.className = 'field-grid';
    row.style.marginBottom = '4px';
    const label = document.createElement('label');
    label.textContent = m.name;
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.step = '0.1';
    input.className = 'sacrificeWeightInput';
    input.dataset.mobId = m.id;
    input.value = weights[m.id] ?? 1;
    row.append(label, input);
    wrap.appendChild(row);
  }
}

function renderMobDropSlots(mobTypeId) {
  const wrap = $('mobDropSlots');
  wrap.innerHTML = '';
  
  // Get current drop slots from server (we'll need to fetch this)
  // For now, we'll create the UI structure
  for (let slotIdx = 0; slotIdx < 5; slotIdx++) {
    const slotDiv = document.createElement('div');
    slotDiv.className = 'card';
    slotDiv.style.marginBottom = '10px';
    slotDiv.style.padding = '10px';
    
    const slotTitle = document.createElement('div');
    slotTitle.className = 'section-title';
    slotTitle.textContent = `Slot ${slotIdx + 1}`;
    slotTitle.style.marginTop = '0';
    slotDiv.appendChild(slotTitle);
    
    const dropsContainer = document.createElement('div');
    dropsContainer.id = `slot-${slotIdx}-drops`;
    dropsContainer.className = 'slot-drops';
    slotDiv.appendChild(dropsContainer);
    
    const addDropBtn = document.createElement('button');
    addDropBtn.className = 'secondary';
    addDropBtn.textContent = '+ Drop toevoegen';
    addDropBtn.type = 'button';
    addDropBtn.addEventListener('click', () => addDropRow(slotIdx, dropsContainer));
    slotDiv.appendChild(addDropBtn);
    
    wrap.appendChild(slotDiv);
  }
  
  // Load existing drops for this mob
  loadMobDrops(mobTypeId);
}

function addDropRow(slotIdx, container) {
  const row = document.createElement('div');
  row.className = 'field-grid';
  row.style.marginBottom = '4px';
  
  const petalSelect = document.createElement('select');
  petalSelect.className = 'drop-petal-select';
  for (const p of catalog.petals) {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    petalSelect.appendChild(opt);
  }
  
  const weightInput = document.createElement('input');
  weightInput.type = 'number';
  weightInput.min = '0';
  weightInput.step = '0.1';
  weightInput.placeholder = 'Gewicht';
  weightInput.className = 'drop-weight-input';
  weightInput.dataset.slotIdx = slotIdx;
  
  const removeBtn = document.createElement('button');
  removeBtn.className = 'danger';
  removeBtn.textContent = '×';
  removeBtn.type = 'button';
  removeBtn.addEventListener('click', () => row.remove());
  
  row.append(petalSelect, weightInput, removeBtn);
  container.appendChild(row);
}

async function loadMobDrops(mobTypeId) {
  try {
    const data = await api('/admin/mob-drops/' + mobTypeId);
    const dropSlots = data.dropSlots || [[], [], [], [], []];
    
    for (let slotIdx = 0; slotIdx < 5; slotIdx++) {
      const container = $(`slot-${slotIdx}-drops`);
      if (!container) continue;
      container.innerHTML = '';
      
      const drops = dropSlots[slotIdx] || [];
      for (const drop of drops) {
        addDropRowWithValue(slotIdx, container, drop[0], drop[1]);
      }
      
      // Add at least one empty row if slot is empty
      if (drops.length === 0) {
        addDropRow(slotIdx, container);
      }
    }
  } catch (e) {
    // If loading fails, add default rows
    for (let slotIdx = 0; slotIdx < 5; slotIdx++) {
      const container = $(`slot-${slotIdx}-drops`);
      if (!container) continue;
      container.innerHTML = '';
      if (slotIdx === 0) {
        addDropRow(0, container);
      }
    }
  }
}

function addDropRowWithValue(slotIdx, container, petalType, weight) {
  const row = document.createElement('div');
  row.className = 'field-grid';
  row.style.marginBottom = '4px';
  
  const petalSelect = document.createElement('select');
  petalSelect.className = 'drop-petal-select';
  for (const p of catalog.petals) {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    if (p.id === petalType) opt.selected = true;
    petalSelect.appendChild(opt);
  }
  
  const weightInput = document.createElement('input');
  weightInput.type = 'number';
  weightInput.min = '0';
  weightInput.step = '0.1';
  weightInput.placeholder = 'Gewicht';
  weightInput.className = 'drop-weight-input';
  weightInput.dataset.slotIdx = slotIdx;
  weightInput.value = weight;
  
  const removeBtn = document.createElement('button');
  removeBtn.className = 'danger';
  removeBtn.textContent = '×';
  removeBtn.type = 'button';
  removeBtn.addEventListener('click', () => row.remove());
  
  row.append(petalSelect, weightInput, removeBtn);
  container.appendChild(row);
}

function collectMobDropSlots() {
  const slots = [];
  for (let slotIdx = 0; slotIdx < 5; slotIdx++) {
    const container = $(`slot-${slotIdx}-drops`);
    if (!container) continue;
    
    const drops = [];
    const rows = container.querySelectorAll('.field-grid');
    rows.forEach(row => {
      const petalSelect = row.querySelector('.drop-petal-select');
      const weightInput = row.querySelector('.drop-weight-input');
      if (petalSelect && weightInput && weightInput.value) {
        drops.push([petalSelect.value, Number(weightInput.value)]);
      }
    });
    slots.push(drops);
  }
  return slots;
}

async function saveMobDrops() {
  const mobTypeId = $('mobTypeSelect').value;
  const btn = $('saveMobDropsBtn');
  btn.disabled = true;
  try {
    const body = {
      dropSlots: collectMobDropSlots()
    };
    await api('/admin/mob-drops/' + mobTypeId, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    toast('Mob drops opgeslagen', 'ok');
    $('mobDropsHint').textContent = 'Laatst opgeslagen: ' + new Date().toLocaleTimeString();
  } catch (e) {
    toast('Opslaan mislukt: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function collectDropRarityWeights() {
  const matrix = gameSettings ? gameSettings.dropRarityWeights.map((row) => row.slice()) : [];
  document.querySelectorAll('.dropWeightInput').forEach((input) => {
    const mobId = Number(input.dataset.mobRarityId);
    const dropId = Number(input.dataset.dropRarityId);
    if (!matrix[mobId]) matrix[mobId] = [];
    matrix[mobId][dropId] = Math.max(0, Number(input.value) || 0);
  });
  return matrix;
}

function collectSacrificeWeights() {
  const weights = {};
  document.querySelectorAll('.sacrificeWeightInput').forEach((input) => {
    weights[input.dataset.mobId] = Math.max(0, Number(input.value) || 0);
  });
  return weights;
}

async function saveGameSettings() {
  const btn = $('saveSettingsBtn');
  btn.disabled = true;
  try {
    const body = {
      dropRarityWeights: collectDropRarityWeights(),
      sacrificeSpawnWeights: collectSacrificeWeights(),
      bloodSacrificeDropChance: Math.max(0, Math.min(100, Number($('bloodSacrificeChanceInput').value) || 0)) / 100,
      goldenLeafPercentPerRarity: Math.max(0, Number($('goldenLeafPercentInput').value) || 0) / 100,
      privetBasePercent: Math.max(0, Number($('privetBasePercentInput').value) || 0) / 100,
      ultraSpawnIntervalSec: Math.max(0, Number($('ultraIntervalInput').value) || 0) * 60,
      superSpawnIntervalSec: Math.max(0, Number($('superIntervalInput').value) || 0) * 60,
    };
    const res = await api('/admin/game-settings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    gameSettings = res.settings;
    toast('Instellingen opgeslagen', 'ok');
    $('settingsHint').textContent = 'Laatst opgeslagen: ' + new Date().toLocaleTimeString();
  } catch (e) {
    toast('Opslaan mislukt: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function doSearch() {
  const q = $('searchInput').value.trim();
  const box = $('results');
  box.innerHTML = '<div class="muted">Zoeken...</div>';
  try {
    const { accounts } = await api('/admin/search?q=' + encodeURIComponent(q));
    if (accounts.length === 0) {
      box.innerHTML = '<div class="muted">Geen accounts gevonden.</div>';
      return;
    }
    box.innerHTML = '';
    for (const acc of accounts) {
      const el = document.createElement('div');
      el.className = 'acc-item' + (acc.id === currentAccountId ? ' active' : '');
      el.innerHTML = `
        <img src="${acc.avatar || ''}" onerror="this.style.visibility='hidden'" />
        <div class="name">${escapeHtml(acc.username || ('#' + acc.id))}</div>
        <div class="meta">
          <span>${escapeHtml(acc.discordId || '')}</span>
          <span class="dot ${acc.online ? 'online' : ''}"></span>
          <span>${acc.online ? 'online' : 'offline'}</span>
        </div>`;
      el.addEventListener('click', () => loadAccount(acc.id));
      box.appendChild(el);
    }
  } catch (e) {
    box.innerHTML = '';
    toast('Zoeken mislukt: ' + e.message, 'error');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadAccount(id) {
  try {
    const data = await api('/admin/account/' + id);
    currentAccountId = id;
    currentSave = data.save;
    $('editorCard').style.display = '';
    $('edAvatar').src = data.avatar || '';
    $('edName').textContent = data.username || ('#' + data.id);
    $('edMeta').textContent = `#${data.id} · ${data.discordId} · ${data.online ? 'online' : 'offline'}`;
    $('fLevel').value = data.save.level;
    $('fXp').value = data.save.xp;
    renderInventory(data.save.inventory);
    renderLoadout(data.save.primary, data.save.secondary);
    $('saveHint').textContent = '';
    document.querySelectorAll('.acc-item').forEach((el, i) => {});
    doSearch(); // refresh highlighting of active row
  } catch (e) {
    toast('Laden mislukt: ' + e.message, 'error');
  }
}

function renderInventory(inventory) {
  const wrap = $('invRows');
  wrap.innerHTML = '';
  for (const entry of inventory) addInvRow(entry.type, entry.rarity, entry.count);
  if (inventory.length === 0) addInvRow();
}

function addInvRow(type, rarity, count) {
  const wrap = $('invRows');
  const row = document.createElement('div');
  row.className = 'inv-row';

  const petalSel = document.createElement('select');
  for (const p of catalog.petals) {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    if (p.id === type) opt.selected = true;
    petalSel.appendChild(opt);
  }

  const raritySel = document.createElement('select');
  for (const r of catalog.rarities) {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = r.name;
    if (r.id === rarity) opt.selected = true;
    raritySel.appendChild(opt);
  }

  const countInput = document.createElement('input');
  countInput.type = 'number'; countInput.min = '1'; countInput.max = '999999';
  countInput.value = count ?? 1;

  const delBtn = document.createElement('button');
  delBtn.type = 'button'; delBtn.className = 'danger'; delBtn.textContent = '×';
  delBtn.addEventListener('click', () => row.remove());

  row.append(petalSel, raritySel, countInput, delBtn);
  wrap.appendChild(row);
}

function collectInventory() {
  const rows = $('invRows').querySelectorAll('.inv-row');
  const inventory = [];
  rows.forEach((row) => {
    const [petalSel, raritySel, countInput] = row.querySelectorAll('select, input');
    const count = Math.floor(Number(countInput.value));
    if (count > 0) {
      inventory.push({ type: petalSel.value, rarity: Number(raritySel.value), count });
    }
  });
  return inventory;
}

// Builds one petal+rarity select pair for a single loadout slot. `slot` is
// either { type, rarity } or null/undefined (empty slot).
function makeLoadoutSlotEl(slot) {
  const wrap = document.createElement('div');
  wrap.className = 'loadout-slot';

  const petalSel = document.createElement('select');
  const emptyOpt = document.createElement('option');
  emptyOpt.value = ''; emptyOpt.textContent = '— leeg —';
  petalSel.appendChild(emptyOpt);
  for (const p of catalog.petals) {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    if (slot && p.id === slot.type) opt.selected = true;
    petalSel.appendChild(opt);
  }

  const raritySel = document.createElement('select');
  for (const r of catalog.rarities) {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = r.name;
    if (slot && r.id === slot.rarity) opt.selected = true;
    raritySel.appendChild(opt);
  }
  raritySel.disabled = !slot;

  petalSel.addEventListener('change', () => { raritySel.disabled = !petalSel.value; });

  wrap.append(petalSel, raritySel);
  return wrap;
}

function renderLoadout(primary, secondary) {
  const wrap = $('loadoutRows');
  wrap.innerHTML = '';
  const count = Math.max(primary?.length || 0, secondary?.length || 0, 5);
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'loadout-row';
    const label = document.createElement('span');
    label.className = 'slot-label';
    label.textContent = 'Slot ' + (i + 1);
    row.appendChild(label);
    row.appendChild(makeLoadoutSlotEl(primary?.[i] || null));
    row.appendChild(makeLoadoutSlotEl(secondary?.[i] || null));
    wrap.appendChild(row);
  }
}

function collectLoadoutSide(sideIndex) {
  const rows = $('loadoutRows').querySelectorAll('.loadout-row');
  const slots = [];
  rows.forEach((row) => {
    const slotEl = row.querySelectorAll('.loadout-slot')[sideIndex];
    const [petalSel, raritySel] = slotEl.querySelectorAll('select');
    slots.push(petalSel.value ? { type: petalSel.value, rarity: Number(raritySel.value) } : null);
  });
  return slots;
}

async function save() {
  if (currentAccountId == null) return;
  const body = {
    level: Math.max(1, Math.min(200, Math.floor(Number($('fLevel').value) || 1))),
    xp: Math.max(0, Math.floor(Number($('fXp').value) || 0)),
    inventory: collectInventory(),
    primary: collectLoadoutSide(0),
    secondary: collectLoadoutSide(1),
  };
  $('saveBtn').disabled = true;
  try {
    const res = await api('/admin/account/' + currentAccountId, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    toast('Opgeslagen' + (res.online ? ' (live bijgewerkt)' : ''), 'ok');
    $('saveHint').textContent = 'Laatst opgeslagen: ' + new Date().toLocaleTimeString();
  } catch (e) {
    toast('Opslaan mislukt: ' + e.message, 'error');
  } finally {
    $('saveBtn').disabled = false;
  }
}

async function clearInventoryAndLoadout() {
  if (currentAccountId == null) return;
  if (!confirm('Weet je zeker dat je de volledige inventory EN loadout van deze speler wilt wissen? Dit kan niet ongedaan worden gemaakt.')) return;
  
  $('clearBtn').disabled = true;
  try {
    const body = {
      level: Math.max(1, Math.min(200, Math.floor(Number($('fLevel').value) || 1))),
      xp: Math.max(0, Math.floor(Number($('fXp').value) || 0)),
      inventory: [],
      primary: [],
      secondary: [],
    };
    const res = await api('/admin/account/' + currentAccountId, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    toast('Inventory en loadout gewist' + (res.online ? ' (live bijgewerkt)' : ''), 'ok');
    $('saveHint').textContent = 'Laatst opgeslagen: ' + new Date().toLocaleTimeString();
    // Refresh the UI to show the cleared state
    renderInventory([]);
    renderLoadout([], []);
  } catch (e) {
    toast('Wissen mislukt: ' + e.message, 'error');
  } finally {
    $('clearBtn').disabled = false;
  }
}

$('passwordLoginBtn').addEventListener('click', loginWithPassword);
$('passwordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loginWithPassword(); });

$('searchBtn').addEventListener('click', doSearch);
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
$('addInvBtn').addEventListener('click', () => addInvRow());
$('saveBtn').addEventListener('click', save);
$('clearBtn').addEventListener('click', clearInventoryAndLoadout);
$('reloadBtn').addEventListener('click', () => currentAccountId != null && loadAccount(currentAccountId));
$('spawnSuperBtn').addEventListener('click', () => spawnSuper());
$('refreshMapBtn').addEventListener('click', refreshMobMap);
$('mobMap').addEventListener('click', onMapClick);
$('saveSettingsBtn').addEventListener('click', saveGameSettings);
$('saveMobDropsBtn').addEventListener('click', saveMobDrops);

init();