import * as THREE from 'three';
import { RARITIES, ARENA_HALF, wallTopAt } from '../shared/config.js';
import { PETAL_TYPES, petalStat } from '../shared/petals.js';
import { MOB_TYPES } from '../shared/mobs.js';
import { uid, damp } from './utils.js';
import { settings } from './gameSettings.js';

const maxHpForLevel = (level) => 500 + (level - 1) * 45;

const BASE_SLOTS = 5;
const BASE_ROT_SPEED = 2.4;

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
    const def = petalStat(inst, 'projectile');
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
    count = Math.max(BASE_SLOTS, Math.min(10, count));
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
    
    // Special handling for jobapplication petal
    if (item?.type === 'jobapplication') {
      // Equip it normally
      slots[i] = item;
      if (row === 'primary') {
        if (old?.type === 'goldenleaf' || item?.type === 'goldenleaf') this.rebuildAll(false);
        else this.replaceSlot(i);
      }
      
      // Schedule removal after 15 seconds
      setTimeout(() => {
        // Remove from inventory
        const key = `${item.type}:${item.rarity}`;
        this.player.inventory.delete(key);
        this.player.invDirty = true;
        
        // Remove from loadout
        for (let j = 0; j < this.primary.length; j++) {
          if (this.primary[j]?.type === 'jobapplication') {
            this.primary[j] = null;
          }
        }
        for (let j = 0; j < this.secondary.length; j++) {
          if (this.secondary[j]?.type === 'jobapplication') {
            this.secondary[j] = null;
          }
        }
        this.player.refreshLoadoutSlots();
        this.rebuildAll(false);
        
        // tf??????
        this.player.events.push({ 
          e: 'jobapplication', 
          id: this.player.id,
          url: 'https://www.youtube.com/watch?v=glkQaZcxjwI&t=720s' 
        });
      }, 15000);
      
      return old;
    }
    
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
    // const mult = rarity.petalMult;
    // const hpMult = 1;//petalSlot('stat', hp) def.flatHp ? 1 : mult;
    // const size = def.radius * (1 + slot.rarity * 0.12);

    // let dmg = def.dmg * mult;

    // if (slot.type === 'iris' || slot.type === 'pincer') {
    //   // Privet boosts the damage of Iris and Pincer. The old call targeted a
    //   // removed helper, which crashed the server while loading these petals.
    //   dmg *= this.getPrivetMultiplier(slot.type, slot.rarity);
    // }

    // const reloadMultiplier = this.getGoldenLeafReloadMultiplier();
    const out = [];

    // // Calculate flowerarmor from cactus base damage
    // let flowerArmor = 0;
    // if (def.flowerarmor > 0) {
    //   const cactusBaseDmg = MOB_TYPES.cactus.dmg;
    //   flowerArmor = cactusBaseDmg * 0.5 * def.flowerarmor * rarity.armorMult;
    // }

    // // Calculate flowerhealth bonus
    // let flowerHealth = 0;
    // if (def.flowerhealth > 0) {
    //   flowerHealth = def.flowerhealth * mult;
    // }

    // // Calculate charges for damage block petals (nazar amulet)
    // let charges = 0;
    // if (def.damageBlock) {
    //   charges = 1 + slot.rarity;
    // }

    // // Apply reload scaling for lightbulb (1000s base, -10% per rarity)
    // let reload = def.reload * reloadMultiplier;
    // if (def.reloadScaling) {
    //   reload = def.reload * Math.pow(1 - def.reloadScaling, slot.rarity);
    // }
    
    // // Special reload times for magnet based on rarity
    // if (slot.type === 'magnet') {
    //   const magnetReloadTimes = [500, 250, 200, 150, 125, 100, 75, 50, 25];
    //   reload = magnetReloadTimes[slot.rarity] || 500;
    // }

    for (let j = 0; j < petalStat(slot, 'count'); j++) {
      const slow = petalStat(slot, 'slow', 0);  // ????
      let rel = petalStat(slot, 'reload') * this.getGoldenLeafReloadMultiplier();
      if (slot.type === 'stinger') rel += this.getStingerReloadMultiplier();
      const obj = {
        id: uid(),
        slotIdx,
        type: slot.type,
        rarity: slot.rarity,
        angleFrac: (startPosIdx + j) / total,
        radius: petalStat(slot, 'radius'),
        orbitRad: petalStat(slot, 'orbits')[0],
        hp: petalStat(slot, 'hp'),
        maxHp: petalStat(slot, 'hp'),
        dmg: petalStat(slot, 'dmg') * ((slot.type === 'iris' || slot.type === 'pincer') ? this.getPrivetMultiplier(slot.type, slot.rarity) : 1),
        heal: petalStat(slot, 'heal', 0),
        reload: rel,
        alive: readyNow,
        cooldown:readyNow ? 0 : rel,
        pos: this.player.pos.clone(),
        minusarmor: petalStat(slot, 'minusarmor', 0),
        flowerarmor: MOB_TYPES.cactus.dmg * 0.5 * petalStat(slot, 'flowerarmor', 0),
        flowerhealth: petalStat(slot, 'flowerhealth', 0),
        yinyang: petalStat(slot, 'yinyang', false),
        petalsummon: petalStat(slot, 'petalsummon', null),
        damageBlock: petalStat(slot, 'damageblock', false),
        charges: petalStat(slot, 'charges', 0),
        maxCharges: petalStat(slot, 'charges', 0),
        slow: slow,
        companionMobIds: new Set(),
      }
      //console.log(JSON.stringify(obj));
      out.push(obj);
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
          const bonus = settings.privetBasePercent * Math.pow(0.5, diff);

          mult *= 1 + bonus;
      }

      return mult;
  }

  getGoldenLeafReloadMultiplier() {
    let reduction = 0;
    for (const slot of this.primary) {
      if (slot?.type === 'goldenleaf') reduction += slot.rarity * settings.goldenLeafPercentPerRarity;
    }
    // Common = 0%, Unusual = 3%, Rare = 6%, Epic = 9%, Legendary = 12%, Mythic = 15%, Ultra = 18%, Super = 21%, Eternal = 24%
    // Multiple Golden Leafs stack, but no reload may be reduced by more than 90%.
    return 1 - Math.min(0.9, reduction);
  }

  getStingerReloadMultiplier() {
    let inc = 0;
    for (const slot of this.primary) {
      if (slot?.type === 'stinger') {
        inc += petalStat(slot, 'count');
      }
    }
    return inc - 1;
  }

  rebuildAll(readyNow = true) {
    this.instances = [];
    const counts = this.primary.map((s) => (s ? petalStat(s, 'count') : 0));
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) return;

    let posIdx = 0;
    this.primary.forEach((slot, slotIdx) => {
      if (!slot) return;
      this.instances.push(...this.makeInstances(slot, slotIdx, total, posIdx, readyNow));
      posIdx += petalStat(slot, 'count');
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
    const counts = this.primary.map((s) => (s ? petalStat(s, 'count') : 0));
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
        if (existing.length == 0) return;
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

  // Strips every slot holding `type` out of both rows of the loadout
  // (not just this one live instance) and rebuilds instances immediately,
  // so the petal is gone from orbit right away rather than just failing to
  // reload next time.
  removePetalType(type) {
    let changed = false;
    for (let i = 0; i < this.primary.length; i++) {
      if (this.primary[i]?.type === type) { this.primary[i] = null; changed = true; }
    }
    for (let i = 0; i < this.secondary.length; i++) {
      if (this.secondary[i]?.type === type) this.secondary[i] = null;
    }
    if (changed) this.rebuildAll(false);
  }

  destroyInstance(inst) {
    inst.alive = false;
    inst.cooldown = inst.reload;
  }

  spawnCompanions(inst) {
    const isEgg = inst.type === 'beetleegg';
    const isCrown = inst.type === 'pharcrown';
    if (!isEgg && !isCrown) return;
    const type = isEgg ? 'beetle' : 'mummybeetle';
    const rarity = Math.max(0, inst.rarity - (isEgg ? 1 : 3));
    const count = isEgg ? 1 : 5;
    inst.companionMobIds.clear();
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const pos = this.player.pos.clone().add(new THREE.Vector3(Math.cos(angle) * 2.5, 0, Math.sin(angle) * 2.5));
      const mob = this.world.mobs.spawn(type, rarity, pos);
      mob.isSummoned = true;
      mob.ownerId = this.player.id;
      mob.companionPetalId = inst.id;
      inst.companionMobIds.add(mob.id);
    }
  }

  onCompanionFinalized(mob) {
    const inst = this.instances.find((candidate) => candidate.id === mob.companionPetalId);
    if (!inst?.companionMobIds) return;
    inst.companionMobIds.delete(mob.id);
    if (inst.companionMobIds.size === 0 && inst.alive) this.destroyInstance(inst);
  }

  update(dt) {
    const input = this.player.input;
    
    
    // Calculate rotation direction based on yinyang petals
    // now you can yy yy lol
    let rotDirection = 1;
    for (const inst of this.instances) {
      if (inst.alive && inst.yinyang) {
        rotDirection = -rotDirection;
        //break;
      }
    }
    let faster = 0;
    for (const inst of this.instances) {
      faster += petalStat(inst, 'rotSpeed', 0);
    }
    this.rot += (BASE_ROT_SPEED + faster) * this.rotFactor * rotDirection * dt;

    // Apply flowerarmor and flowerhealth from alive petals
    let totalFlowerArmor = 0;
    let totalFlowerHealth = 0;
    for (const inst of this.instances) {
      if (inst.alive) {
        totalFlowerArmor += inst.flowerarmor || 0;
        totalFlowerHealth += inst.flowerhealth || 0;
      }
    }
    this.player.armor = totalFlowerArmor;
    this.player.bonusMaxHp = totalFlowerHealth;
    this.player.maxHp = maxHpForLevel(this.player.level) + totalFlowerHealth;

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
      const orbits = petalStat(inst, 'orbits');
      const targetR = input.atk ? orbits[1] : input.def ? orbits[2] : orbits[0];
      inst.orbitRad += (targetR - inst.orbitRad) * damp(8, dt);
      const target = new THREE.Vector3(
        p.pos.x + Math.cos(angle) * inst.orbitRad, p.pos.y,
        p.pos.z + Math.sin(angle) * inst.orbitRad
      );

      if (inst.type === 'rose' && p.hp < p.maxHp * 0.9 && !p.dead) {
        target.set(p.pos.x, p.pos.y, p.pos.z);
        inst.pos.lerp(target, damp(6, dt));
        if (inst.pos.distanceTo(target) < 0.8) {
          p.heal(inst.heal);
          this.destroyInstance(inst);
        }
      } else if (inst.type === 'dahlia' && p.hp < p.maxHp * 0.9 && !p.dead) {
        target.set(p.pos.x, p.pos.y, p.pos.z);
        inst.pos.lerp(target, damp(6, dt));
        if (inst.pos.distanceTo(target) < 0.8) {
          p.heal(inst.heal);
          this.destroyInstance(inst);
        }
      } else {
        inst.pos.lerp(target, damp(12, dt));
      }

      if (inst.type === 'leaf' || inst.type === 'holyleaf') p.heal(inst.heal * dt);

      // Egg/Crown companions are spawned once per ready petal instance. The
      // instance stays ready while they fight and starts its reload only when
      // onCompanionFinalized has observed the final companion death.
      if ((inst.type === 'beetleegg' || inst.type === 'pharcrown') && inst.companionMobIds.size === 0) {
        this.spawnCompanions(inst);
      }

      if (PETAL_TYPES[inst.type].projectile && input.atk && inst.orbitRad > 3.6) {
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
