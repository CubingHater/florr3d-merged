import * as THREE from 'three';
import { uid } from './utils.js';
import { RARITIES } from '../shared/config.js';
import { PETAL_TYPES, petalStat } from '../shared/petals.js';
import { notifyPetalDrop } from './discord.js';

const LIFETIME = 30;

export class DropManager {
  constructor(world) {
    this.world = world;
    this.drops = [];
  }

  spawn(type, rarity, pos, owner) {
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      0,
      (Math.random() - 0.5) * 3
    );
    this.drops.push({ id: uid(), type, rarity, pos: pos.clone().add(offset).setY(0), age: 0, owner });
  }

  update(dt) {
    for (const drop of this.drops) {
      drop.age += dt;
      if (drop.age > LIFETIME) { drop.gone = true; continue; }
      const player = this.world.players.get(drop.owner);
      if (!player) { drop.gone = true; continue; }
      
      // Check if player has magnet petal equipped
      let hasMagnet = false;
      let magnetRange = 0;
      for (const inst of player.petals.instances) {
        if (inst.alive && PETAL_TYPES[inst.type]?.dropMagnet) {
          hasMagnet = true;
          // Magnet range increases with rarity: base 50 + 25 per rarity tier
          magnetRange = Math.max(magnetRange, 50 + inst.rarity * 25);
        }
      }
      
      // If player has magnet, attract drops towards them
      if (hasMagnet && !player.dead) {
        const dist = drop.pos.distanceTo(player.pos);
        if (dist < magnetRange && dist > player.radius + 1.4) {
          const dir = player.pos.clone().sub(drop.pos).normalize();
          const speed = 30 * dt; // Attraction speed
          drop.pos.add(dir.multiplyScalar(speed));
        }
      }
      
      if (!player.dead && drop.pos.distanceTo(player.pos) < player.radius + 1.4) {
        player.addToInventory(drop.type, drop.rarity);
        // Obtained-petal leaderboard points apply to map drops only; crafting
        // adds its own attempt score in World.handle.
        const dropPoints = [25, 1, 2, 3, 4, 5, 10, 25, 250, 1000][drop.rarity] || 0;
        player.leaderboard.dropPoints += dropPoints;
        
        // Send global message only for Ultra, Super, Eternal, and Special rarity drops
        const rarityName = RARITIES[drop.rarity]?.name;
        const petalName = PETAL_TYPES[drop.type]?.name(drop.rarity) || drop.type;
        if (rarityName === 'Ultra' || rarityName === 'Super' || rarityName === 'Eternal' || rarityName === 'Special') {
          // Ultra, Super, Eternal and Special rarity drops get global messages
          if (rarityName === 'Special') {
            // Special rarity: don't mention rarity in message
            this.world.events.push({ e: 'toast', text: `A ${petalName} has been found by ${player.name}!` });
            this.world.externalEvents.push({ e: 'toast', text: `A ${petalName} has been found by ${player.name}!` });
          } else {
            this.world.events.push({ e: 'toast', text: `A ${rarityName} ${petalName} has been found by ${player.name}!` });
            this.world.externalEvents.push({ e: 'toast', text: `A ${rarityName} ${petalName} has been found by ${player.name}!` });
          }
          notifyPetalDrop(rarityName, petalName, player.name);
        }
        
        drop.gone = true;
      }
    }
    this.drops = this.drops.filter((d) => !d.gone);
  }
}
