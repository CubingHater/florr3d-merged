import * as THREE from 'three';
import {
  RARITIES, PLAYER_MODEL_IDS, TILE_TYPES, SPAWN_IMMUNITY, SPAWN_POS, FLIGHT,
  clampToArena, collideWalls, tileTypeAt, mapHeightAtPoint,
} from '../shared/config.js';
import { PETAL_TYPES, petalStat } from '../shared/petals.js';
import { MOB_TYPES } from '../shared/mobs.js';
import { uid } from './utils.js';
import { PetalManager } from './petals.js';
import { updateFlight } from './flight.js';

const maxHpForLevel = (level) => 500 + (level - 1) * 45;

export class Player {
  constructor(world) {
    this.world = world;
    this.id = uid();
    this.name = 'Guest';
    this.accountId = null;
    this.leaderboard = { playSeconds: 0, damage: 0, craftPoints: 0, killPoints: 0, dropPoints: 0 };
    this.model = '';
    this.input = { tx: 0, tz: 0, ax: 0, az: 0, fps: false, yaw: 0, pitch: 0, atk: false, def: false };
    this.inventory = new Map();
    this.events = [];
    this.invDirty = true;
    this.xpDirty = true;
    this.pos = new THREE.Vector3(SPAWN_POS.x, 0, SPAWN_POS.z);
    this.radius = 1.1;
    this.maxHp = maxHpForLevel(1);
    this.bonusMaxHp = 0;
    this.hp = this.maxHp;
    this.armor = 0;
    this.speed = 13;
    this.moveSpeed = 0;
    this.speedMult = 1;
    this.regen = 2;
    this.level = 1;
    this.xp = 0;
    this.dead = false;
    this.deadTimer = 0;
    this.immunity = SPAWN_IMMUNITY;
    this.hitCooldowns = new Map();
    this.knock = new THREE.Vector3();
    this.flightVel = new THREE.Vector3();
    this.prevDef = false;
    this.facing = 0;
    this.zoneToasts = new Set();
    this.lastChatAt = 0;
    this.petals = new PetalManager(world, this);
  }

  toast(text) { this.events.push({ e: 'toast', text }); }

  serializeSave() {
    return {
      v: 1,
      level: this.level,
      xp: Math.floor(this.xp),
      inventory: [...this.inventory.entries()],
      primary: this.petals.primary,
      secondary: this.petals.secondary,
      playerModel: this.model,
    };
  }

  applySave(save) {
    if (!save || save.v !== 1) return;
    const normalizeType = (type) => type === 'crown' ? 'pharcrown' : type;
    const slot = (s) => (s && PETAL_TYPES[normalizeType(s.type)] && RARITIES[s.rarity]
      ? { type: normalizeType(s.type), rarity: s.rarity } : null);
    if (Number.isInteger(save.level) && save.level >= 1) this.level = Math.min(save.level, 200);
    this.maxHp = maxHpForLevel(this.level);
    this.hp = this.maxHp;
    if (Number.isFinite(save.xp) && save.xp >= 0) this.xp = save.xp;
    if (PLAYER_MODEL_IDS.includes(save.playerModel)) this.model = save.playerModel;
    if (Array.isArray(save.inventory)) {
      for (const [key, count] of save.inventory) {
        if (typeof key !== 'string' || !Number.isInteger(count) || count <= 0) continue;
        const [rawType, rarity] = key.split(':');
        const type = normalizeType(rawType);
        if (PETAL_TYPES[type] && RARITIES[Number(rarity)]) this.inventory.set(`${type}:${rarity}`, count);
      }
    }
    // Resize before applying saved rows, otherwise slots unlocked in a prior
    // session would be discarded while this fresh Player still has five.
    const savedSlots = [...(save.primary || []), ...(save.secondary || [])];
    let savedHighest = 0;
    for (const entry of savedSlots) if (entry && Number.isInteger(entry.rarity)) savedHighest = Math.max(savedHighest, entry.rarity);
    for (const [key, count] of this.inventory) {
      if (count > 0) savedHighest = Math.max(savedHighest, Number(key.split(':')[1]) || 0);
    }
    this.petals.setSlotCount(Math.max(5, savedHighest + 4));
    if (Array.isArray(save.primary)) {
      this.petals.primary = this.petals.primary.map((cur, i) => slot(save.primary[i]) ?? cur);
    }
    if (Array.isArray(save.secondary)) {
      this.petals.secondary = this.petals.secondary.map((cur, i) => slot(save.secondary[i]));
    }
    this.refreshLoadoutSlots();
    this.invDirty = true;
    this.xpDirty = true;
    this.petals.rebuildAll();
  }

  addToInventory(type, rarity, silent = false) {
    const key = `${type}:${rarity}`;
    this.inventory.set(key, (this.inventory.get(key) || 0) + 1);
    this.invDirty = true;
    this.refreshLoadoutSlots();
    if (!silent) {
      const rarityName = RARITIES[rarity]?.name || `Unknown(${rarity})`;
      const petalName = PETAL_TYPES[type]?.name(rarity) || type;
      this.toast(`+ ${rarityName} ${petalName}`);
    }
  }

  takeFromInventory(key) {
    const n = this.inventory.get(key) || 0;
    if (n <= 0) return null;
    if (n === 1) this.inventory.delete(key); else this.inventory.set(key, n - 1);
    this.invDirty = true;
    const [type, rarity] = key.split(':');
    return { type, rarity: Number(rarity) };
  }

  refreshLoadoutSlots() {
    let highest = 0;
    for (const [key, count] of this.inventory) {
      if (count <= 0) continue;
      const rarity = Number(key.split(':')[1]);
      if (Number.isInteger(rarity)) highest = Math.max(highest, rarity);
    }
    for (const slot of [...this.petals.primary, ...this.petals.secondary]) {
      if (slot) highest = Math.max(highest, slot.rarity);
    }
    // Common/Unusual: 5 slots, Rare: 6 ... Ultra: 10, Super: 10 (no 11th slot).
    const maxSlots = highest >= 8 ? 10 : highest + 4; // Super (8) and Eternal (9) capped at 10 slots
    this.petals.setSlotCount(Math.max(5, maxSlots));
  }

  xpForNext() { return Math.floor(60 * Math.pow(1.25, this.level - 1)); }

  gainXp(amount) {
    this.xp += amount;
    this.xpDirty = true;
    while (this.xp >= this.xpForNext()) {
      this.xp -= this.xpForNext();
      this.level++;
      const prev = this.maxHp;
      this.maxHp = maxHpForLevel(this.level);
      this.hp += this.maxHp - prev;
      this.toast(`Level ${this.level}!`);
    }
  }

  damage(amount) {
    if (this.dead || this.immunity > 0) return;
    
    // Check for damage block petals (nazar amulet)
    let blocked = false;
    for (const inst of this.petals.instances) {
      if (inst.alive && inst.damageBlock && inst.charges > 0) {
        // Block 99% of damage
        amount *= 0.01;
        inst.charges--;
        blocked = true;
        
        // Destroy petal if charges run out
        if (inst.charges <= 0) {
          this.petals.destroyInstance(inst);
        }
        break;
      }
    }
    
    const reducedDamage = Math.max(1, amount - this.armor);
    this.hp -= reducedDamage;
    this.world.events.push({ e: 'flash', k: 'player', id: this.id });
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadTimer = 3;
    }
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  update(dt) {
    // Only Discord-linked accounts are eventually published, but keeping the
    // counter on the player gives the socket layer a cheap, batched flush.
    if (this.accountId != null) this.leaderboard.playSeconds += dt;
    const input = this.input;

    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        this.dead = false;
        this.hp = this.maxHp;
        this.pos.set(SPAWN_POS.x, 0, SPAWN_POS.z);
        this.knock.set(0, 0, 0);
        this.flightVel.set(0, 0, 0);
        this.immunity = SPAWN_IMMUNITY;
      }
      return;
    }

    if (this.immunity > 0) {
      this.immunity = input.atk ? 0 : Math.max(0, this.immunity - dt);
    }

    this.heal(this.regen * dt);

    const prevX = this.pos.x, prevY = this.pos.y, prevZ = this.pos.z;
    const prevV = new THREE.Vector3(prevX, prevY, prevZ);

    const minFloor = mapHeightAtPoint(this.pos.x, this.pos.z);
    const airborne = this.pos.y > (minFloor + 0.01);
    let speed = this.speed * (airborne ? FLIGHT.airControl : 1);

    let norm = new THREE.Vector3(0, 1, 0);
    if (input.fps) {
      const yaw = input.yaw;
      let { ax, az } = input;
      const len = Math.hypot(ax, az);
      if (len > 1) { ax /= len; az /= len; }
      if (ax !== 0 || az !== 0) {
        const dirX = -Math.sin(yaw) * az + Math.cos(yaw) * ax;
        const dirZ = -Math.cos(yaw) * az - Math.sin(yaw) * ax;
        const delta = new THREE.Vector3(dirX, 0, dirZ);
        delta.multiplyScalar(speed * this.speedMult * dt);
        this.pos.add(delta);
        this.facing = Math.atan2(dirX, dirZ);
      } else {
        this.facing = yaw + Math.PI;
      }
    } else {
      const delta = new THREE.Vector3(input.tx - this.pos.x, 0, input.tz - this.pos.z);
      const dist = delta.length();
      if (dist > 0.6) {
        const speedFrac = Math.min(1, dist / 8);
        delta.normalize().multiplyScalar(speed * speedFrac * this.speedMult * dt);
        this.pos.add(delta);
        this.facing = Math.atan2(delta.x, delta.z);
      }
    }
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-6 * dt));
    updateFlight(this, dt);
    clampToArena(this.pos, this.radius);
    //collideWalls(this.pos, this.radius);
    this.moveSpeed = dt > 0 ? Math.hypot(this.pos.x - prevX, this.pos.z - prevZ) / dt : 0;
    
    if (this.pos.y < minFloor) this.pos.y = minFloor;
    
    this.speedMult = 1;
    if (!airborne) {
      const dYN = this.pos.clone().sub(prevV).normalize().y;
      if (dYN > 0) {
        let climbMult = Math.sqrt(1 - dYN * dYN);//Math.hypot(diff.x, diff.z);
        climbMult *= 1 - Math.min(0.9 * dYN, 0.75);
        this.speedMult *= climbMult;
      }
    }

    const tile = tileTypeAt(this.pos.x, this.pos.z);
    if (tile !== 'grass' && tile !== 'water' && !this.zoneToasts.has(tile)) {
      this.zoneToasts.add(tile);
      this.toast(`Welcome to ${TILE_TYPES[tile]?.name ?? tile}!`);
    }
  }
}
