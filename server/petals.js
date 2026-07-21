import * as THREE from 'three';
import { PETAL_TYPES, RARITIES, ARENA_HALF, wallTopAt } from '../shared/config.js';
import { uid, damp } from './utils.js';

const BASE_SLOTS = 5;
const BASE_ROT_SPEED = 2.4;
const ORBIT_NEUTRAL = 2.7;
const ORBIT_ATTACK = 4.8;
const ORBIT_DEFEND = 1.7;

export class PetalManager {
  constructor(world, player) {
    this.world = world;
    this.player = player;
    this.primary = Array.from({ length: BASE_SLOTS }, () => ({ type: 'basic', rarity: 0 }));
    this.secondary = Array.from({ length: BASE_SLOTS }, () => null);
    this.instances = [];
    this.projectiles = [];
    this.rot = 0;
    this.rotFactor = 1;
    this.radius = ORBIT_NEUTRAL;
    this.rebuildAll();
  }

  fireProjectile(inst) {
    const orbitOffset = inst.pos.clone().sub(this.player.pos).setY(0);
    if (orbitOffset.lengthSq() < 0.25) return;

    const input = this.player.input;
    const dir = input.fps
      ? new THREE.Vector3(-Math.sin(input.yaw), 0, -Math.cos(input.yaw))
      : new THREE.Vector3(input.tx - this.player.pos.x, 0, input.tz - this.player.pos.z);
    if (dir.lengthSq() < 0.01) dir.copy(orbitOffset);
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = input.pitch;
    dir.multiplyScalar(Math.cos(pitch));
    dir.y = Math.sin(pitch);
    const def = PETAL_TYPES[inst.type].projectile;
    this.projectiles.push({
      id: uid(),
      type: inst.type,
      rarity: inst.rarity,
      pos: inst.pos.clone().setY(this.player.pos.y),
      vel: dir.multiplyScalar(def.speed),
      radius: inst.radius,
      dmg: inst.dmg,
      life: def.life,
      yaw,
      pitch: -pitch,
      dead: false,
    });
    this.destroyInstance(inst);
  }

  changeRotSpeed(delta) {
    this.rotFactor = Math.max(0.3, Math.min(1, this.rotFactor + delta));
    this.player.toast(`Rotation ${Math.round(this.rotFactor * 100)}%`);
  }

  setSlotCount(count) {
    count = Math.max(BASE_SLOTS, Math.min(11, count));
    while (this.primary.length < count) this.primary.push(null);
    while (this.secondary.length < count) this.secondary.push(null);
    if (this.primary.length > count) this.primary.length = count;
    if (this.secondary.length > count) this.secondary.length = count;
  }

  // true if `item` (a {type, rarity} pair, or null) is functionally
  // identical to whatever already sits in row/i — used so swapping a slot
  // with its own duplicate (same type+rarity) is a no-op instead of
  // discarding a live petal to force an identical one to reload in
  sameAsSlot(row, i, item) {
    const slot = (row === 'primary' ? this.primary : this.secondary)[i];
    return !!slot && !!item && slot.type === item.type && slot.rarity === item.rarity;
  }

  swapSlot(i) {
    if (this.sameAsSlot('primary', i, this.secondary[i])) return; // identical both sides — nothing to do
    const affectsReloads = this.primary[i]?.type === 'goldenleaf' || this.secondary[i]?.type === 'goldenleaf';
    [this.primary[i], this.secondary[i]] = [this.secondary[i], this.primary[i]];
    if (affectsReloads) this.rebuildAll(false);
    else this.replaceSlot(i);
  }

  swapRows() {
    // per-slot: pairs holding an identical petal on both sides are left
    // alone (their live instance keeps its hp/cooldown/id untouched) —
    // only genuinely different slots swap and reload in
    const changed = new Set();
    for (let i = 0; i < this.primary.length; i++) {
      if (this.sameAsSlot('primary', i, this.secondary[i])) continue;
      [this.primary[i], this.secondary[i]] = [this.secondary[i], this.primary[i]];
      changed.add(i);
    }
    if (changed.size === 0) return;
    if (this.primary.some((slot) => slot?.type === 'goldenleaf') || this.secondary.some((slot) => slot?.type === 'goldenleaf')) this.rebuildAll(false);
    else this.rebuildChanged(changed);
  }

  equip(row, i, item) {
    const slots = row === 'primary' ? this.primary : this.secondary;
    const old = slots[i];
    slots[i] = item;
    if (row === 'primary') {
      if (old?.type === 'goldenleaf' || item?.type === 'goldenleaf') this.rebuildAll(false);
      else this.replaceSlot(i);
    }
    return old;
  }
  
  makeInstances(slot, slotIdx, total, startPosIdx, readyNow) {
    const def = PETAL_TYPES[slot.type];
    const rarity = RARITIES[slot.rarity];
    const mult = rarity.petalMult;
    const hpMult = def.flatHp ? 1 : mult;
    const size = def.radius * (1 + slot.rarity * 0.12);

    let dmg = def.dmg * mult;

    if (slot.type === 'iris' || slot.type === 'pincer') {
      // Privet boosts the damage of Iris and Pincer. The old call targeted a
      // removed helper, which crashed the server while loading these petals.
      dmg *= this.getPrivetMultiplier(slot.type, slot.rarity);
    }

    const reloadMultiplier = this.getGoldenLeafReloadMultiplier();
    const out = [];

    for (let j = 0; j < def.count; j++) {
    const slow = def.slow || 0;
      out.push({
        id: uid(),
        slotIdx,
        type: slot.type,
        rarity: slot.rarity,
        angleFrac: (startPosIdx + j) / total,
        radius: size,
        maxHp: def.hp * hpMult,
        hp: def.hp * hpMult,
        dmg,
        heal: (def.heal || 0) * mult,
        reload: def.reload * reloadMultiplier,
        alive: readyNow,
        cooldown: readyNow ? 0 : def.reload * reloadMultiplier,
        pos: this.player.pos.clone(),
      });
    }

    return out;
  }

  getPrivetMultiplier(petalType, petalRarity) {
      let mult = 1;

      for (const slot of this.primary) {
          if (!slot || slot.type !== 'privet')
              continue;

          // Alleen Iris en Pincer krijgen de bonus
          if (petalType !== 'iris' && petalType !== 'pincer')
              continue;

          const diff = Math.max(0, petalRarity - slot.rarity);
          const bonus = 0.5 * Math.pow(0.5, diff);

          mult *= 1 + bonus;
      }

      return mult;
  }

  getGoldenLeafReloadMultiplier() {
    let reduction = 0;
    for (const slot of this.primary) {
      if (slot?.type === 'goldenleaf') reduction += slot.rarity * 0.1;
    }
    // Common = 0%, Unusual = 10%, Rare = 20%, and so on. Multiple Golden
    // Leafs stack, but no reload may be reduced by more than 90%.
    return 1 - Math.min(0.9, reduction);
  }

  rebuildAll(readyNow = true) {
    this.instances = [];
    const counts = this.primary.map((s) => (s ? PETAL_TYPES[s.type].count : 0));
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) return;

    let posIdx = 0;
    this.primary.forEach((slot, slotIdx) => {
      if (!slot) return;
      this.instances.push(...this.makeInstances(slot, slotIdx, total, posIdx, readyNow));
      posIdx += PETAL_TYPES[slot.type].count;
    });
  }

  replaceSlot(slotIdx) {
    this.rebuildChanged(new Set([slotIdx]));
  }

  // rebuild only the slots in `changedIdx` (their old instance is discarded
  // and the new one reloads in); every other primary slot keeps its
  // existing instances untouched (only angleFrac is refreshed, since the
  // total orbit position count can shift). Generalizes the old single-slot
  // replaceSlot to cover swapRows, where several slots can change in one
  // atomic pass while slots holding an identical petal on both sides are
  // meant to stay completely undisturbed.
  rebuildChanged(changedIdx) {
    const counts = this.primary.map((s) => (s ? PETAL_TYPES[s.type].count : 0));
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) {
      this.instances = [];
      return;
    }

    const bySlot = new Map();
    for (const inst of this.instances) {
      if (!bySlot.has(inst.slotIdx)) bySlot.set(inst.slotIdx, []);
      bySlot.get(inst.slotIdx).push(inst);
    }

    const rebuilt = [];
    let posIdx = 0;
    this.primary.forEach((slot, i) => {
      if (!slot) return;
      if (changedIdx.has(i)) {
        rebuilt.push(...this.makeInstances(slot, i, total, posIdx, false));
      } else {
        const existing = bySlot.get(i) || [];
        const stale = existing.length !== counts[i]
          || existing[0].type !== slot.type || existing[0].rarity !== slot.rarity;
        if (stale) {
          rebuilt.push(...this.makeInstances(slot, i, total, posIdx, false));
        } else {
          for (let j = 0; j < counts[i]; j++) {
            const inst = existing[j];
            inst.angleFrac = (posIdx + j) / total;
            rebuilt.push(inst);
          }
        }
      }
      posIdx += counts[i];
    });
    this.instances = rebuilt;
  }

  destroyInstance(inst) {
    inst.alive = false;
    inst.cooldown = inst.reload;
  }

  update(dt) {
    const input = this.player.input;
    const targetR = input.atk ? ORBIT_ATTACK : input.def ? ORBIT_DEFEND : ORBIT_NEUTRAL;
    this.radius += (targetR - this.radius) * damp(8, dt);
    this.rot += BASE_ROT_SPEED * this.rotFactor * dt;

    const p = this.player;
    for (const inst of this.instances) {
      if (!inst.alive) {
        inst.cooldown -= dt;
        if (inst.cooldown <= 0 && !p.dead) {
          inst.alive = true;
          inst.hp = inst.maxHp;
          inst.pos.copy(p.pos);
        }
        continue;
      }
      if (p.dead) continue;

      const angle = this.rot + inst.angleFrac * Math.PI * 2;
      const target = new THREE.Vector3(
        p.pos.x + Math.cos(angle) * this.radius, p.pos.y,
        p.pos.z + Math.sin(angle) * this.radius
      );

      if (inst.type === 'rose' && p.hp < p.maxHp * 0.9 && !p.dead) {
        target.set(p.pos.x, p.pos.y, p.pos.z);
        inst.pos.lerp(target, damp(6, dt));
        if (inst.pos.distanceTo(target) < 0.8) {
          p.heal(inst.heal);
          this.destroyInstance(inst);
        }
      } else {
        inst.pos.lerp(target, damp(12, dt));
      }

      if (inst.type === 'leaf') p.heal(inst.heal * dt);

      if (PETAL_TYPES[inst.type].projectile && input.atk && this.radius > 3.6) {
        this.fireProjectile(inst);
      }
    }

    for (const proj of this.projectiles) {
      proj.pos.addScaledVector(proj.vel, dt);
      proj.life -= dt;
      if (proj.life <= 0 || wallTopAt(proj.pos.x, proj.pos.z) > proj.pos.y ||
          Math.max(Math.abs(proj.pos.x), Math.abs(proj.pos.z)) > ARENA_HALF + 4) {
        proj.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((proj) => !proj.dead);
  }
}
