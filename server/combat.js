import * as THREE from 'three';
import { HIT_COOLDOWN, PLAYER_BODY_DAMAGE, RARITIES } from '../shared/config.js';
import { MOB_TYPES } from '../shared/mobs.js';
import { PETAL_TYPES, petalStat } from '../shared/petals.js';

// Rate limiting for damage events to prevent event array explosion
const DAMAGE_EVENT_COOLDOWN = 100; // ms between damage events for same entity
const lastDamageEvents = new Map();

function canHit(owner, otherId, time, cooldown = HIT_COOLDOWN) {
  const last = owner.hitCooldowns.get(otherId) || -Infinity;
  if (time - last < cooldown) return false;
  owner.hitCooldowns.set(otherId, time);
  return true;
}

// Check if we should generate a damage event (rate limited)
function shouldGenerateDamageEvent(entityId, time) {
  const last = lastDamageEvents.get(entityId) || -Infinity;
  if (time - last < DAMAGE_EVENT_COOLDOWN) return false;
  lastDamageEvents.set(entityId, time);
  return true;
}

export function updateCombat(world, dt) {
  const t = world.time;
  const players = [...world.players.values()];

  // Rebuild spatial grid for this tick
  world.spatialGrid.clear();
  
  // Insert all active entities into spatial grid
  for (const mob of world.mobs.mobs) {
    if (!mob.deadFlag && !mob.dying) {
      world.spatialGrid.insert(mob);
    }
  }
  for (const player of players) {
    if (!player.dead) {
      world.spatialGrid.insert(player);
      for (const petal of player.petals.instances) {
        if (petal.alive) {
          world.spatialGrid.insert(petal);
        }
      }
    }
  }

  // Companion beetles fight the closest ordinary mob. Passing their owner as
  // attacker makes every point of companion damage count as that player's
  // damage for game stats and future leaderboards.
  const companions = world.mobs.mobs.filter((mob) => mob.isSummoned && mob.companionPetalId && !mob.deadFlag && !mob.dying);
  const enemies = world.mobs.mobs.filter((mob) => !mob.isSummoned && !mob.deadFlag && !mob.dying);
  
  for (const companion of companions) {
    // Use spatial grid to find nearby enemies instead of checking all
    const nearbyEnemies = world.spatialGrid.getNearbyEntities(companion.pos.x, companion.pos.z, 50)
      .filter(entity => entity === companion || enemies.includes(entity));
    
    let target = null, best = Infinity;
    for (const enemy of nearbyEnemies) {
      const d2 = companion.pos.distanceToSquared(enemy.pos);
      if (d2 < best) { best = d2; target = enemy; }
    }
    if (target && companion.pos.distanceTo(target.pos) < 0.75 * (companion.radius + target.radius)
        && canHit(companion, target.id, t, 0.6)) {
      target.damage(companion.dmg, companion.pos, world.players.get(companion.ownerId), 0.4);
    }
  }

  // Ordinary mobs can kill companions too, which is what eventually starts
  // the Egg/Crown reload.
  for (const enemy of enemies) {
    const nearbyCompanions = world.spatialGrid.getNearbyEntities(enemy.pos.x, enemy.pos.z, 30)
      .filter(entity => companions.includes(entity));
    
    for (const companion of nearbyCompanions) {
      if (enemy.pos.distanceTo(companion.pos) < 0.75 * (enemy.radius + companion.radius)
          && canHit(enemy, companion.id, t, 0.6)) {
        companion.damage(enemy.dmg, enemy.pos, null, 0.2);
      }
    }
  }

  for (const mob of world.mobs.mobs) {
    if (mob.deadFlag || mob.dying) continue;

    // Use spatial grid to find nearby players instead of checking all
    const nearbyPlayers = world.spatialGrid.getNearbyEntities(mob.pos.x, mob.pos.z, 80)
      .filter(entity => players.includes(entity));

    for (const player of nearbyPlayers) {
      {
        const reach = mob.radius + 70;
        if (mob.pos.clone().sub(player.pos).lengthSq() > reach * reach) continue;
      }
      if (!player.dead && player.immunity <= 0) {
        const d = mob.pos.distanceTo(player.pos);
        if (d < 0.75 * mob.radius + player.radius) {
          if (canHit(mob, player.id, t, 0.6)) { // player-mob collisions have a different cd
            player.damage(mob.dmg);
            mob.damage(PLAYER_BODY_DAMAGE, player.pos, player);
            const push = player.pos.clone().sub(mob.pos).setY(0).normalize();
            player.knock.addScaledVector(push, 12);
            
            // mobsummon: mob spawns other mobs on its side when attacking
            if (mob.def.mobsummon && MOB_TYPES[mob.def.mobsummon]) {
              // Limit egypt beetle to max 5 mummy beetle spawns per fight
              if (mob.type === 'egyptbeetle') {
                mob.summonCount = (mob.summonCount || 0) + 1;
                if (mob.summonCount > 5) return;
              }
              const summonType = mob.def.mobsummon;
              const summonRarity = mob.rarity > 0 ? mob.rarity - 1 : 0;
              const spawnPos = mob.pos.clone().add(
                new THREE.Vector3(Math.random() * 4 - 2, 0, Math.random() * 4 - 2)
              );
              const summonedMob = world.mobs.spawn(summonType, summonRarity, spawnPos);
              summonedMob.isSummoned = true;
              if (mob.rarity === 0) {
                summonedMob.maxHp *= 0.5;
                summonedMob.hp = summonedMob.maxHp;
              }
            }
          }
        }
      }
      if (mob.deadFlag) break;

      // Use spatial grid to find nearby petals instead of checking all
      const nearbyPetals = world.spatialGrid.getNearbyEntities(mob.pos.x, mob.pos.z, 30)
        .filter(entity => entity.type && PETAL_TYPES[entity.type] && entity.alive);

      for (const petal of nearbyPetals) {
        if (!petal.alive) continue;
        const d = mob.pos.distanceTo(petal.pos);
        // pollen is super bugged lol
        if (petal.type === 'pollen') {
          const rad = mob.radius + petalStat(petal, 'effectRadius');
          if ((d < rad) && (canHit(mob, petal.id, t, petalStat(petal, 'hitCooldown')))) {
            const dmg = petalStat(petal, 'minDmg') * (d / rad) + petalStat(petal, 'maxDmg') * (1 - d / rad);
            mob.damage(dmg, petal.pos, player, 0);
          }
        }
        if (d < 0.75 * mob.radius + petal.radius) {
          const pdef = PETAL_TYPES[petal.type];
          if (canHit(mob, petal.id, t, petalStat(petal, 'hitCooldown'))) {
            const sd = petalStat(petal, 'speedDmg');
            const dmg = sd
              ? petal.dmg * sd.idle
                * sd.growth ** Math.min(sd.maxRatio, player.moveSpeed / player.speed)
              : petal.dmg;
            const rscale = (petal.rarity > mob.rarity ? 1.4 : 2);
            mob.damage(dmg, petal.pos, player, petalStat(petal, 'knockMult', 1) * Math.pow(rscale, petal.rarity - mob.rarity));

            // minusarmor: removes armor from enemy
            if (petal.minusarmor > 0) {
              const leafbugBaseArmor = MOB_TYPES.leafbug.armor;
              const armorReduction = leafbugBaseArmor * 0.5 * petal.minusarmor * RARITIES[petal.rarity].armorMult;
              mob.armor = Math.max(0, mob.armor - armorReduction);
            }

            // petalsummon: spawns a mob on player's side when petal hits
            if (petal.petalsummon && MOB_TYPES[petal.petalsummon]) {
              const summonType = petal.petalsummon;
              const summonRarity = petal.rarity > 0 ? petal.rarity - 1 : 0;
              const spawnPos = player.pos.clone().add(
                new THREE.Vector3(Math.random() * 4 - 2, 0, Math.random() * 4 - 2)
              );
              const summonedMob = world.mobs.spawn(summonType, summonRarity, spawnPos);
              // Make summoned mob fight for player by setting it to target other mobs
              summonedMob.aggro = true;
              // Mark as summoned so it doesn't drop loot normally
              summonedMob.isSummoned = true;
              // Track which player owns this summoned mob for loot distribution
              summonedMob.ownerId = player.id;
              // For common rarity, reduce health by 50%
              if (petal.rarity === 0) {
                summonedMob.maxHp *= 0.5;
                summonedMob.hp = summonedMob.maxHp;
              }
            }

            if (petal.type === 'pincer' && petal.slow > 0) {
              mob.applySlow(petal.slow);
            }

            if (petal.type === 'bloodsacrifice' && mob.type === 'assembler') {
              world.mobs.spawnRandomSuper();
              player.petals.removePetalType('bloodsacrifice');
            }

            // Companion petals must stay active while their beetles are
            // alive; their cooldown is controlled exclusively by the final
            // companion death, not by incidental contact with an enemy.
            if ((petal.type === 'beetleegg' || petal.type === 'pharcrown') && petal.companionMobIds?.size > 0) continue;
            petal.hp -= mob.dmg;
            // Skip destruction if petal has infinite health
            if (!petalStat(petal, 'infiniteHp') && petal.hp <= 0) player.petals.destroyInstance(petal);
            if (mob.deadFlag) break;
          }
        }
      }
      if (mob.deadFlag) break;
    }
  }

  for (const player of players) {
    for (const proj of player.petals.projectiles) {
      if (proj.dead) continue;
      // Use spatial grid to find nearby mobs
      const nearbyMobs = world.spatialGrid.getNearbyEntities(proj.pos.x, proj.pos.z, 20)
        .filter(entity => world.mobs.mobs.includes(entity) && !entity.deadFlag);
      
      for (const mob of nearbyMobs) {
        if (proj.pos.distanceTo(mob.pos) < proj.radius + 0.75 * mob.radius) {
          mob.damage(proj.dmg, proj.pos, player, 0.3);
          proj.dead = true;
          break;
        }
      }
    }
  }

  const hitPoint = new THREE.Vector3();
  for (const mi of world.mobs.missiles) {
    if (mi.dead) continue;

    // Use spatial grid to find nearby players
    const nearbyPlayers = world.spatialGrid.getNearbyEntities(mi.pos.x, mi.pos.z, 30)
      .filter(entity => players.includes(entity));

    for (const player of nearbyPlayers) {
      if (!player.dead && player.immunity <= 0) {
        hitPoint.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
        if (mi.pos.distanceTo(hitPoint) < mi.radius + player.radius) {
          player.damage(mi.dmg);
          mi.dead = true;
          break;
        }
      }

      // Use spatial grid to find nearby petals
      const nearbyPetals = world.spatialGrid.getNearbyEntities(mi.pos.x, mi.pos.z, 20)
        .filter(entity => entity.type && PETAL_TYPES[entity.type] && entity.alive);

      for (const petal of nearbyPetals) {
        if (!petal.alive) continue;
        hitPoint.set(petal.pos.x, petal.y + 1.1, petal.pos.z);
        if (mi.pos.distanceTo(hitPoint) < mi.radius + petal.radius) {
          petal.hp -= mi.dmg;
          mi.hp -= petal.dmg;
          // Rate limit damage events to prevent event array explosion
          if (shouldGenerateDamageEvent(petal.id, t)) {
            world.events.push({
              e: 'dmg', a: Math.round(petal.dmg),
              x: Math.round(mi.pos.x * 100) / 100, z: Math.round(mi.pos.z * 100) / 100,
            });
          }
          // Skip destruction if petal has infinite health
          //const pdef = PETAL_TYPES[petal.type];
          if (!petalStat(petal, 'infiniteHp') && petal.hp <= 0) player.petals.destroyInstance(petal);
          if (mi.hp <= 0) {
            mi.dead = true;
            break;
          }
        }
      }
      if (mi.dead) break;
    }
  }
}