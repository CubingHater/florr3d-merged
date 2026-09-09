import { RARITIES } from '../shared/config.js';

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_ULTRA_CHANNEL_ID;

const MIN_INTERVAL_MS = 60_000;
let lastSent = 0;

function hexToDecimal(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

function sendDiscordMessage(title, description, color) {
  if (!BOT_TOKEN || !CHANNEL_ID) return;
  const now = Date.now();
  if (now - lastSent < MIN_INTERVAL_MS) return;
  lastSent = now;

  const body = {
    embeds: [{
      title,
      description,
      color,
    }],
  };

  fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => console.error('[discord] message failed', err.message));
}

export function notifyUltraSpawn(mobName) {
  const rarity = RARITIES.find(r => r.name === 'Ultra');
  sendDiscordMessage(
    'Ultra spawned',
    `A **${mobName}** rolled Ultra rarity.`,
    hexToDecimal(rarity.color)
  );
}

export function notifySuperSpawn(mobName) {
  const rarity = RARITIES.find(r => r.name === 'Super');
  sendDiscordMessage(
    'Super spawned',
    `A **${mobName}** rolled Super rarity.`,
    hexToDecimal(rarity.color)
  );
}

export function notifyEternalSpawn(mobName) {
  const rarity = RARITIES.find(r => r.name === 'Eternal');
  sendDiscordMessage(
    'Eternal spawned',
    `A **${mobName}** rolled Eternal rarity.`,
    hexToDecimal(rarity.color)
  );
}

export function notifyMobKill(rarityName, mobName, playerName) {
  const rarity = RARITIES.find(r => r.name === rarityName);
  if (rarity) {
    sendDiscordMessage(
      `${rarityName} defeated`,
      `A **${rarityName} ${mobName}** has been defeated by **${playerName}**!`,
      hexToDecimal(rarity.color)
    );
  }
}

export function notifyPetalDrop(rarityName, petalName, playerName) {
  const rarity = RARITIES.find(r => r.name === rarityName);
  if (rarity) {
    sendDiscordMessage(
      `${rarityName} drop`,
      `**${playerName}** found a **${rarityName} ${petalName}**!`,
      hexToDecimal(rarity.color)
    );
  }
}
