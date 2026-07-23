import * as THREE from 'three';
import {
  MOB_TYPES, RARITIES, MOB_CAP, ANT_MAX_SHARE, ANT_TYPES, ARENA_HALF, TILE_SIZE, SPAWN_POS,
  DROP_DAMAGE_FRAC, MIN_LOOTERS, VIEW_RADIUS,
  clampToArena, collideWalls, isWallCell, wallTopAt,
  tileTypeAt, pickRarity, pickDrop,
} from '../shared/config.js';

const STALE_RECYCLE_AFTER = 600;
const STALE_SWEEP_INTERVAL = 5;
const ACTIVE_RADIUS = VIEW_RADIUS + 80;

// The Assembler is a singleton: exactly one exists on the map at all times,
// and it teleports to a new random spot on this interval instead of dying
// and respawning like normal mobs.
const ASSEMBLER_RELOCATE_INTERVAL = 20 * 60;

const SAFE_RING = 60;
const SAFE_RING_MAX_RARITY = 2;
import { uid, damp } from './utils.js';
import { notifyUltraSpawn } from './discord.js';
import { spawnEscort, releaseGarrison, tickHoleAnt } from './ants.js';
import { settings, SACRIFICE_MOB_TYPES, pickWeightedRarity } from './gameSettings.js';

// Looked up by name rather than by array position (e.g. RARITIES.length - 1)
// so tier-specific logic keeps pointing at the right rarity even as more
// admin-only tiers get appended above Super (like Eternal).
const RARITY_IDX = Object.fromEntries(RARITIES.map((r, i) => [r.name, i]));

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

const HORNET = {
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

class Mob {
  constructor(world, type, rarityIdx, pos) {
    this.world = world;
    this.id = uid();
    this.type = type;
    this.def = MOB_TYPES[type];
    this.rarity = rarityIdx;
    const r = RARITIES[rarityIdx];
    this.maxHp = this.def.hp * r.statMult;
    this.hp = this.maxHp;
    this.dmg = this.def.dmg * r.dmgMult;
    this.armor = this.def.armor * r.armorMult;
    this.radius = this.def.radius * r.scale;
    this.speed = this.def.speed;
    this.slowMultiplier = 1;
    this.slowUntil = 0;
    this.xp = this.def.xp * r.statMult;
    this.deathTimer = 0;
    this.mobdeathtime = this.def.mobdeathtime || 0;

    this.pos = pos.clone();
    this.heading = Math.random() * Math.PI * 2;
    this.facing = this.heading;
    this.wanderTimer = 0;
    this.sinePhase = Math.random() * Math.PI * 2;
    this.aggro = false;
    this.knock = new THREE.Vector3();
    this.hitCooldowns = new Map();
    this.deadFlag = false;
    this.active = true;
    this.damageBy = new Map();

    if (this.type === 'hornet') {
      this.pos.y = HORNET.cruiseAlt + this.radius;
      this.pitch = 0;
      this.loaded = true;
      this.strafeDir = Math.random() < 0.5 ? 1 : -1;
      this.flight = { state: 'cruise', shots: 0, fireTimer: 0, regrow: 0, timer: 0, target: new THREE.Vector3() };
    }
  }

  damage(amount, source = null, attacker = null) {
    const dealt = Math.max(1, amount - this.armor);
    this.hp -= dealt;
    if (attacker) this.damageBy.set(attacker.id, (this.damageBy.get(attacker.id) || 0) + dealt);
    this.world.events.push({ e: 'flash', k: 'mob', id: this.id });
    this.world.events.push({
      e: 'dmg', a: Math.round(dealt),
      x: Math.round(this.pos.x * 100) / 100, z: Math.round(this.pos.z * 100) / 100,
    });
    if (!this.def.passive && (this.rarity >= 2 || this.def.retaliates)) this.aggro = true;
    if (source && this.speed > 0) {
      const push = this.pos.clone().sub(source).setY(0).normalize().multiplyScalar(9);
      this.knock.add(push);
    }
    if (this.type === 'anthole') releaseGarrison(this.world.mobs, this);
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.deadFlag) return;
    
    // Summoned mobs drop loot for their owner instead of normal damage-based loot
    if (this.isSummoned) {
      this.deadFlag = true;
      // Give loot to the owner if they still exist
      if (this.ownerId && this.world.players.has(this.ownerId)) {
        const owner = this.world.players.get(this.ownerId);
        owner.gainXp(this.xp);
        const dropTypes = pickDrop(this.type);
        if (!dropTypes) return;
        
        const drops = Array.isArray(dropTypes) ? dropTypes : [dropTypes];
        for (const dropType of drops) {
          const rarityName = RARITIES[this.rarity].name;
          if (rarityName === 'Super') {
            const rarity = Math.random() < 0.001 ? this.rarity : this.rarity - 1;
            this.world.drops.spawn(dropType, rarity, this.pos, this.ownerId);
          } else {
            const rarity = pickWeightedRarity(settings.dropRarityWeights[this.rarity], this.rarity);
            this.world.drops.spawn(dropType, rarity, this.pos, this.ownerId);
          }
        }
      }
      return;
    }
    
    // If mobdeathtime is set, use death timer instead of immediate death
    if (this.mobdeathtime > 0) {
      this.deathTimer = this.mobdeathtime;
      return;
    }
    
    this.deadFlag = true;
    const connected = [...this.damageBy]
      .filter(([id]) => this.world.players.has(id))
      .sort((a, b) => b[1] - a[1]);
    const total = connected.reduce((sum, [, dmg]) => sum + dmg, 0);
    const owners = connected.filter(([, dmg], rank) =>
      rank < MIN_LOOTERS || dmg >= total * DROP_DAMAGE_FRAC);
    if (owners.length > 0) {
      for (const [id] of owners) this.world.players.get(id).gainXp(this.xp);
    } else {
      const killer = this.world.nearestPlayer(this.pos);
      if (killer) killer.gainXp(this.xp);
    }
    if (connected.length === 0) return;

    // Bonus roll, independent of the mob's own drop table: works the same
    // way for Commons all the way up through Eternal. Chance is admin-
    // configurable via settings.bloodSacrificeDropChance.
    for (const [id] of owners) {
      if (Math.random() < settings.bloodSacrificeDropChance) {
        this.world.drops.spawn('bloodsacrifice', RARITY_IDX.Super, this.pos, id);
      }
    }

    const rarityName = RARITIES[this.rarity].name;
    if (rarityName === 'Eternal') {
      // Eternal mobs ignore their normal drop table entirely: every eligible
      // participant always gets a Common Golden Leaf.
      for (const [id] of owners) this.world.drops.spawn('goldenleaf', 0, this.pos, id);
      return;
    }
    const dropTypes = pickDrop(this.type);
    if (!dropTypes) return;
    
    // Handle both single drop (old format) and multiple drops (new format)
    const drops = Array.isArray(dropTypes) ? dropTypes : [dropTypes];
    
    for (const [id] of owners) {
      for (const dropType of drops) {
        if (rarityName === 'Super') {
          // Super mobs always reward their eligible participants: 0.1% Super,
          // otherwise (99.9%) an Ultra version of the same petal.
          const rarity = Math.random() < 0.001 ? this.rarity : this.rarity - 1;
          this.world.drops.spawn(dropType, rarity, this.pos, id);
        } else {
          // Admin-configurable per-mob-rarity drop table: a weighted pick
          // across settings.dropRarityWeights[this.rarity] decides the drop's
          // rarity, so admins can now shape the full distribution (any mix of
          // lower/same/higher rarities) instead of only a chance to go one
          // tier up. Falls back to matching the mob's own rarity if the row is
          // all-zero or missing.
          const rarity = pickWeightedRarity(settings.dropRarityWeights[this.rarity], this.rarity);
          this.world.drops.spawn(dropType, rarity, this.pos, id);
        }
      }
    }
  }

  applySlow(amount) {
      this.slowMultiplier = Math.max(0.2, 1 - amount);
      this.slowUntil = performance.now() + 2000;
  }

  update(dt) {
    if (this.hole) tickHoleAnt(this, dt);
    if (this.deadFlag) return;
    
    // Handle death timer for mobdeathtime
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.deadFlag = true;
        // Process drops and XP when death timer expires
        const connected = [...this.damageBy]
          .filter(([id]) => this.world.players.has(id))
          .sort((a, b) => b[1] - a[1]);
        const total = connected.reduce((sum, [, dmg]) => sum + dmg, 0);
        const owners = connected.filter(([, dmg], rank) =>
          rank < MIN_LOOTERS || dmg >= total * DROP_DAMAGE_FRAC);
        if (owners.length > 0) {
          for (const [id] of owners) this.world.players.get(id).gainXp(this.xp);
        } else {
          const killer = this.world.nearestPlayer(this.pos);
          if (killer) killer.gainXp(this.xp);
        }
        if (connected.length === 0) return;

        // Summoned mobs drop loot for their owner
        if (this.isSummoned && this.ownerId && this.world.players.has(this.ownerId)) {
          const owner = this.world.players.get(this.ownerId);
          owner.gainXp(this.xp);
          const dropTypes = pickDrop(this.type);
          if (dropTypes) {
            const drops = Array.isArray(dropTypes) ? dropTypes : [dropTypes];
            for (const dropType of drops) {
              const rarityName = RARITIES[this.rarity].name;
              if (rarityName === 'Super') {
                const rarity = Math.random() < 0.001 ? this.rarity : this.rarity - 1;
                this.world.drops.spawn(dropType, rarity, this.pos, this.ownerId);
              } else {
                const rarity = pickWeightedRarity(settings.dropRarityWeights[this.rarity], this.rarity);
                this.world.drops.spawn(dropType, rarity, this.pos, this.ownerId);
              }
            }
          }
          return;
        }

        for (const [id] of owners) {
          if (Math.random() < settings.bloodSacrificeDropChance) {
            this.world.drops.spawn('bloodsacrifice', RARITY_IDX.Super, this.pos, id);
          }
        }

        const rarityName = RARITIES[this.rarity].name;
        if (rarityName === 'Eternal') {
          for (const [id] of owners) this.world.drops.spawn('goldenleaf', 0, this.pos, id);
          return;
        }
        const dropTypes = pickDrop(this.type);
        if (!dropTypes) return;
        
        // Handle both single drop (old format) and multiple drops (new format)
        const drops = Array.isArray(dropTypes) ? dropTypes : [dropTypes];
        
        for (const [id] of owners) {
          for (const dropType of drops) {
            if (rarityName === 'Super') {
              const rarity = Math.random() < 0.001 ? this.rarity : this.rarity - 1;
              this.world.drops.spawn(dropType, rarity, this.pos, id);
            } else {
              const rarity = pickWeightedRarity(settings.dropRarityWeights[this.rarity], this.rarity);
              this.world.drops.spawn(dropType, rarity, this.pos, id);
            }
          }
        }
        return;
      }
    }
    
    if (this.active) {
      if (this.type === 'hornet') this.updateHornet(dt);
      else this.updateGround(dt);
    }

    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-6 * dt));
    clampToArena(this.pos, this.radius);
    if (!this.flight) collideWalls(this.pos, this.radius);
  }

  updateGround(dt) {
    const player = this.world.nearestPlayer(this.pos);
    let vel = new THREE.Vector3();

    if (this.def.sightAggro) {
      const d = player ? this.pos.distanceTo(player.pos) : Infinity;
      if (d < this.def.sightAggro) this.aggro = true;
      else if (d > this.def.leash) this.aggro = false;
    }

      if (performance.now() > this.slowUntil) {
          this.slowMultiplier = 1;
      }

      const speed = this.speed * this.slowMultiplier;

      if (speed > 0) {
      if (this.aggro && player) {
        const toPlayer = player.pos.clone().sub(this.pos).setY(0);
        if (toPlayer.lengthSq() > 0.01) toPlayer.normalize();
        if (this.type === 'bee') {
          this.sinePhase += dt * 6;
          const perp = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
          vel = toPlayer.add(perp.multiplyScalar(Math.sin(this.sinePhase) * 0.8))
            .normalize().multiplyScalar(speed * 3);
        } else {
          vel = toPlayer.multiplyScalar(speed * 1.8);
        }
      } else {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 2 + Math.random() * 3;
          this.heading = Math.random() * Math.PI * 2;
        }
        let dir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        if (this.type === 'bee') {
          this.sinePhase += dt * 3;
          const perp = new THREE.Vector3(-dir.z, 0, dir.x);
          dir = dir.add(perp.multiplyScalar(Math.sin(this.sinePhase) * 0.6)).normalize();
        }
        vel = dir.multiplyScalar(speed);
      }
      this.pos.addScaledVector(vel, dt);
    }

    if (vel.lengthSq() > 0.01) this.facing = Math.atan2(vel.x, vel.z);
  }

  updateHornet(dt) {
    const player = this.world.nearestPlayer(this.pos);
    const f = this.flight;
    const toPlayer = player ? player.pos.clone().sub(this.pos).setY(0) : new THREE.Vector3();
    const hDist = player ? toPlayer.length() : Infinity;
    if (player && hDist > 0.01) toPlayer.multiplyScalar(1 / hDist);

    if (!player) {
      this.aggro = false;
      f.state = 'cruise';
    } else if (hDist < HORNET.aggroRange) {
      this.aggro = true;
    }

    let vel = new THREE.Vector3();
    const speed = this.speed * this.slowMultiplier;
    let altTarget = HORNET.cruiseAlt + this.radius;
    let altRate = 2.2;

    if (f.state === 'cruise') {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 3;
        this.heading = Math.random() * Math.PI * 2;
      }
      vel.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(speed);
      this.facing = Math.atan2(vel.x, vel.z);
      if (this.aggro) {
        f.state = 'volley';
        f.shots = 2 + this.rarity;
        f.fireTimer = 1.2;
      }
    } else if (f.state === 'volley') {
      altTarget = HORNET.volleyAlt + this.radius;
      const inRing = hDist < HORNET.standoff + 2;
      if (!inRing) {
        vel.copy(toPlayer).multiplyScalar(speed * 1.6);
      } else if (hDist < HORNET.standoff - 2) {
        vel.copy(toPlayer).multiplyScalar(-speed * 1.6);
      } else {
        vel.set(-toPlayer.z, 0, toPlayer.x).multiplyScalar(speed * 0.7 * this.strafeDir);
      }
      this.facing = inRing
        ? Math.atan2(-toPlayer.x, -toPlayer.z)
        : Math.atan2(toPlayer.x, toPlayer.z);

      f.regrow -= dt;
      if (f.regrow <= 0) this.loaded = true;
      f.fireTimer -= dt;
      if (f.fireTimer <= 0 && this.loaded && inRing && hDist < HORNET.fireRange) {
        this.world.mobs.fireMissile(this, player);
        this.loaded = false;
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
      const toTarget = f.target.clone().sub(this.pos).setY(0);
      const dist = toTarget.length();
      if (dist > 0.01) vel.copy(toTarget.multiplyScalar(1 / dist)).multiplyScalar(speed * HORNET.swoopSpeedMult);
      this.facing = Math.atan2(vel.x, vel.z);
      f.timer -= dt;
      if (dist < 2.5 || f.timer <= 0) {
        f.state = this.aggro ? 'volley' : 'cruise';
        f.shots = 2 + this.rarity;
        f.fireTimer = 1.4;
      }
    }

    const wallPush = hornetWallPush(this.pos);
    if (wallPush.lengthSq() > 0) vel.add(wallPush.multiplyScalar(speed * 2.5));

    this.pos.addScaledVector(vel, dt);
    const prevY = this.pos.y;
    this.pos.y += (altTarget - this.pos.y) * damp(altRate, dt);

    const vy = (this.pos.y - prevY) / Math.max(dt, 1e-6);
    const targetPitch = Math.atan2(-vy, Math.max(vel.length(), 2));
    this.pitch += (targetPitch - this.pitch) * damp(6, dt);
  }
}

export class MobManager {
  constructor(world) {
    this.world = world;
    this.mobs = [];
    this.missiles = [];
    this.spawnTimer = 0;
    this.staleTimer = STALE_SWEEP_INTERVAL;
    const initial = Math.floor(MOB_CAP * 0.8);
    for (let i = 0; i < initial; i++) this.trySpawn();

    this.assembler = null;
    this.assemblerTimer = ASSEMBLER_RELOCATE_INTERVAL;
    this.spawnAssembler();

    // Guaranteed periodic boss spawns, admin-configurable via
    // settings.ultraSpawnIntervalSec / superSpawnIntervalSec (0 disables).
    this.ultraTimer = settings.ultraSpawnIntervalSec;
    this.superTimer = settings.superSpawnIntervalSec;
  }

  // Picks a random valid spot for the Assembler: inside the arena, not
  // inside a wall cell. Falls back to the arena center if nothing turns up.
  randomAssemblerPos() {
    const margin = Math.max(12, MOB_TYPES.assembler.radius * RARITIES[0].scale + 3);
    for (let attempt = 0; attempt < 40; attempt++) {
      const pos = new THREE.Vector3(
        (Math.random() * 2 - 1) * (ARENA_HALF - margin), 0,
        (Math.random() * 2 - 1) * (ARENA_HALF - margin)
      );
      if (isWallCell(Math.round(pos.x / TILE_SIZE), Math.round(pos.z / TILE_SIZE))) continue;
      clampToArena(pos, margin);
      return pos;
    }
    const pos = new THREE.Vector3(0, 0, 0);
    clampToArena(pos, margin);
    return pos;
  }

  // Only ever one Assembler on the whole map. It's always spawned at Common
  // rarity — rarity is irrelevant for it since it's a stationary, invincible
  // interaction point rather than something meant to be fought.
  spawnAssembler() {
    this.assembler = this.spawn('assembler', 0, this.randomAssemblerPos());
    return this.assembler;
  }

  // Called every ASSEMBLER_RELOCATE_INTERVAL seconds: teleports the existing
  // Assembler to a new random spot, or spawns a fresh one if it's somehow
  // gone (e.g. removed via the admin panel).
  relocateAssembler() {
    if (!this.assembler || this.assembler.deadFlag) {
      this.spawnAssembler();
    } else {
      this.assembler.pos.copy(this.randomAssemblerPos());
    }
  }

  // Picks a mob type from the sacrifice/boss pool, weighted by the
  // admin-configurable settings.sacrificeSpawnWeights. Never picks the
  // Assembler, since that's a singleton utility mob, not a boss. Falls back
  // to a uniform pick if every configured weight has been zeroed out.
  pickSacrificeType() {
    const weighted = SACRIFICE_MOB_TYPES.filter((t) => (settings.sacrificeSpawnWeights[t] ?? 0) > 0);
    const pool = weighted.length > 0 ? weighted : SACRIFICE_MOB_TYPES;
    let total = 0;
    for (const t of pool) total += weighted.length > 0 ? settings.sacrificeSpawnWeights[t] : 1;
    let roll = Math.random() * total;
    for (const t of pool) {
      roll -= weighted.length > 0 ? settings.sacrificeSpawnWeights[t] : 1;
      if (roll <= 0) return t;
    }
    return pool[pool.length - 1];
  }

  // Random boss-rarity mob at a random spot on the map, drawn from the
  // sacrifice pool. Used both when a player hits the Assembler with a Blood
  // Sacrifice petal (always Super) and by the guaranteed periodic Ultra/
  // Super timers (see update()).
  spawnRandomSuper(rarity = RARITY_IDX.Super) {
    const type = this.pickSacrificeType();
    const margin = Math.max(12, MOB_TYPES[type].radius * RARITIES[rarity].scale + 3);
    const pos = new THREE.Vector3(
      (Math.random() * 2 - 1) * (ARENA_HALF - margin), 0,
      (Math.random() * 2 - 1) * (ARENA_HALF - margin)
    );
    clampToArena(pos, margin);
    const mob = this.spawn(type, rarity, pos);
    this.announceBoss(type, rarity);
    return mob;
  }

  pickType({ exclude = [], biome = 'grass' } = {}) {
    const alive = {};
    for (const m of this.mobs) alive[m.type] = (alive[m.type] || 0) + 1;
    const capOf = (def) => Math.max(def.maxAlive, Math.round(def.maxAlive * MOB_CAP / 56));
    const antCap = Math.round(MOB_CAP * ANT_MAX_SHARE);
    const antAlive = ANT_TYPES.reduce((sum, t) => sum + (alive[t] || 0), 0);
    const entries = Object.entries(MOB_TYPES)
      .filter(([type]) => !exclude.includes(type))
      .filter(([type]) => type !== 'assembler')
      .filter(([, def]) => biome === 'grass' ? !def.spawnBiome : def.spawnBiome === biome)
      .filter(([type, def]) => !def.maxAlive || (alive[type] || 0) < capOf(def))
      .filter(([type]) => !ANT_TYPES.includes(type) || antAlive < antCap);
    let total = 0;
    for (const [, def] of entries) total += def.spawnWeight ?? 1;
    let r = Math.random() * total;
    for (const [type, def] of entries) {
      r -= def.spawnWeight ?? 1;
      if (r <= 0) return type;
    }
    return entries[0]?.[0] ?? null;
  }

  trySpawn() {
    if (this.mobs.length >= MOB_CAP) return;
    const players = [...this.world.players.values()];
    for (let attempt = 0; attempt < 20; attempt++) {
      const pos = new THREE.Vector3(
        (Math.random() * 2 - 1) * (ARENA_HALF - 8), 0,
        (Math.random() * 2 - 1) * (ARENA_HALF - 8)
      );
      const biome = tileTypeAt(pos.x, pos.z);
      if (biome !== 'grass' && biome !== 'desert' && biome !== 'jungle') continue;
      if (isWallCell(Math.round(pos.x / TILE_SIZE), Math.round(pos.z / TILE_SIZE))) continue;
      if (players.some((p) => pos.distanceTo(p.pos) < 30)) continue;
      const dist = Math.hypot(pos.x - SPAWN_POS.x, pos.z - SPAWN_POS.z);
      const maxDist = Math.hypot(ARENA_HALF + Math.abs(SPAWN_POS.x), ARENA_HALF + Math.abs(SPAWN_POS.z));
      let rarity = pickRarity(Math.random, Math.min(1, dist / maxDist));
      if (dist < SAFE_RING) rarity = Math.min(rarity, SAFE_RING_MAX_RARITY);
      const aliveByRarity = new Array(RARITIES.length).fill(0);
      for (const m of this.mobs) aliveByRarity[m.rarity]++;
      const tierFull = (r) => RARITIES[r].maxShare !== undefined &&
        aliveByRarity[r] >= Math.max(1, Math.round(RARITIES[r].maxShare * MOB_CAP));
      while (rarity > 0 && tierFull(rarity)) rarity--;
      const type = this.pickType({ biome });
      if (!type) continue;
      const mob = this.spawn(type, rarity, pos);
      if (type === 'anthole') spawnEscort(this, mob);
      if (rarity === RARITY_IDX.Ultra || type === 'goldenleafbug') this.announceBoss(type, rarity);
      return;
    }
  }

  spawn(type, rarity, pos) {
    const mob = new Mob(this.world, type, rarity, pos);
    this.mobs.push(mob);
    return mob;
  }

  // Admin-panel manual spawn. `rarity` defaults to Super to preserve the old
  // spawnAdminSuper behavior, but any rarity index can be requested so the
  // admin panel can spawn Commons through Eternals alike. `at` is an
  // optional { x, z } world position (from the admin map); when omitted a
  // random valid position is picked like before.
  spawnAdmin(type, rarity = RARITY_IDX.Super, at = null) {
    if (!MOB_TYPES[type]) throw new Error('unknown mob type');
    if (type === 'assembler') throw new Error('assembler is a managed singleton — despawn/relocate it instead of spawning another');
    if (!Number.isInteger(rarity) || !RARITIES[rarity]) throw new Error('unknown rarity');
    const margin = Math.max(12, MOB_TYPES[type].radius * RARITIES[rarity].scale + 3);
    const pos = at && Number.isFinite(at.x) && Number.isFinite(at.z)
      ? new THREE.Vector3(at.x, 0, at.z)
      : new THREE.Vector3(
        (Math.random() * 2 - 1) * (ARENA_HALF - margin), 0,
        (Math.random() * 2 - 1) * (ARENA_HALF - margin),
      );
    clampToArena(pos, margin);
    const mob = this.spawn(type, rarity, pos);
    if (type === 'anthole') spawnEscort(this, mob);
    // Only Ultra and above are meant to broadcast a server-wide spawn
    // message — same threshold as natural spawns in trySpawn(). Lower
    // rarities spawn silently even when triggered from the admin panel,
    // except Golden Leafbugs, which always announce regardless of rarity.
    if (rarity >= RARITY_IDX.Ultra || type === 'goldenleafbug') this.announceBoss(type, rarity);
    return mob;
  }

  // Kept as a thin alias so any older call sites keep working unchanged.
  spawnAdminSuper(type) {
    return this.spawnAdmin(type, RARITY_IDX.Super);
  }

  // Admin-panel manual despawn: just flags the mob dead. update() already
  // sweeps deadFlag mobs out of this.mobs every tick, and die()'s xp/drop
  // logic is intentionally skipped here — an admin despawn isn't a kill.
  despawn(id) {
    const mob = this.mobs.find((m) => m.id === id);
    if (!mob) return false;
    mob.deadFlag = true;
    // The Assembler is a singleton that's always supposed to exist — if this
    // was it, replace it right away instead of leaving the map without one
    // until the next ASSEMBLER_RELOCATE_INTERVAL tick (up to 20 minutes).
    if (mob === this.assembler) this.spawnAssembler();
    return true;
  }

  announceBoss(type, rarity) {
    const name = RARITIES[rarity].name;
    this.world.events.push({ e: 'toast', text: `A ${name} ${MOB_TYPES[type].name} has spawned somewhere` });
    if (rarity === RARITY_IDX.Ultra) notifyUltraSpawn(MOB_TYPES[type].name);
  }


  fireMissile(hornet, player) {
    const r = RARITIES[hornet.rarity];
    const mdef = hornet.def.missile;
    const target = new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z);
    const aim = target.clone().sub(hornet.pos).setY(0).normalize();
    const origin = hornet.pos.clone().addScaledVector(aim, hornet.radius * 1.2);
    const vel = target.sub(origin).normalize().multiplyScalar(mdef.speed);
    this.missiles.push({
      id: uid(),
      pos: origin,
      vel,
      radius: mdef.radius * r.scale,
      hp: mdef.hp * r.statMult,
      dmg: mdef.dmg * r.dmgMult,
      rarity: hornet.rarity,
      life: 4,
      yaw: Math.atan2(vel.x, vel.z),
      pitch: Math.atan2(-vel.y, Math.hypot(vel.x, vel.z)),
      dead: false,
    });
  }

  update(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25;
      this.trySpawn();
    }

    this.assemblerTimer -= dt;
    if (this.assemblerTimer <= 0) {
      this.assemblerTimer = ASSEMBLER_RELOCATE_INTERVAL;
      this.relocateAssembler();
    }

    // Guaranteed periodic boss spawns. Each timer re-reads the live setting
    // every tick so an admin change (or disabling via 0) takes effect
    // immediately without needing a restart.
    if (settings.ultraSpawnIntervalSec > 0) {
      this.ultraTimer -= dt;
      if (this.ultraTimer <= 0) {
        this.ultraTimer = settings.ultraSpawnIntervalSec;
        this.spawnRandomSuper(RARITY_IDX.Ultra);
      }
    } else {
      this.ultraTimer = settings.ultraSpawnIntervalSec;
    }

    if (settings.superSpawnIntervalSec > 0) {
      this.superTimer -= dt;
      if (this.superTimer <= 0) {
        this.superTimer = settings.superSpawnIntervalSec;
        this.spawnRandomSuper(RARITY_IDX.Super);
      }
    } else {
      this.superTimer = settings.superSpawnIntervalSec;
    }

    for (const mob of this.mobs) mob.update(dt);

    this.staleTimer -= dt;
    if (this.staleTimer <= 0) {
      this.staleTimer = STALE_SWEEP_INTERVAL;
      const alive = [...this.world.players.values()].filter((p) => !p.dead);
      const r2 = VIEW_RADIUS * VIEW_RADIUS;
      const activeR2 = ACTIVE_RADIUS * ACTIVE_RADIUS;
      for (const m of this.mobs) {
        if (alive.some((p) => p.pos.distanceToSquared(m.pos) < r2)) {
          m.lonely = 0;
        } else {
          m.lonely = (m.lonely || 0) + STALE_SWEEP_INTERVAL;
          // The Assembler is a singleton and never recycled this way — it's
          // only ever removed/replaced via relocateAssembler().
          if (m.type !== 'assembler' && m.lonely >= STALE_RECYCLE_AFTER) m.deadFlag = true;
        }
        m.active = alive.some((p) => p.pos.distanceToSquared(m.pos) < activeR2);
      }
    }

    // Keep mobs from walking through each other, but only resolve nearby,
    // currently active entities. This avoids the old expensive all-mob pass
    // in dense jungle areas.
    const CELL = 32;
    const grid = new Map();
    for (const mob of this.mobs) {
      if (mob.deadFlag || !mob.active) continue;
      const key = `${Math.floor(mob.pos.x / CELL)},${Math.floor(mob.pos.z / CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(mob);
    }
    const separate = (a, b) => {
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const distance = Math.hypot(dx, dz);
      const minimum = a.radius + b.radius;
      if (distance >= minimum) return;
      const angle = distance > 0.001 ? null : (a.id * 0.61803398875) % (Math.PI * 2);
      const nx = angle == null ? dx / distance : Math.cos(angle);
      const nz = angle == null ? dz / distance : Math.sin(angle);
      const aMoves = a.speed > 0, bMoves = b.speed > 0;
      if (!aMoves && !bMoves) return;
      const amount = (minimum - distance) / (aMoves && bMoves ? 2 : 1);
      if (aMoves) { a.pos.x -= nx * amount; a.pos.z -= nz * amount; }
      if (bMoves) { b.pos.x += nx * amount; b.pos.z += nz * amount; }
    };
    const FORWARD_NEIGHBORS = [[0, 1], [1, -1], [1, 0], [1, 1]];
    for (const [key, bucket] of grid) {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) separate(bucket[i], bucket[j]);
      }
      const [cx, cz] = key.split(',').map(Number);
      for (const [ox, oz] of FORWARD_NEIGHBORS) {
        const other = grid.get(`${cx + ox},${cz + oz}`);
        if (!other) continue;
        for (const a of bucket) for (const b of other) separate(a, b);
      }
    }

    this.mobs = this.mobs.filter((m) => !m.deadFlag);

    for (const mi of this.missiles) {
      mi.pos.addScaledVector(mi.vel, dt);
      mi.life -= dt;
      if (mi.life <= 0 || mi.pos.y <= 0.05 ||
          mi.pos.y < wallTopAt(mi.pos.x, mi.pos.z) ||
          Math.max(Math.abs(mi.pos.x), Math.abs(mi.pos.z)) > ARENA_HALF + 4) {
        mi.dead = true;
      }
    }
    this.missiles = this.missiles.filter((m) => !m.dead);
  }
}