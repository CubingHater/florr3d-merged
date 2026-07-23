import * as THREE from 'three';
import { HIT_COOLDOWN, PLAYER_BODY_DAMAGE, PETAL_TYPES, MOB_TYPES, RARITIES } from '../shared/config.js';

function canHit(owner, otherId, time, cooldown = HIT_COOLDOWN) {
  const last = owner.hitCooldowns.get(otherId) || -Infinity;
  if (time - last < cooldown) return false;
  owner.hitCooldowns.set(otherId, time);
  return true;
}

export function updateCombat(world, dt) {
  const t = world.time;
  const players = [...world.players.values()];

  for (const mob of world.mobs.mobs) {
    if (mob.deadFlag) continue;

    for (const player of players) {
      {
        const dx = mob.pos.x - player.pos.x, dz = mob.pos.z - player.pos.z;
        const reach = mob.radius + 8;
        if (dx * dx + dz * dz > reach * reach) continue;
      }
      if (!player.dead && player.immunity <= 0) {
        const d = mob.pos.distanceTo(player.pos);
        if (d < mob.radius + player.radius) {
          if (canHit(mob, player.id, t)) {
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

      for (const petal of player.petals.instances) {
        if (!petal.alive) continue;
        const d = mob.pos.distanceTo(petal.pos);
        if (d < mob.radius + petal.radius) {
          const pdef = PETAL_TYPES[petal.type];
          if (canHit(mob, petal.id, t, pdef.hitCooldown)) {
            const sd = pdef.speedDmg;
            const dmg = sd
              ? petal.dmg * sd.idle
                * sd.growth ** Math.min(sd.maxRatio, player.moveSpeed / player.speed)
              : petal.dmg;
            mob.damage(dmg, petal.pos, player);

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

            petal.hp -= mob.dmg;
            if (petal.hp <= 0) player.petals.destroyInstance(petal);
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
      for (const mob of world.mobs.mobs) {
        if (mob.deadFlag) continue;
        if (proj.pos.distanceTo(mob.pos) < proj.radius + mob.radius) {
          mob.damage(proj.dmg, proj.pos, player);
          proj.dead = true;
          break;
        }
      }
    }
  }

  const hitPoint = new THREE.Vector3();
  for (const mi of world.mobs.missiles) {
    if (mi.dead) continue;

    for (const player of players) {
      if (!player.dead && player.immunity <= 0) {
        hitPoint.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
        if (mi.pos.distanceTo(hitPoint) < mi.radius + player.radius) {
          player.damage(mi.dmg);
          mi.dead = true;
          break;
        }
      }

      for (const petal of player.petals.instances) {
        if (!petal.alive) continue;
        hitPoint.set(petal.pos.x, petal.pos.y + 1.1, petal.pos.z);
        if (mi.pos.distanceTo(hitPoint) < mi.radius + petal.radius) {
          petal.hp -= mi.dmg;
          mi.hp -= petal.dmg;
          world.events.push({
            e: 'dmg', a: Math.round(petal.dmg),
            x: Math.round(mi.pos.x * 100) / 100, z: Math.round(mi.pos.z * 100) / 100,
          });
          if (petal.hp <= 0) player.petals.destroyInstance(petal);
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
