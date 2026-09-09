import { RARITIES, PLAYER_MODEL_IDS } from '../../shared/config.js';
import { PETAL_TYPES, petalStat, CRAFT_CHANCES } from '../../shared/petals.js';
import { MOB_TYPES } from '../../shared/mobs.js';
import basicIcon from '../assets/basic.svg';
import rockIcon from '../assets/rock.svg';
import roseIcon from '../assets/rose.svg';
import lightIcon1 from '../assets/light1.svg';
import lightIcon2 from '../assets/light2.svg';
import lightIcon3 from '../assets/light3.svg';
import lightIcon5 from '../assets/light5.svg';
import stingerIcon from '../assets/stinger.svg';
import tringerIcon from '../assets/tringer.svg';
import pingerIcon from '../assets/pinger.svg';
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
import nazaramuletIcon from '../assets/nazar.svg';
import lightbulbIcon from '../assets/bulb.svg';
import holywingIcon from '../assets/jobwing.svg';
import holyleafIcon from '../assets/jobleaf.svg';
import holycornIcon from '../assets/jobcorn.svg';
import holyriceIcon from '../assets/jobrice.svg';
import magnetIcon from '../assets/magnet.svg';
import inventoryBundleIcon from '../assets/inventory_bundle.png';
import pollenIcon from '../assets/pollen.svg';
import fasterIcon from '../assets/faster.svg';
import heavyIcon from '../assets/heavy.svg';
import craftingIcon from '../assets/molecule.svg';

function shade(hex, f = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.round(((n >> shift) & 0xff) * f);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

export const PETAL_ICONS = {
  basic: basicIcon,
  rockPetal: rockIcon,
  rose: roseIcon,
  light1: lightIcon1,
  light2: lightIcon2,
  light3: lightIcon3,
  light5: lightIcon5,
  stinger: stingerIcon,
  tringer: tringerIcon,
  pinger: pingerIcon,
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
  pharcrown: crownIcon,
  beetleegg: beetleeggIcon,
  root: rootIcon,
  dahlia: dahliaIcon,
  yinyang: yinyangIcon,
  cactusPetal: cactusPetalIcon,
  bur: burIcon,
  nazaramulet: nazaramuletIcon,
  lightbulb: lightbulbIcon,
  holywing: holywingIcon,
  holyleaf: holyleafIcon,
  holycorn: holycornIcon,
  holyrice: holyriceIcon,
  magnet: magnetIcon,
  pollen: pollenIcon,
  faster: fasterIcon,
  heavy: heavyIcon,
};
// Craft animation timing (all in seconds).
// Phase 1: the 3 slots spin around the (invisible) center point several full turns.
// Phase 2: the slots zoom out to nothing.
// Phase 3: a short pause where nothing is shown (also where we wait for the
//          server's craft result if it hasn't arrived yet).
// Phase 4: the result zooms back in (single slot on success, 3 slots w/ leftovers on failure).
// Phase 5: the result just sits there until the player picks something new to craft.
const CRAFT_SPIN_T = 1.5;
const CRAFT_SPIN_TURNS = 6;
const CRAFT_ZOOMOUT_T = 0.5;
const CRAFT_GAP_T = 0.25;
const CRAFT_REVEAL_T = 0.175;
// Safety cap: if the server's craft result somehow never arrives, don't wait
// forever in the "gap" phase — bail out after this many extra seconds.
const CRAFT_RESULT_TIMEOUT_T = 3;

export class UI {
  constructor(game) {
    this.game = game;
    this.state = null;
    this.selected = null;
    this.loadoutKey = '';
    this.inventoryKey = '';
    this.modelKey = null;
    this.craftAnim = 0;
    this.craftAnimT = 0;
    this.craftAnimT2 = 0;
    this.toCraft = { type: '', rarity: 0, amount: 0 }

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
      crafting: document.getElementById('crafting'),
      craftModule: document.getElementById('craftModule'),
      craftIcon: document.getElementById('craftIcon'),
      craftIconImg: document.getElementById('craftIconImg'),
      craftCollapse: document.getElementById('craftCollapse'),
      craftSlots: [document.getElementById('craftslot0'),document.getElementById('craftslot1'),document.getElementById('craftslot2')],
      craftPetals: document.getElementById('craftpetals'),
      craftList: document.getElementById('craftlist'),
      craftButton: document.getElementById('craftbutton'),
      craftPetalCenter: document.getElementById('craftpetalcenter'),
      craftButtonStr: document.getElementById('craftbuttonstr'),
      //craftPetals: [document.getElementById('craftpetal0'),document.getElementById('craftpetal1'),document.getElementById('craftpetal2')],
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
      stats: this.el.tooltip.querySelector('.tt-stats'),
      // health: this.el.tooltip.querySelector('.tt-health'),
      // damage: this.el.tooltip.querySelector('.tt-damage'),
      // heal: this.el.tooltip.querySelector('.tt-heal'),
      // modifiers: this.el.tooltip.querySelector('.tt-modifiers'),
    };
    this.el.invIconImg.src = inventoryBundleIcon;
    this.el.craftIconImg.src = craftingIcon;
    this.el.invTiles = {};

    // Inventory / Skins / Crafting windows: only one may be open at a
    // time. Each remembers its own last-open state across sessions, but on
    // load (and whenever one is opened) we enforce the "only one" rule.
    this.invOpen = true;
    try { this.invOpen = localStorage.getItem('florr3d-inv-open') !== '0'; } catch {}
    this.skinsOpen = false;
    try { this.skinsOpen = localStorage.getItem('florr3d-skins-open') === '1'; } catch {}
    this.craftOpen = false;
    try { this.craftOpen = localStorage.getItem('florr3d-craft-open') === '1'; } catch {}
    if (this.craftOpen) { this.invOpen = false; this.skinsOpen = false; }
    else if (this.skinsOpen) { this.invOpen = false; }

    this.el.invIcon.addEventListener('click', () => this.setInventoryOpen(true));
    this.el.invCollapse.addEventListener('click', () => this.setInventoryOpen(false));
    this.applyInventoryOpen();

    this.el.skinsIcon.addEventListener('click', () => this.setSkinsOpen(true));
    this.el.skinsCollapse.addEventListener('click', () => this.setSkinsOpen(false));
    this.applySkinsOpen();
    this.renderSkins();

    this.el.craftIcon.addEventListener('click', () => this.setCraftingOpen(true));
    this.el.craftCollapse.addEventListener('click', () => this.setCraftingOpen(false));
    this.applyCraftingOpen();
    this.el.craftButton.addEventListener('click', () => this.startCraft());
    //this.el.craftPetalCenter.addEventListener('click', () => {if (this.prog > 0.95) this.endCraft()});
  }

  applyInventoryOpen() {
    this.el.invModule.classList.toggle('open', this.invOpen);
  }

  setInventoryOpen(open) {
    this.invOpen = open;
    if (open) { this.setSkinsOpen(false); this.setCraftingOpen(false); }
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
    if (open) { this.setInventoryOpen(false); this.setCraftingOpen(false); }
    this.applySkinsOpen();
    try { localStorage.setItem('florr3d-skins-open', open ? '1' : '0'); } catch {}
  }

  toggleSkins() {
    this.setSkinsOpen(!this.skinsOpen);
  }

  applyCraftingOpen() {
    this.el.craftModule.classList.toggle('open', this.craftOpen);
  }

  setCraftingOpen(open) {
    this.craftOpen = open;
    if (open) { this.setInventoryOpen(false); this.setSkinsOpen(false); }
    this.applyCraftingOpen();
    try { localStorage.setItem('florr3d-craft-open', open ? '1' : '0'); } catch {}
  }

  toggleCrafting() {
    this.setCraftingOpen(!this.craftOpen);
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
      this.renderCrafting();
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

    for (const ev of state.events) this.handleEvent(ev, p);
  }

  renderBossBars(state) {
    const container = this.el.bossbars;
    if (!container) return;
    const bosses = (state.mobs || [])
      // Only pin bosses that are meaningfully near the player, rather than
      // filling the HUD with every top-tier mob in streaming range.
      .filter((mob) => mob.rarity >= 7 && Math.hypot(mob.x - state.player.x, mob.z - state.player.z) <= 85)
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
    const scrollTop = grid.scrollTop;
    grid.innerHTML = '';
    if (!this.state) return;
    this.renderCrafting();

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
      grid.innerHTML = '<div class="inv-empty">No petals yet - defeat mobs to collect some!</div>';
      return;
    }

    // One row per type, sorted A→Z by display name; columns are rarity, low→high.
    const types = [...byType.keys()].sort(
      (a, b) => PETAL_TYPES[a].name(0).localeCompare(PETAL_TYPES[b].name(0)));
    grid.style.setProperty('--cols', maxRarity + 1);
    for (const type of types) {
      const row = document.createElement('div');
      row.className = 'invrow';
      for (const [rarity, count] of byType.get(type)) {
        const tile = this.makeInvTile(`${type}:${rarity}`, type, rarity, count);
        this.el.invTiles[`${type}:${rarity}`] = tile;
        // Pin to (row 1, rarity column). The explicit grid-row is essential:
        // without it, tiles added out of rarity order get bumped onto extra
        // rows by grid's sparse auto-placement (the "split across rows" bug).
        tile.style.gridColumn = String(rarity + 1);
        tile.style.gridRow = '1';
        //console.log(this.toCraft.type + ' ' + type);
        if ((this.craftAnim > 0) && (this.toCraft.type === type) && (!this.unhideInvRow)) {
          tile.style.visibility = 'hidden';
        } else tile.style.visibility = 'visible';
        row.appendChild(tile);
      }
      grid.appendChild(row);
    }
    grid.scrollTop = scrollTop;
  }

  /* this whole crafting thing is a mess of spaghetti code */
  /* but at least it's not vibecoded */
  /* B) (take that cubenite) */

  // Select this petal for crafting - only available via the craft list menu
  // (see renderCraftList), not from the main inventory grid.
  selectForCraft(type, rarity, count) {
    const def = PETAL_TYPES[type];
    // Selecting is allowed either while idle (0) or while a finished craft
    // result is just sitting on screen (5) — in the latter case picking
    // something new is what clears that result away.
    const canSelect = this.craftOpen && (this.craftAnim === 0 || this.craftAnim === 5) &&
      !def?.uncraftable && (rarity < CRAFT_CHANCES.length);
    if (!canSelect) return;
    if (this.craftAnim === 5) this.clearCraftResult();
    if (this.toCraft.amount < 3) this.toCraft.amount = 0;
    if ((this.toCraft.type === type) && (this.toCraft.rarity === rarity)) {
      if (this.game.input.defendHeld()) this.toCraft.amount = count;
      else this.toCraft.amount = Math.min(this.toCraft.amount + 3, count);
    } else if (count >= 3) {
      this.toCraft = {type: type, rarity: rarity, amount: 3}
      if (this.game.input.defendHeld()) this.toCraft.amount = count;
    } else {
      this.toCraft = {type: '', rarity: 0, amount: 0}
    }
    this.el.craftButton.classList.remove('fading');
    if (this.toCraft.type != '') {
      this.el.craftButton.style.background = RARITIES[this.toCraft.rarity + 1].color;
      this.el.craftButton.style.borderColor = shade(RARITIES[this.toCraft.rarity + 1].color);
      this.el.craftButtonStr.innerHTML = `${CRAFT_CHANCES[this.toCraft.rarity]}% success chance`;
    } else {
      this.el.craftButton.style.background = `rgba(255,255,255,0.2)`;
      this.el.craftButton.style.borderColor = `rgba(0,0,0,0.35)`;
      this.el.craftButtonStr.innerHTML = `?% success chance`;
    }
    this.renderInventory();
  }

  // Dedicated crafting selection menu: lists every petal type/rarity the
  // player owns 3 or more of (i.e. everything actually craftable right
  // now), so they don't have to hunt for it in the full inventory grid.
  renderCraftList() {
    const list = this.el.craftList;
    if (!list) return;
    list.innerHTML = '';
    if (!this.state) return;

    const craftable = [];
    for (const [key, count] of this.state.inventory) {
      if (count < 3) continue;
      const [type, rarityStr] = key.split(':');
      const rarity = Number(rarityStr);
      const def = PETAL_TYPES[type];
      if (!def || !RARITIES[rarity]) continue;
      if (def.uncraftable || rarity >= CRAFT_CHANCES.length) continue;
      craftable.push({ type, rarity, count, def });
    }
    // Highest rarity first, then alphabetical within the same rarity.
    craftable.sort((a, b) => b.rarity - a.rarity || a.def.name(0).localeCompare(b.def.name(0)));

    if (craftable.length === 0) {
      list.innerHTML = '<div class="craftlist-empty">Not enough matching petals yet — collect more.</div>';
      return;
    }

    for (const { type, rarity, count, def } of craftable) {
      const icon = PETAL_ICONS[def.svg(rarity)];
      const row = document.createElement('div');
      const isSelected = this.toCraft.type === type && this.toCraft.rarity === rarity;
      // Petals already sitting in the craft slots are "reserved" — reflect
      // that in the count shown here instead of the raw amount owned.
      const available = isSelected ? Math.max(0, count - this.toCraft.amount) : count;
      row.className = 'craftlistrow' + (isSelected ? ' selected' : '');
      row.style.borderColor = shade(RARITIES[rarity].color);
      row.innerHTML =
        `<div class="craftlist-swatch" style="background:${RARITIES[rarity].color}">` +
        (icon ? `<img class="picon" src="${icon}" alt="${def.name(0)}" />` : '') +
        `</div>` +
        `<div class="craftlist-name">${def.name(0)} <span class="craftlist-rarity" style="color:${RARITIES[rarity].color}">${RARITIES[rarity].name}</span></div>` +
        `<div class="craftlist-count">x${available}</div>` +
        `<div class="craftlist-chance">${CRAFT_CHANCES[rarity]}%</div>`;
      // Always pass the true owned count (not the reduced "available" figure)
      // so re-clicking the selected row can still top up all the way to it.
      // Use pointerdown, not only click: the game canvas/input layer can
      // consume a click after pointer capture, which made this list look
      // selectable while doing nothing in-game.
      row.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.selectForCraft(type, rarity, count);
      });
      row.tabIndex = 0;
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.selectForCraft(type, rarity, count); }
      });
      list.appendChild(row);
    }
  }

  // Craft animation states (this.craftAnim):
  //   0 = idle — 3 empty/filled slots shown at rest, craft button live.
  //   1 = spinning — the 3 slots spin 3 full turns around the invisible center.
  //   2 = zooming out — the (now stationary) slots shrink away to nothing.
  //   3 = gap — brief pause, nothing shown.
  //   4 = revealing — result zooms in (single slot on success, 3 slots w/ leftovers on failure).
  //   5 = done — the result just sits there until the player picks a new craft.
  renderCrafting() {
    const ui = this.el.crafting;
    const petals = this.el.craftPetals;
    petals.innerHTML = '';
    const arr = this.splitToCraft();
    this.renderCraftList();
    const rect = ui.getBoundingClientRect();
    const success = this.cGain > 0;
    function setPos(s, r, ang) { // css is really really annoying
      const xV = r * Math.cos(ang * (Math.PI / 180));
      const yV = r * Math.sin(ang * (Math.PI / 180));
      s.style.left = `${(rect.width  / 2) * (1.2 + 0.7 * xV)}px`;
      s.style.top  = `${(rect.height / 2) * (1.8 + 0.8 * yV)}px`;
    }
    this.el.craftButton.style.top = `${rect.height - 25}px`;
    this.el.craftButton.style.left = '43%';

    let slotsScale = 1;      // scale of the 3 slots (background box + petal tile)
    let slotsVisible = true; // whether the 3 slots are shown at all
    let slotsSpin = 0;       // extra rotation (deg) on top of the resting 120°-apart layout
    let centerScale = 1;     // scale of the single result slot
    let centerVisible = false;

    if (this.craftAnim === 1) { // spinning: 3 full turns over CRAFT_SPIN_T
      slotsSpin = (CRAFT_SPIN_TURNS * 360) * Math.min(this.craftAnimT / CRAFT_SPIN_T, 1);
    } else if (this.craftAnim === 2) { // zooming out to nothing
      slotsScale = 1 - Math.min(this.craftAnimT2 / CRAFT_ZOOMOUT_T, 1);
    } else if (this.craftAnim === 3) { // gap: nothing shown
      slotsVisible = false;
    } else if (this.craftAnim === 4) { // revealing
      const t = Math.min(this.craftAnimT2 / CRAFT_REVEAL_T, 1);
      if (success) { slotsVisible = false; centerVisible = true; centerScale = t; }
      else { slotsScale = t; }
    } else if (this.craftAnim === 5) { // done, sitting there
      if (success) { slotsVisible = false; centerVisible = true; }
    }

    for (let i = 0; i < 3; i++) {
      const s = this.el.craftSlots[i];
      const ang = 120 * i + slotsSpin;
      setPos(s, 1, ang);
      const boxScale = slotsVisible ? slotsScale : 0;
      s.style.transform = `translate(-50%, -50%) scale(${boxScale})`;
      s.style.visibility = boxScale > 0.001 ? 'visible' : 'hidden';

      if (slotsVisible && this.toCraft.type != '' && arr[i] > 0) {
        const t = this.makeInvTile(`${this.toCraft.type}:${this.toCraft.rarity}`, this.toCraft.type, this.toCraft.rarity, arr[i]);
        t.style.position = 'absolute';
        t.style.transform = `translate(-50%, -50%) scale(${1.25 * slotsScale})`;
        setPos(t, 1, ang);
        petals.appendChild(t);
      }
    }

    if (this.craftCenter) {
      const boxScale = centerVisible ? centerScale : 0;
      this.craftCenter.style.transform = `translate(-50%, -50%) scale(${1.25 * boxScale})`;
      this.craftCenter.style.visibility = boxScale > 0.001 ? 'visible' : 'hidden';
      setPos(this.craftCenter, 0, 0);
    }
  }

  startCraft() {
    if (!this.toCraft.type || this.toCraft.amount < 3 || this.craftAnim !== 0) return;
    this.craftAnimT = 0;
    this.craftAnimT2 = 0;
    this.craftAnim = 1;
    this.cGain = 0;
    this.cLoss = 0;
    this.craftResultReceived = false;
    this.unhideInvRow = false;
    this.craftCenter = this.makeInvTile(`${this.toCraft.type}:${this.toCraft.rarity + 1}`, this.toCraft.type, this.toCraft.rarity + 1, 1);
    this.craftCenter.style.position = 'absolute';
    this.craftCenter.style.visibility = 'hidden';
    this.craftCenter.addEventListener('click', () => { if (this.craftAnim === 5) this.endCraft(); });
    this.el.crafting.appendChild(this.craftCenter);

    // Slowly fade the craft button away (it's already tinted to the rarity
    // we're crafting towards from selectForCraft) rather than snapping it away.
    this.el.craftButton.classList.add('fading');

    this.renderInventory();

    this.game.net.send({ t: 'craftAtt', type: this.toCraft.type, rarity: this.toCraft.rarity, count: this.toCraft.amount });
  }

  // Tears down just the animated result (the extra craftCenter tile + anim
  // state) without touching the current selection — used right before a new
  // selection takes over the slots.
  clearCraftResult() {
    this.craftAnim = 0;
    this.craftAnimT = 0;
    this.craftAnimT2 = 0;
    if (this.craftCenter && this.craftCenter.parentNode) {
      this.craftCenter.parentNode.removeChild(this.craftCenter);
    }
    this.craftCenter = null;
  }

  // Full dismissal of a finished craft result (e.g. clicking the result
  // tile itself): clears the result AND the current selection.
  endCraft() {
    this.clearCraftResult();
    this.toCraft = { type: '', rarity: 0, amount: 0 };
    this.el.craftButton.classList.remove('fading');
    this.el.craftButton.style.background = `rgba(255,255,255,0.2)`;
    this.el.craftButton.style.borderColor = `rgba(0,0,0,0.35)`;
    this.el.craftButtonStr.innerHTML = `?% success chance`;
    this.renderInventory();
  }

  updateCraftAnim(dt) {
    if (this.craftAnim === 1) { // spinning
      this.craftAnimT += dt;
      if (this.craftAnimT >= CRAFT_SPIN_T) {
        this.craftAnim = 2;
        this.craftAnimT2 = 0;
      }
    } else if (this.craftAnim === 2) { // zooming out
      this.craftAnimT2 += dt;
      if (this.craftAnimT2 >= CRAFT_ZOOMOUT_T) {
        this.craftAnim = 3;
        this.craftAnimT2 = 0;
        // Reveal the (still-hidden) inventory row underneath now that the
        // floating slots are gone — the count shown there is whatever the
        // server currently says (updates live as its own state event).
        if (!this.unhideInvRow) { this.unhideInvRow = true; this.renderInventory(); }
      }
    } else if (this.craftAnim === 3) { // gap — also where we wait for the server's craft result
      this.craftAnimT2 += dt;
      const waitedMinimum = this.craftAnimT2 >= CRAFT_GAP_T;
      const timedOut = this.craftAnimT2 >= CRAFT_GAP_T + CRAFT_RESULT_TIMEOUT_T;
      if (waitedMinimum && (this.craftResultReceived || timedOut)) {
        // Only apply the loss once we actually know it (or have given up
        // waiting) — applying it too early with a still-default 0 is what
        // used to make failed crafts look like nothing happened at all.
        this.toCraft.amount -= this.cLoss;
        this.craftAnim = 4;
        this.craftAnimT2 = 0;
      }
    } else if (this.craftAnim === 4) { // revealing
      this.craftAnimT2 += dt;
      if (this.craftAnimT2 >= CRAFT_REVEAL_T) {
        this.craftAnim = 5;
        this.craftAnimT2 = CRAFT_REVEAL_T;
      }
    }
    this.renderCrafting();
  }

  splitToCraft() {
    let l = Math.floor(this.toCraft.amount / 3);
    let rem = this.toCraft.amount % 3;
    if (rem === 2) return [l+1, l+1, l];
    else if (rem === 1) return [l+1, l, l];
    else return [l, l, l];
  }

  handleEvent(ev, p) {
    if ((ev.e === 'craft') && (ev.id == p.id) && (this.craftAnim > 0)) {
      this.cGain = ev.g;
      this.cLoss = ev.l;
      this.craftResultReceived = true;
      this.craftCenter.innerHTML = this.craftCenter.innerHTML.replace(
        '<div class="count">1</div>', `<div class="count">${this.cGain}</div>`);
    }
  }

  makeInvTile(key, type, rarity, count) {
    const def = PETAL_TYPES[type];
    const icon = PETAL_ICONS[def.svg(rarity)];
    const tile = document.createElement('div');
    tile.className = 'invtile' + (this.selected === key ? ' selected' : '');
    tile.style.background = RARITIES[rarity].color;
    tile.style.borderColor = shade(RARITIES[rarity].color);
    tile.innerHTML =
      (icon
        ? `<img class="picon" src="${icon}" alt="${def.name(0)}" />`
        : `<div class="dot" style="background:${def.color(0)}"></div><div class="pname">${def.name(0)}</div>`) +
      `<div class="count">${count}</div>`;
    tile.onclick = () => {
      // Inventory tiles only handle equipping - crafting selection is now
      // exclusively via the craft list menu
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
        const icon = PETAL_ICONS[def.svg(item.rarity)];
        const rarity = RARITIES[item.rarity];
        slot.style.background = rarity.color;
        slot.style.borderColor = shade(rarity.color);
        slot.innerHTML = icon
          ? `<img class="picon" src="${icon}" alt="${def.name(0)}" />`
          : `<div class="dot" style="background:${def.color(0)}"></div><div class="pname">${def.name(0)}</div>`;
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
    this.tt.name.textContent = def.name(0);
    
    // Calculate the reload shown for the current loadout. UI state contains
    // the equipped rows; `game` intentionally has no Player instance.
    let reloadTime = def.reload(rarityIdx);
    const primary = this.state?.petals?.primary || [];
    if (primary.length) {
      const goldenLeafReduction = primary.reduce((total, slot) => (
        slot?.type === 'goldenleaf' ? total + slot.rarity * 0.03 : total
      ), 0);
      reloadTime *= 1 - Math.min(0.9, goldenLeafReduction);
      if (type === 'stinger') {
        const stingerCount = primary
          .filter((slot) => slot?.type === 'stinger')
          .reduce((total, slot) => total + petalStat(slot, 'count'), 0);
        if (stingerCount) reloadTime += stingerCount - 1;
      }
      reloadTime = Math.round(reloadTime * 10) / 10;
    }
    
    this.tt.reload.textContent = `${reloadTime}s ⟳`;
    this.tt.rarity.textContent = rarity.name;
    this.tt.rarity.style.color = rarity.color;
    this.tt.desc.textContent = def.desc(rarityIdx) || '';
    // this.tt.health.textContent = `Health: ${Math.round(def.hp(rarityIdx) * 10) / 10}`;
    // this.tt.damage.textContent = `Damage: ${Math.round(def.dmg(rarityIdx) * 10) / 10}`;
    // if (def.heal) {
    //   this.tt.heal.textContent = `Heal: ${Math.round(def.heal(rarityIdx) * 10) / 10}`;
    //   this.tt.heal.style.display = '';
    // } else {
    //   this.tt.heal.style.display = 'none';
    // }
    this.tt.stats.innerHTML = def.stats(rarityIdx);

    // Show modifiers (minusarmor and petalsummon)
    // const modifiers = [];
    // if (def.minusarmor) {
    //   modifiers.push(`-Armor: ${def.minusarmor(rarityIdx)}`);
    // }
    // if (def.petalsummon) {
    //   const mobName = MOB_TYPES[def.petalsummon(rarityIdx)]?.name || def.petalsummon(rarityIdx);
    //   modifiers.push(`Summon: ${mobName}`);
    // }
    // if (def.infiniteHp) {
    //   modifiers.push('Infinite Health');
    // }
    // if (def.damageBlock) {
    //   const charges = 1 + rarityIdx;
    //   modifiers.push(`Charges: ${charges}`);
    // }
    // if (def.dropRadar) {
    //   modifiers.push('Drop Radar');
    // }
    // if (modifiers.length > 0) {
    //   this.tt.modifiers.textContent = modifiers.join(' | ');
    //   this.tt.modifiers.style.display = '';
    // } else {
    //   this.tt.modifiers.style.display = 'none';
    // }

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
