import { RARITIES } from '../shared/config.js';
import { PETAL_TYPES, petalStat } from '../shared/petals.js';
import { db } from './db.js';
import { liveAccounts } from './ws.js';

let worldInstance = null;

export function setWorldInstance(world) {
  worldInstance = world;
}

export async function handleExternalApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/api/external/message') {
    await handleExternalMessage(req, res, url);
  } else if (pathname === '/api/external/config') {
    await handleGetConfig(req, res);
  } else if (pathname === '/api/external/events') {
    await handleGetEvents(req, res, url);
  } else if (pathname === '/api/external/verify-discord') {
    await handleVerifyDiscord(req, res, url);
  } else if (pathname === '/api/external/award-petal') {
    await handleAwardPetal(req, res);
  } else if (pathname === '/api/external/remove-petal') {
    await handleRemovePetal(req, res);
  } else if (pathname === '/api/external/kill-player') {
    await handleKillPlayer(req, res);
  } else if (pathname === '/api/external/get-logged-users') {
    await handleGetLoggedUsers(req, res);
  } else {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

async function handleExternalMessage(req, res, url) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const { type, data } = body;

    // Send message to the global events system
    if (type === 'toast' && worldInstance) {
      worldInstance.events.push({ e: 'toast', text: data.text });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Message sent' }));
    } else {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid message type or world not available' }));
    }
  } catch (error) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request body' }));
  }
}

async function handleGetEvents(req, res, url) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const sinceIndex = parseInt(url.searchParams.get('since_index') || '0');
  
  if (!worldInstance) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ events: [], currentIndex: 0 }));
    return;
  }

  // Get external events since the specified index
  const events = worldInstance.externalEvents.slice(sinceIndex);
  
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ 
    events, 
    currentIndex: worldInstance.externalEvents.length 
  }));
}

async function handleGetConfig(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    rarities: RARITIES.map(r => ({ name: r.name, color: r.color })),
    petalTypes: PETAL_TYPES
  }));
}

async function handleVerifyDiscord(req, res, url) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const discordId = url.searchParams.get('discord_id');
  if (!discordId) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'discord_id parameter required' }));
    return;
  }

  try {
    const account = db.prepare('SELECT id FROM accounts WHERE discord_id = ?').get(discordId);
    
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 
      verified: !!account,
      account_id: account?.id || null
    }));
  } catch (error) {
    console.error('Database error:', error);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Database error' }));
  }
}

async function handleAwardPetal(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const { discord_id, petal_type, rarity } = body;

    if (!discord_id || !petal_type || rarity === undefined) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'discord_id, petal_type, and rarity required' }));
      return;
    }

    const account = db.prepare('SELECT id FROM accounts WHERE discord_id = ?').get(discord_id);
    if (!account) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Discord account not linked to game account' }));
      return;
    }

    const petalKey = `${petal_type}:${rarity}`;
    const currentInventory = db.prepare('SELECT inventory FROM accounts WHERE id = ?').get(account.id);
    let inventory = {};
    
    if (currentInventory?.inventory) {
      try {
        inventory = JSON.parse(currentInventory.inventory);
      } catch (e) {
        inventory = {};
      }
    }

    inventory[petalKey] = (inventory[petalKey] || 0) + 1;
    
    db.prepare('UPDATE accounts SET inventory = ? WHERE id = ?')
      .run(JSON.stringify(inventory), account.id);

    // Also update active player if they're currently logged in
    const activePlayer = liveAccounts.get(account.id);
    if (activePlayer) {
      activePlayer.inventory.set(petalKey, (activePlayer.inventory.get(petalKey) || 0) + 1);
      activePlayer.invDirty = true;
      activePlayer.refreshLoadoutSlots();
      activePlayer.toast(`+ ${RARITIES[rarity]?.name || rarity} ${PETAL_TYPES[petal_type]?.name(rarity) || petal_type}`);
      console.log(`Updated active player ${activePlayer.id} inventory with ${petalKey}`);
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Petal awarded' }));
  } catch (error) {
    console.error('Award petal error:', error);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to award petal' }));
  }
}

async function handleRemovePetal(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const { discord_id, petal_type, rarity } = body;

    if (!discord_id || !petal_type || rarity === undefined) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'discord_id, petal_type, and rarity required' }));
      return;
    }

    const account = db.prepare('SELECT id FROM accounts WHERE discord_id = ?').get(discord_id);
    if (!account) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Discord account not linked to game account' }));
      return;
    }

    const petalKey = `${petal_type}:${rarity}`;
    const currentInventory = db.prepare('SELECT inventory FROM accounts WHERE id = ?').get(account.id);
    let inventory = {};

    if (currentInventory?.inventory) {
      try {
        inventory = JSON.parse(currentInventory.inventory);
      } catch (e) {
        inventory = {};
      }
    }

    // Check if user has the petal
    if (!inventory[petalKey] || inventory[petalKey] <= 0) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'User does not have this petal' }));
      return;
    }

    inventory[petalKey] = inventory[petalKey] - 1;

    // Remove from inventory if count reaches 0
    if (inventory[petalKey] <= 0) {
      delete inventory[petalKey];
    }

    db.prepare('UPDATE accounts SET inventory = ? WHERE id = ?')
      .run(JSON.stringify(inventory), account.id);

    // Also update active player if they're currently logged in
    const activePlayer = liveAccounts.get(account.id);
    if (activePlayer) {
      const currentCount = activePlayer.inventory.get(petalKey) || 0;
      if (currentCount > 0) {
        activePlayer.inventory.set(petalKey, currentCount - 1);
        if (activePlayer.inventory.get(petalKey) <= 0) {
          activePlayer.inventory.delete(petalKey);
        }
        activePlayer.invDirty = true;
        activePlayer.refreshLoadoutSlots();
        activePlayer.toast(`- ${RARITIES[rarity]?.name || rarity} ${PETAL_TYPES[petal_type]?.name(rarity) || petal_type}`);
        console.log(`Removed ${petalKey} from active player ${activePlayer.id} inventory`);
      }
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Petal removed' }));
  } catch (error) {
    console.error('Remove petal error:', error);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to remove petal' }));
  }
}

async function handleKillPlayer(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const { discord_id } = body;

    if (!discord_id) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'discord_id required' }));
      return;
    }

    const account = db.prepare('SELECT id FROM accounts WHERE discord_id = ?').get(discord_id);
    if (!account) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Discord account not linked to game account' }));
      return;
    }

    // Check if player is currently logged in
    const activePlayer = liveAccounts.get(account.id);
    if (!activePlayer) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Player is not currently logged in' }));
      return;
    }

    // Kill the player
    if (activePlayer.hp) {
      activePlayer.hp = 0;
      activePlayer.dead = true;
      console.log(`Killed player ${activePlayer.id} via external API`);
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Player killed' }));
  } catch (error) {
    console.error('Kill player error:', error);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to kill player' }));
  }
}

async function handleGetLoggedUsers(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    // Get users with discord_id who have been active in the last 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const users = db.prepare(`
      SELECT discord_id, username 
      FROM accounts 
      WHERE discord_id IS NOT NULL 
        AND last_seen > ?
    `).all(oneDayAgo);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ users }));
  } catch (error) {
    console.error('Get logged users error:', error);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to get logged users' }));
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
  });
}
