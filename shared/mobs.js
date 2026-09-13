import * as THREE from 'three';
import { TILE_SIZE, wallTopAt, RARITIES, MOB_CAP, ANT_MAX_SHARE, ANT_TYPES, clampToArena } from './config.js';
function damp(k, dt) { return 1 - Math.exp(-k * dt); } // omfg
// some of this code *should* be handled in the server, but sigh
export const HORNET = {
  aggroRange: 30,
  cruiseAlt: 5,
  volleyAlt: 5.5,
  swoopAlt: 0.6,
  standoff: 13,
  fireRange: 45,
  fireInterval: 2.2,
  regrowTime: 0.9,
  swoopSpeedMult: 1.8,
  swoopOvershoot: 18,
  swoopMaxTime: 8,
};

const HORNET_WALL_CLEARANCE = 1.5;
const HORNET_WALL_AVOID_RANGE = TILE_SIZE * 1.1;

function hornetWallPush(pos) {
  const cgx = Math.round(pos.x / TILE_SIZE);
  const cgz = Math.round(pos.z / TILE_SIZE);
  const push = new THREE.Vector3();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const gx = cgx + dx, gz = cgz + dz;
      const top = wallTopAt(gx * TILE_SIZE, gz * TILE_SIZE);
      if (top === 0 || pos.y > top + HORNET_WALL_CLEARANCE) continue;
      const cx = gx * TILE_SIZE, cz = gz * TILE_SIZE;
      const ex = pos.x - cx, ez = pos.z - cz;
      const d = Math.hypot(ex, ez) || 1;
      if (d < HORNET_WALL_AVOID_RANGE) {
        push.add(new THREE.Vector3(ex / d, 0, ez / d)
          .multiplyScalar((HORNET_WALL_AVOID_RANGE - d) / HORNET_WALL_AVOID_RANGE));
      }
    }
  }
  return push;
}

const AGGRO_SPEED_MULT = 2.5;

class MobBase {
  constructor(name, obj) {
    this.type = name;
    for (var i in obj) this[i] = obj[i];
  }

  update(me, dt) {
    // Petal companions never target flowers. They pursue the closest normal
    // mob, while combat.js handles their actual contact damage.
    if (me.isSummoned && me.companionPetalId) {
      let target = null;
      let best = Infinity;
      for (const mob of me.world.mobs.mobs) {
        if (mob === me || mob.isSummoned || mob.deadFlag || mob.dying) continue;
        const d2 = me.pos.distanceToSquared(mob.pos);
        if (d2 < best) { best = d2; target = mob; }
      }
      if (target && me.speed > 0) {
        const direction = target.pos.clone().sub(me.pos).setY(0);
        if (direction.lengthSq() > 0.01) {
          direction.normalize().multiplyScalar(me.speed * AGGRO_SPEED_MULT);
          me.pos.addScaledVector(direction, dt);
          me.facing = Math.atan2(direction.x, direction.z);
        }
      }
      return;
    }
    const player = me.world.nearestPlayer(me.pos);
    let vel = new THREE.Vector3();

    if (this.sightAggro) {
      const d = player ? me.pos.distanceTo(player.pos) : Infinity;
      if (d < this.sightAggro) me.aggro = true;
      else if (d > this.leash) me.aggro = false;
    }

      if (performance.now() > me.slowUntil) {
          me.slowMultiplier = 1;
      }

      const speed = me.speed * me.slowMultiplier;
      const lastPhase = me.sinePhase;
      // fix this code later
      if (speed > 0) {
      if (me.aggro && player) {
        const toPlayer = player.pos.clone().sub(me.pos).setY(0);
        if (toPlayer.lengthSq() > 0.01) toPlayer.normalize();
        if (this.type === 'bee') {
          me.sinePhase += dt * 0.7;
          // lmao
          const perp = new THREE.Vector3(0, 55, 0); //-toPlayer.z, 0, toPlayer.x);
          perp.multiplyScalar(1 + me.rarity * 0.1);
          perp.multiplyScalar(Math.sin(me.sinePhase) * Math.sin(me.sinePhase) - Math.sin(lastPhase) * Math.sin(lastPhase));
          me.pos.addScaledVector(perp, dt);
        }
        vel = toPlayer.multiplyScalar(speed * AGGRO_SPEED_MULT);
      } else {
        me.wanderTimer -= dt;
        if (me.wanderTimer <= 0) {
          me.wanderTimer = 2 + Math.random() * 3;
          me.heading = Math.random() * Math.PI * 2;
        }
        let dir = new THREE.Vector3(Math.sin(me.heading), 0, Math.cos(me.heading));
        if (me.type === 'bee') {
          me.sinePhase += dt;
          const perp = new THREE.Vector3(0, 25, 0); //-dir.z, 0, dir.x);
          perp.multiplyScalar(1 + me.rarity * 0.1);
          perp.multiplyScalar(Math.sin(me.sinePhase) * Math.sin(me.sinePhase) - Math.sin(lastPhase) * Math.sin(lastPhase));
          //dir = dir.add(perp).normalize();
          me.pos.addScaledVector(perp, dt);
        }
        vel = dir.multiplyScalar(speed);
      }
      me.pos.addScaledVector(vel, dt);
    }

    if (vel.lengthSq() > 0.01) me.facing = Math.atan2(vel.x, vel.z);
  }

  onDamage(me) {}

  onDeath(me) {}
}

class RockMob extends MobBase {
  constructor() {
    super('rock', {
      name: 'Rock', hp: 55, dmg: 8, armor: 2, radius: 1.6, speed: 0, xp: 2,
      drops: [
        { w: { 'rockPetal': 1 } },
        { w: { 'heavy': 1 }, c: 0.4 },
      ],
      spawnWeight: 0.5,
    })
  }
}

class LadybugMob extends MobBase {
  constructor() {
    super('ladybug', {
      name: 'Ladybug', hp: 35, dmg: 12, armor: 0, radius: 2.3, speed: 2.4, xp: 4,
      drops: [
        { w: { 'rose': 1 } },
        { w: { 'bubble': 1 }, c: 0.5 },
        { w: { 'light': 1 } },
      ],
    })
  }
}

class BeeMob extends MobBase {
  constructor() {
    super('bee', {
      name: 'Bee', hp: 15, dmg: 40, armor: 0, radius: 1.4, speed: 4.6, xp: 5,
      drops: [
        { w: { 'stinger': 1 } },
      ],
    })
  }
}

class HornetMob extends MobBase {
  constructor() {
    super('hornet', {
      name: 'Hornet', hp: 50, dmg: 30, armor: 1, radius: 1.7, speed: 2.0, xp: 12,
      drops: [
        { w: { 'missile': 1 } },
        { w: { 'orange': 1 } },
      ],
      spawnWeight: 0.35,
      maxAlive: 6,
      missile: { hp: 5, dmg: 6, speed: 16, radius: 0.45 },
    })
  }

  update(me, dt) {
    const player = me.world.nearestPlayer(me.pos);
    const f = me.flight;
    const toPlayer = player ? player.pos.clone().sub(me.pos)/*.setY(0)*/ : new THREE.Vector3();
    const hDist = player ? toPlayer.length() : Infinity;
    if (player && hDist > 0.01) toPlayer.multiplyScalar(1 / hDist);

    if (!player) {
      me.aggro = false;
      f.state = 'cruise';
    } else if (hDist < HORNET.aggroRange) {
      me.aggro = true;
    }

    let vel = new THREE.Vector3();
    const speed = me.speed * me.slowMultiplier;
    let altTarget = HORNET.cruiseAlt + me.radius + me.floor;
    let altRate = 2.2;

    if (f.state === 'cruise') {
      me.wanderTimer -= dt;
      if (me.wanderTimer <= 0) {
        me.wanderTimer = 2 + Math.random() * 3;
        me.heading = Math.random() * Math.PI * 2;
      }
      vel.set(Math.sin(me.heading), 0, Math.cos(me.heading)).multiplyScalar(speed);
      me.facing = Math.atan2(vel.x, vel.z);
      if (me.aggro) {
        f.state = 'volley';
        f.shots = 2 + me.rarity;
        f.fireTimer = 1.2;
      }
    } else if (f.state === 'volley') {
      altTarget = HORNET.volleyAlt + me.radius;
      const inRing = hDist < HORNET.standoff + 2;
      if (!inRing) {
        vel.copy(toPlayer).multiplyScalar(speed * 1.6);
      } else if (hDist < HORNET.standoff - 2) {
        vel.copy(toPlayer).multiplyScalar(-speed * 1.6);
      } else {
        vel.set(-toPlayer.z, 0, toPlayer.x).multiplyScalar(speed * 0.7 * me.strafeDir);
      }
      me.facing = inRing
        ? Math.atan2(-toPlayer.x, -toPlayer.z)
        : Math.atan2(toPlayer.x, toPlayer.z);

      f.regrow -= dt;
      if (f.regrow <= 0) me.loaded = true;
      f.fireTimer -= dt;
      if (f.fireTimer <= 0 && me.loaded && inRing && hDist < HORNET.fireRange) {
        me.world.mobs.fireMissile(me, player);
        me.loaded = false;
        f.regrow = HORNET.regrowTime;
        f.fireTimer = HORNET.fireInterval;
        f.shots--;
        if (f.shots <= 0) {
          f.state = 'swoop';
          f.timer = HORNET.swoopMaxTime;
          f.target.copy(player.pos).addScaledVector(toPlayer, HORNET.swoopOvershoot).setY(0);
        }
      }
    } else {
      altTarget = HORNET.swoopAlt;
      altRate = 3.2;
      const toTarget = f.target.clone().sub(me.pos).setY(0);
      const dist = toTarget.length();
      if (dist > 0.01) vel.copy(toTarget.multiplyScalar(1 / dist)).multiplyScalar(speed * HORNET.swoopSpeedMult);
      me.facing = Math.atan2(vel.x, vel.z);
      f.timer -= dt;
      if (dist < 2.5 || f.timer <= 0) {
        f.state = me.aggro ? 'volley' : 'cruise';
        f.shots = 2 + me.rarity;
        f.fireTimer = 1.4;
      }
    }

    // const wallPush = hornetWallPush(me.pos);
    // if (wallPush.lengthSq() > 0) vel.add(wallPush.multiplyScalar(speed * 2.5));

    me.pos.addScaledVector(vel, dt);
    const prevY = me.pos.y;
    me.pos.y += (altTarget - me.pos.y) * damp(altRate, dt);

    const vy = (me.pos.y - prevY) / Math.max(dt, 1e-6);
    const targetPitch = Math.atan2(-vy, Math.max(vel.length(), 2));
    me.pitch += (targetPitch - me.pitch) * damp(6, dt);
  }
}

class SoldierAntMob extends MobBase {
  constructor() {
    super('soldier', {
      name: 'Soldier Ant', hp: 20, dmg: 10, armor: 0, radius: 1.5, speed: 1.8, xp: 7,
      drops: [
        { w: { 'glass': 1 } },
        { w: { 'wing': 1 } },
      ],
      sightAggro: 14,
      leash: 40,
      spawnWeight: 0.3,
    })
  }
}

class WorkerAntMob extends MobBase {
  constructor() {
    super('worker', {
      name: 'Worker Ant', hp: 15, dmg: 10, armor: 0, radius: 1.3, speed: 1.8, xp: 5,
      drops: [
        { w: { 'corn': 1 } },
        { w: { 'leaf': 1 } },
      ],
      retaliates: true,
    })
  }
}

class BabyAntMob extends MobBase {
  constructor() {
    super('baby', {
      name: 'Baby Ant', hp: 6, dmg: 10, armor: 0, radius: 1.0, speed: 1.4, xp: 2,
      drops: [
        { w: { 'light': 1 } },
        { w: { 'rice': 1 } },
        { w: { 'leaf': 1 } },
      ],
      passive: true,
      spawnWeight: 0.6,
    })
  }
}


const antCapFull = (mobs) => {
  const antAlive = mobs.mobs.reduce((n, m) => n + (ANT_TYPES.includes(m.type) ? 1 : 0), 0);
  return antAlive >= Math.round(MOB_CAP * ANT_MAX_SHARE);
};

export const ANTHOLE = {
  escort: { baby: 1, worker: 1, soldier: 2 },
  reinforcements: [['baby', 2], ['worker', 5], ['soldier', 11]],
};

const IDLE_DESPAWN_GRACE = 30;
const IDLE_DESPAWN_RADIUS = 60;

export function tickHoleAnt(ant, dt) {
  if (!ant.hole.deadFlag) return;
  const p = ant.world.nearestPlayer(ant.pos);
  if (p && p.pos.distanceTo(ant.pos) < IDLE_DESPAWN_RADIUS) {
    ant.idleTime = 0;
    return;
  }
  ant.idleTime = (ant.idleTime || 0) + dt;
  if (ant.idleTime > IDLE_DESPAWN_GRACE) ant.deadFlag = true;
}

export function spawnHoleAnt(mobs, hole, type, aggro) {
  const angle = Math.random() * Math.PI * 2;
  const dist = hole.radius + MOB_TYPES[type].radius * RARITIES[hole.rarity].scale * 0.6;
  const pos = hole.pos.clone();
  pos.x += Math.sin(angle) * dist;
  pos.z += Math.cos(angle) * dist;
  // Ensure ant rarity is always at least Common (index 1), never Special (index 0)
  const ant = mobs.spawn(type, Math.max(1, hole.rarity - (Math.random() > (0.5 - hole.rarity * 0.05) ? 1 : 0)), pos);
  clampToArena(ant.pos, ant.radius);
  ant.aggro = aggro && !ant.def.passive;
  ant.hole = hole;
  return ant;
}

export function spawnEscort(mobs, hole) {
  hole.escortAnts = [];
  for (const [type, n] of Object.entries(ANTHOLE.escort)) {
    for (let i = 0; i < n; i++) {
      if (antCapFull(mobs)) return;
      hole.escortAnts.push(spawnHoleAnt(mobs, hole, type, false));
    }
  }
}

export function releaseGarrison(mobs, hole) {
  for (const ant of hole.escortAnts ?? []) {
    if (!ant.deadFlag && !ant.def.passive) ant.aggro = true;
  }
  hole.reinforced ??= 0;
  const total = ANTHOLE.reinforcements.reduce((sum, [, n]) => sum + n, 0);
  const due = Math.min(total, Math.ceil(
    (1 - Math.max(0, hole.hp) / hole.maxHp) * total));
  while (hole.reinforced < due && !antCapFull(mobs)) {
    let idx = hole.reinforced++;
    for (const [type, n] of ANTHOLE.reinforcements) {
      if (idx < n) { spawnHoleAnt(mobs, hole, type, true); break; }
      idx -= n;
    }
  }
}

export function spawnQueenOnHoleDeath(mobs, hole) {
  // Spawn queen ant when ant hole dies
  // Same rarity as the hole, with 1% chance to be 1 rarity higher
  let queenRarity = hole.rarity;
  if (Math.random() < 0.01 && queenRarity < 8) { // 8 is Super rarity index
    queenRarity = queenRarity + 1;
  }
  
  const angle = Math.random() * Math.PI * 2;
  const dist = hole.radius + 2;
  const pos = hole.pos.clone();
  pos.x += Math.sin(angle) * dist;
  pos.z += Math.cos(angle) * dist;
  
  const queen = mobs.spawn('queen', queenRarity, pos);
  queen.aggro = true;
  
  // Announce queen spawn globally
  const rarityData = RARITIES[queenRarity];
  if (!rarityData) return queen;
  const rarityName = rarityData.name;
  mobs.world.events.push({ e: 'chat', text: `A ${rarityName} Queen Ant has spawned from a fallen Ant Hole!` });
  
  return queen;
}

class AntHoleMob extends MobBase {
  constructor() {
    super('anthole', {
      name: 'Ant Hole', hp: 250, dmg: 10, armor: 2, radius: 2.5, speed: 0, xp: 50,
      drops: [
        { w: { 'magnet': 1 } },
        { w: { 'jobapplication': 1 } },
      ],
      spawnWeight: 0.2,
      maxAlive: 1,
    })
  }

  onDamage(me) {
    releaseGarrison(me.world.mobs, me);
  }

  onDeath(me) {
    spawnQueenOnHoleDeath(me.world.mobs, me);
  }
}

class ScorpionMob extends MobBase {
  constructor() {
    super('scorpion', {
      name: 'Scorpion', hp: 70, dmg: 40, armor: 2, radius: 2.0, speed: 8, xp: 15,
      drops: [
        { w: { 'iris': 1 } },
        { w: { 'pincer': 1 } },
      ],
      sightAggro: 18,
      spawnWeight: 0.44,
      spawnBiome: 'desert',
    })
  }
}

class BeetleMob extends MobBase {
  constructor() {
    super('beetle', {
      name: 'Beetle', hp: 60, dmg: 30, armor: 1, radius: 3.0, speed: 3, xp: 12,
      drops: [
        { w: { 'privet': 1 } },
        { w: { 'beetleegg': 1 }, c: 0.5 },
      ],
      sightAggro: 14,
      spawnWeight: 0.39,
      spawnBiome: 'desert',
    })
  }
}

class CactusMob extends MobBase {
  constructor() {
    super('cactus', {
      name: 'Cactus', hp: 90, dmg: 80, armor: 2, radius: 2.0, speed: 0, xp: 5,
      drops: [
        { w: { 'stinger': 1 } },
        { w: { 'cactusPetal': 1 } },
      ],
      passive: true,
      spawnWeight: 0.14,
      spawnBiome: 'desert',
    })
  }
}

class BushMob extends MobBase {
  constructor() {
    super('bush', {
      name: 'Bush', hp: 45, dmg: 20, armor: 0, radius: 2.0, speed: 0, xp: 3,
      drops: [
        { w: { 'goldenleaf': 1, '': 49 } },
        { w: { 'leaf': 1 } },
      ],
      passive: true,
      spawnWeight: 0.20,
      spawnBiome: 'jungle',
    })
  }
}

class ShinyLadybugMob extends MobBase {
  constructor() {
    super('shinyladybug', {
      name: 'Ladybug', hp: 55, dmg: 12, armor: 0, radius: 2.5, speed: 2.4, xp: 12,
      drops: [
        { w: { 'rose': 1 } },
        { w: { 'dahlia': 1 } },
        { w: { 'bubble': 1 } },
      ],
      spawnWeight: 0.01,
      spawnBiome: 'desert',
    })
  }
}

class DarkLadybugMob extends MobBase {
  constructor() {
    super('jungleladybug', {
      name: 'Ladybug', hp: 45, dmg: 12, armor: 0, radius: 2.5, speed: 2.4, xp: 8,
      drops: [
        { w: { 'dahlia': 1, '': 1 } },
        { w: { 'yinyang': 1 } },
      ],
      spawnWeight: 0.25,
      spawnBiome: 'jungle',
    })
  }
}

class LeafbugMob extends MobBase {
  constructor() {
    super('leafbug', {
      name: 'Leafbug', hp: 40, dmg: 14, armor: 4, radius: 2.5, speed: 2.4, xp: 4,
      drops: [
        { w: { 'leaf': 1 } },
        { w: { 'root': 1, '': 1 } },
      ],
      spawnWeight: 0.39,
      spawnBiome: 'jungle',
    })
  }
}

class GoldenLeafbugMob extends MobBase {
  constructor() {
    super('goldenleafbug', {
      name: 'Leafbug', hp: 40, dmg: 14, armor: 4, radius: 2.5, speed: 2.4, xp: 4,
      drops: [
        { w: { 'goldenleaf': 1, '': 1 } },
        { w: { 'root': 1 } },
      ],
      spawnWeight: 0.01,
      spawnBiome: 'jungle',
    })
  }
}

class NazarBeetleMob extends MobBase {
  constructor() {
    super('nazarbeetle', {
      name: 'Beetle', hp: 60, dmg: 30, armor: 1, radius: 2.0, speed: 3, xp: 12,
      drops: [
        { w: { 'privet': 1 } },
        { w: { 'beetleegg': 1 } },
        { w: { 'nazaramulet': 1, '': 1 } },
      ],
      sightAggro: 14,
      spawnWeight: 0.02,
      spawnBiome: 'desert',
    })
  }
}

class FireflyMob extends MobBase {
  constructor() {
    super('firefly', {
      name: 'Firefly', hp: 15, dmg: 20, armor: 0, radius: 1.5, speed: 3, xp: 9,
      drops: [
        { w: { 'wing': 1 } },
        { w: { 'bur': 1 } },
        { w: { 'lightbulb': 1 } },
      ],
      sightAggro: 14,
      leash: 40,
      spawnWeight: 0.15,
      spawnBiome: 'jungle',
    })
  }
}

class AssemblerMob extends MobBase {
  constructor() {
    super('assembler', {
      name: 'Assembler', hp: 999999999999999999999, dmg: 0, armor: 0, radius: 1.5, speed: 0, xp: 100,
      drops: [
        { w: { 'air': 1, 'jobapplication': 0.1 } },
      ],
      passive: true,
    })
  }
}

class MummyBeetleMob extends MobBase {
  constructor() {
    super('mummybeetle', {
      name: 'Mummy Beetle', hp: 52.5, dmg: 30, armor: 1, radius: 2.0, speed: 3, xp: 18,
      drops: [
        { w: { 'privet': 1 } },
        { w: { 'beetleegg': 1 } },
      ],
      sightAggro: 14,
      spawnWeight: 0.02,
      spawnBiome: 'desert',
      mobdeathtime: 0.5,
    })
  }
}

class PharaohMob extends MobBase {
  constructor() {
    super('egyptbeetle', {
      name: 'Pharaoh Beetle', hp: 150, dmg: 60, armor: 3, radius: 4.0, speed: 3, xp: 30,
      drops: [
        { w: { 'privet': 1 } },
      ],
      sightAggro: 14,
      spawnWeight: 0, // Only spawns as Ultra+ guaranteed spawn
      spawnBiome: 'desert',
      mobdeathtime: 1,
      mobsummon: 'mummybeetle',
    })
  }
}

class QueenAntMob extends MobBase {
  constructor() {
    super('queen', {
      name: 'Queen Ant', hp: 90, dmg: 30, armor: 0, radius: 2, speed: 2, xp: 20,
      drops: [
        { w: { 'holycorn': 1, '': 3 } },
        { w: { 'holywing': 1, '': 3 } },
        { w: { 'holyrice': 1, '': 3 } },
        { w: { 'holyleaf': 1, '': 3 } },
        { w: { 'jobapplication': 1 } },
      ],
      sightAggro: 14,
      leash: 40,
      spawnWeight: 0,
      mobsummon: 'soldier',
    })
  }
}

class SpiderMob extends MobBase {
  constructor() {
    super('spider', {
      name: 'Spider', hp: 18, dmg: 25, armor: 0, radius: 1.6, speed: 4.2, xp: 13, // -40% speed (7 * 0.6 = 4.2)
      drops: [
        { w: { 'faster': 1 } },
        { w: { 'stinger': 1 }, c: 0.4 },
      ],
      sightAggro: 45,
      spawnWeight: 0.7,
    })
  }
}

class CentipedeMob extends MobBase {
  constructor() {
    super('centi', {
      name: 'Centipede', hp: 15, dmg: 12, armor: 0, radius: 1.8, speed: 2, xp: 20,
      drops: [
        { w: { 'leaf': 1 } },
      ],
      spawnWeight: 0.5,
    })
  }
}

export const MOB_TYPES = {
  'rock': new RockMob(),
  'ladybug': new LadybugMob(),
  'bee': new BeeMob(),
  'hornet': new HornetMob(),
  'soldier': new SoldierAntMob(),
  'worker': new WorkerAntMob(),
  'baby': new BabyAntMob(),
  'anthole': new AntHoleMob(),
  'scorpion': new ScorpionMob(),
  'beetle': new BeetleMob(),
  'cactus': new CactusMob(),
  'bush': new BushMob(),
  'shinyladybug': new ShinyLadybugMob(),
  'jungleladybug': new DarkLadybugMob(),
  'leafbug': new LeafbugMob(),
  'goldenleafbug': new GoldenLeafbugMob(),
  'nazarbeetle': new NazarBeetleMob(),
  'firefly': new FireflyMob(),
  'assembler': new AssemblerMob(),
  'mummybeetle': new MummyBeetleMob(),
  'egyptbeetle': new PharaohMob(),
  'queen': new QueenAntMob(),
  'spider': new SpiderMob(),
  'centi': new CentipedeMob(),
}

export function pickDrop(mobType, rng = Math.random) {
  const drops = MOB_TYPES[mobType].drops;
  const l = [];
  for (const slot of drops) {
    let c = slot.c ?? 1;
    if (rng() < c) {
      let n = slot.n ?? 1;
      let r = 0;
      for (var i in slot.w) {r += slot.w[i]};
      r *= rng();
      for (var i in slot.w) {
        r -= slot.w[i];
        if (r <= 0) {
          if (i !== '') {
            for (var j = 0; j < n; j++) l.push(i);
          }
          break;
        }
      }
    }
  }
  // const dropSlots = MOB_TYPES[mobType].dropSlots || MOB_TYPES[mobType].drops;
  // // Handle old drops format for backward compatibility
  // if (!Array.isArray(dropSlots) || !Array.isArray(dropSlots[0])) {
  //   const drops = dropSlots;
  //   const total = drops.reduce((s, [, w]) => s + w, 0);
  //   let roll = rng() * total;
  //   for (const [type, w] of drops) {
  //     roll -= w;
  //     if (roll <= 0) return type;
  //   }
  //   return null;
  // }
  
  // // New dropSlots format: 5 slots, each with weighted drops
  // const drops = [];
  // for (const slot of dropSlots) {
  //   if (!slot || slot.length === 0) continue;
  //   const total = slot.reduce((s, [, w]) => s + w, 0);
  //   let roll = rng() * total;
  //   let dropped = false;
  //   for (const [type, w] of slot) {
  //     roll -= w;
  //     if (roll <= 0) {
  //       if (type !== 'nothing') {
  //         drops.push(type);
  //         dropped = true;
  //       }
  //       break;
  //     }
  //   }
  //   // If slot has only 'nothing' entries, still count it as a slot (no drop)
  //   // If slot has valid drops but nothing was selected, that's okay
  // }
  return l;
}
