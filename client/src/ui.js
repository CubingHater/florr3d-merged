import { PETAL_TYPES, MOB_TYPES, RARITIES, PLAYER_MODEL_IDS } from '../../shared/config.js';
import basicIcon from '../assets/basic.svg';
import rockIcon from '../assets/rock.svg';
import roseIcon from '../assets/rose.svg';
import lightIcon from '../assets/light.svg';
import stingerIcon from '../assets/stinger.svg';
import orangeIcon from '../assets/orange.svg';
import missileIcon from '../assets/missile.svg';
import glassIcon from '../assets/glass.svg';
import riceIcon from '../assets/rice.svg';
import cornIcon from '../assets/corn.svg';
import leafIcon from '../assets/leaf.svg';
import wingIcon from '../assets/wing.svg';
import bubbleIcon from '../assets/bubble.svg';
import irisIcon from '../assets/iris.svg';
import goldenleafIcon from '../assets/goldenleaf.svg';
import pincerIcon from '../assets/pincer.svg';
import privetIcon from '../assets/privet.svg';
import airIcon from '../assets/air.svg';
import bloodsacrificeIcon from '../assets/bloodsacrifice.svg';
import jobapplicationIcon from '../assets/jobapplication.svg';
import crownIcon from '../assets/crown.svg';
import beetleeggIcon from '../assets/beetleegg.svg';
import rootIcon from '../assets/root.svg';
import dahliaIcon from '../assets/dahlia.svg';
import yinyangIcon from '../assets/yinyang.svg';
import cactusPetalIcon from '../assets/cactusPetal.svg';
import burIcon from '../assets/bur.svg';
import inventoryBundleIcon from '../assets/inventory_bundle.png';

function shade(hex, f = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.round(((n >> shift) & 0xff) * f);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

export const PETAL_ICONS = {
  basic: basicIcon,
  rockPetal: rockIcon,
  rose: roseIcon,
  light: lightIcon,
  stinger: stingerIcon,
  orange: orangeIcon,
  missile: missileIcon,
  glass: glassIcon,
  rice: riceIcon,
  corn: cornIcon,
  leaf: leafIcon,
  wing: wingIcon,
  bubble: bubbleIcon,
  iris: irisIcon,
  goldenleaf: goldenleafIcon,
  pincer: pincerIcon,
  privet: privetIcon,
  air: airIcon,
  bloodsacrifice: bloodsacrificeIcon,
  jobapplication: jobapplicationIcon,
  crown: crownIcon,
  beetleegg: beetleeggIcon,
  root: rootIcon,
  dahlia: dahliaIcon,
  yinyang: yinyangIcon,
  cactuspetal: cactusPetalIcon,
  bur: burIcon,
};

export class UI {
  constructor(game) {
    this.game = game;
    this.state = null;
    this.selected = null;
    this.loadoutKey = '';
    this.inventoryKey = '';
    this.modelKey = null;

    this.el = {
      hp: document.getElementById('hpfill'),
      hpGhost: document.getElementById('hpghost'),
      xp: document.getElementById('xpfill'),
      lvl: document.getElementById('lvltext'),
      rowPrimary: document.getElementById('rowPrimary'),
      rowSecondary: document.getElementById('rowSecondary'),
      inventory: document.getElementById('inventory'),
      invModule: document.getElementById('invModule'),
      invIcon: document.getElementById('invIcon'),
      invIconImg: document.getElementById('invIconImg'),
      invCollapse: document.getElementById('invCollapse'),
      skins: document.getElementById('skins'),
      skinsModule: document.getElementById('skinsModule'),
      skinsIcon: document.getElementById('skinsIcon'),
      skinsCollapse: document.getElementById('skinsCollapse'),
      death: document.getElementById('death'),
      deathTimer: document.getElementById('deathtimer'),
      toasts: document.getElementById('toasts'),
      bossbars: document.getElementById('bossbars'),
      tooltip: document.getElementById('tooltip'),
    };
    this.tt = {
      name: this.el.tooltip.querySelector('.tt-name'),
      reload: this.el.tooltip.querySelector('.tt-reload'),
      rarity: this.el.tooltip.querySelector('.tt-rarity'),
      desc: this.el.tooltip.querySelector('.tt-desc'),
      health: this.el.tooltip.querySelector('.tt-health'),
      damage: this.el.tooltip.querySelector('.tt-damage'),
      heal: this.el.tooltip.querySelector('.tt-heal'),
    };
    this.el.invIconImg.src = inventoryBundleIcon;

    // Inventory window open/closed, remembered across sessions. Icon expands
    // it, the panel title (or Z) collapses it back to the bundle icon.
    this.invOpen = true;
    try { this.invOpen = localStorage.getItem('florr3d-inv-open') !== '0'; } catch {}
    this.el.invIcon.addEventListener('click', () => this.setInventoryOpen(true));
    this.el.invCollapse.addEventListener('click', () => this.setInventoryOpen(false));
    this.applyInventoryOpen();

    // Skins window, same open/collapse pattern as the inventory above.
    this.skinsOpen = false;
    try { this.skinsOpen = localStorage.getItem('florr3d-skins-open') === '1'; } catch {}
    this.el.skinsIcon.addEventListener('click', () => this.setSkinsOpen(true));
    this.el.skinsCollapse.addEventListener('click', () => this.setSkinsOpen(false));
    this.applySkinsOpen();
    this.renderSkins();
  }

  applyInventoryOpen() {
    this.el.invModule.classList.toggle('open', this.invOpen);
  }

  setInventoryOpen(open) {
    this.invOpen = open;
    this.applyInventoryOpen();
    try { localStorage.setItem('florr3d-inv-open', open ? '1' : '0'); } catch {}
  }

  toggleInventory() {
    this.setInventoryOpen(!this.invOpen);
  }

  applySkinsOpen() {
    this.el.skinsModule.classList.toggle('open', this.skinsOpen);
  }

  setSkinsOpen(open) {
    this.skinsOpen = open;
    this.applySkinsOpen();
    try { localStorage.setItem('florr3d-skins-open', open ? '1' : '0'); } catch {}
  }

  toggleSkins() {
    this.setSkinsOpen(!this.skinsOpen);
  }

  renderSkins() {
    const grid = this.el.skins;
    if (!grid) return;
    grid.innerHTML = '';

    // '' is the default flower look; the rest come straight from the
    // server-shared allowlist so the client can never offer (or send) a
    // skin the server would reject.
    const current = this.state?.player?.model || '';
    const options = [
      { id: '', name: 'Default' },
      ...PLAYER_MODEL_IDS.map((id) => ({ id, name: MOB_TYPES[id]?.name || id })),
    ];

    for (const opt of options) {
      const tile = document.createElement('div');
      tile.className = 'skintile' + (current === opt.id ? ' selected' : '');
      tile.innerHTML = `<div class="skintile-name stroke">${opt.name}</div>`;
      // Only cosmetic — the server keeps hitbox/stats fixed to PLAYER_RADIUS
      // regardless of which model is worn, so this can't be abused for an
      // advantage.
      tile.onclick = () => {
        if (current === opt.id) return;
        this.game.net.send({ t: 'setModel', model: opt.id });
      };
      grid.appendChild(tile);
    }
  }

  applyState(state) {
    this.state = state;

    const loadoutKey = JSON.stringify([state.petals.primary, state.petals.secondary]);
    if (loadoutKey !== this.loadoutKey) {
      this.loadoutKey = loadoutKey;
      this.renderLoadout();
      this.hideTooltip();
    }
    const inventoryKey = JSON.stringify(state.inventory);
    if (inventoryKey !== this.inventoryKey) {
      this.inventoryKey = inventoryKey;
      this.renderInventory();
      this.hideTooltip();
    }

    // p.model reflects the server-confirmed skin. Re-render the skins grid
    // whenever it changes so the "selected" highlight stays in sync (e.g.
    // after our own pick round-trips back, or an admin changes it for us).
    const modelKey = state.player.model || '';
    if (modelKey !== this.modelKey) {
      this.modelKey = modelKey;
      this.renderSkins();
    }

    const p = state.player;
    const hpFrac = `${(p.hp / p.maxHp) * 100}%`;
    this.el.hp.style.width = hpFrac;
    this.el.hpGhost.style.width = hpFrac;
    this.el.xp.style.width = `${(p.xp / p.xpNext) * 100}%`;
    this.el.lvl.textContent = `Lvl ${p.level}`;

    this.el.death.classList.toggle('show', p.dead);
    if (p.dead) {
      this.el.deathTimer.textContent = `Respawning in ${Math.max(0, p.deadTimer).toFixed(1)}s`;
    }

    this.renderBossBars(state);

    const slots = this.el.rowPrimary.children;
    for (let i = 0; i < slots.length; i++) {
      const pie = slots[i].querySelector('.cdpie');
      if (!pie) continue;
      let cd = 0;
      for (const inst of state.petals.instances) {
        if (inst.slot === i && inst.cd > cd) cd = inst.cd;
      }
      pie.style.background = cd > 0
        ? `conic-gradient(rgba(0,0,0,0.5) ${cd * 360}deg, rgba(0,0,0,0) 0deg)`
        : '';
    }
  }

  renderBossBars(state) {
    const container = this.el.bossbars;
    if (!container) return;
    const bosses = (state.mobs || [])
      // Only pin bosses that are meaningfully near the player, rather than
      // filling the HUD with every top-tier mob in streaming range.
      .filter((mob) => mob.rarity >= 6 && Math.hypot(mob.x - state.player.x, mob.z - state.player.z) <= 85)
      .sort((a, b) => a.rarity - b.rarity || a.hp - b.hp);
    container.replaceChildren();
    for (const mob of bosses) {
      const rarity = RARITIES[mob.rarity];
      const name = MOB_TYPES[mob.type]?.name || mob.type;
      const bar = document.createElement('div');
      bar.className = 'bossbar';
      bar.style.borderColor = rarity.color;
      const label = document.createElement('div');
      label.className = 'bossbar-name stroke';
      label.textContent = `${rarity.name} ${name}`;
      const track = document.createElement('div');
      track.className = 'bossbar-track';
      const fill = document.createElement('div');
      fill.className = 'bossbar-fill';
      fill.style.width = `${Math.max(0, Math.min(100, mob.hp / mob.maxHp * 100))}%`;
      fill.style.background = rarity.color;
      track.appendChild(fill); bar.append(label, track); container.appendChild(bar);
    }
  }

  renderInventory() {
    const grid = this.el.inventory;
    grid.innerHTML = '';
    if (!this.state) return;

    // Group owned petals by type, tracking the highest rarity anyone owns so
    // the grid only spans that many rarity columns.
    const byType = new Map();
    let maxRarity = 0;
    for (const [key, count] of this.state.inventory) {
      if (!(count > 0)) continue;
      const [type, rarityStr] = key.split(':');
      const rarity = Number(rarityStr);
      if (!PETAL_TYPES[type] || !RARITIES[rarity]) continue;
      if (!byType.has(type)) byType.set(type, new Map());
      byType.get(type).set(rarity, count);
      if (rarity > maxRarity) maxRarity = rarity;
    }

    if (byType.size === 0) {
      grid.innerHTML = '<div class="inv-empty">No petals yet — defeat mobs to collect some!</div>';
      return;
    }

    // One row per type, sorted A→Z by display name; columns are rarity, low→high.
    const types = [...byType.keys()].sort(
      (a, b) => PETAL_TYPES[a].name.localeCompare(PETAL_TYPES[b].name));
    grid.style.setProperty('--cols', maxRarity + 1);
    for (const type of types) {
      const row = document.createElement('div');
      row.className = 'invrow';
      for (const [rarity, count] of byType.get(type)) {
        const tile = this.makeInvTile(`${type}:${rarity}`, type, rarity, count);
        // Pin to (row 1, rarity column). The explicit grid-row is essential:
        // without it, tiles added out of rarity order get bumped onto extra
        // rows by grid's sparse auto-placement (the "split across rows" bug).
        tile.style.gridColumn = String(rarity + 1);
        tile.style.gridRow = '1';
        row.appendChild(tile);
      }
      grid.appendChild(row);
    }
  }

  makeInvTile(key, type, rarity, count) {
    const def = PETAL_TYPES[type];
    const icon = PETAL_ICONS[type];
    const tile = document.createElement('div');
    tile.className = 'invtile' + (this.selected === key ? ' selected' : '');
    tile.style.background = RARITIES[rarity].color;
    tile.style.borderColor = shade(RARITIES[rarity].color);
    tile.innerHTML =
      (icon
        ? `<img class="picon" src="${icon}" alt="${def.name}" />`
        : `<div class="dot" style="background:${def.color}"></div><div class="pname">${def.name}</div>`) +
      `<div class="count">${count}</div>`;
    tile.onclick = () => {
      this.selected = this.selected === key ? null : key;
      this.renderInventory();
    };
    tile.draggable = true;
    tile.ondragstart = (e) => {
      e.dataTransfer.setData('text/plain', key);
      e.dataTransfer.effectAllowed = 'move';
      tile.classList.add('dragging');
    };
    tile.ondragend = () => tile.classList.remove('dragging');
    tile.onmouseenter = () => this.showTooltip(tile, type, rarity);
    tile.onmouseleave = () => this.hideTooltip();
    return tile;
  }

  renderLoadout() {
    this.renderRow(this.el.rowPrimary, this.state.petals.primary, 'primary');
    this.renderRow(this.el.rowSecondary, this.state.petals.secondary, 'secondary');
  }

  renderRow(rowEl, slots, rowName) {
    rowEl.innerHTML = '';
    slots.forEach((item, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (item ? '' : ' empty');
      if (item) {
        const def = PETAL_TYPES[item.type];
        const icon = PETAL_ICONS[item.type];
        const rarity = RARITIES[item.rarity];
        slot.style.background = rarity.color;
        slot.style.borderColor = shade(rarity.color);
        slot.innerHTML = icon
          ? `<img class="picon" src="${icon}" alt="${def.name}" />`
          : `<div class="dot" style="background:${def.color}"></div><div class="pname">${def.name}</div>`;
        slot.onmouseenter = () => this.showTooltip(slot, item.type, item.rarity);
        slot.onmouseleave = () => this.hideTooltip();
      }
      if (rowName === 'primary' && item) {
        const hk = document.createElement('div');
        hk.className = 'hotkey';
        hk.textContent = i + 1;
        slot.appendChild(hk);
        const pie = document.createElement('div');
        pie.className = 'cdpie';
        slot.appendChild(pie);
      }
      slot.onclick = () => this.onSlotClick(rowName, i);
      slot.ondragover = (e) => {
        e.preventDefault();
        slot.classList.add('dragover');
      };
      slot.ondragleave = () => slot.classList.remove('dragover');
      slot.ondrop = (e) => {
        e.preventDefault();
        slot.classList.remove('dragover');
        const key = e.dataTransfer.getData('text/plain');
        if (key) this.equipInto(rowName, i, key);
      };
      rowEl.appendChild(slot);
    });
  }

  onSlotClick(rowName, i) {
    if (this.selected) this.equipInto(rowName, i, this.selected);
    else this.game.net.send({ t: 'swapSlot', i });
  }

  equipInto(rowName, i, key) {
    this.game.net.send({ t: 'equip', row: rowName, i, key });
    this.selected = null;
    this.renderInventory();
  }

  showTooltip(target, type, rarityIdx) {
    const def = PETAL_TYPES[type];
    const rarity = RARITIES[rarityIdx];
    this.tt.name.textContent = def.name;
    this.tt.reload.textContent = `${def.reload}s ⟳`;
    this.tt.rarity.textContent = rarity.name;
    this.tt.rarity.style.color = rarity.color;
    this.tt.desc.textContent = def.desc || '';
    this.tt.health.textContent = `Health: ${Math.round(def.hp * (def.flatHp ? 1 : rarity.petalMult) * 10) / 10}`;
    this.tt.damage.textContent = `Damage: ${Math.round(def.dmg * rarity.petalMult * 10) / 10}`;
    if (def.heal) {
      this.tt.heal.textContent = `Heal: ${Math.round(def.heal * rarity.petalMult * 10) / 10}`;
      this.tt.heal.style.display = '';
    } else {
      this.tt.heal.style.display = 'none';
    }

    const rect = target.getBoundingClientRect();
    this.el.tooltip.style.left = `${rect.left + rect.width / 2}px`;
    this.el.tooltip.style.top = `${rect.top - 10}px`;
    this.el.tooltip.classList.add('show');
  }

  hideTooltip() {
    this.el.tooltip.classList.remove('show');
  }

  toast(text) {
    const div = document.createElement('div');
    div.className = 'toast stroke';
    div.textContent = text;
    this.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  }
}
