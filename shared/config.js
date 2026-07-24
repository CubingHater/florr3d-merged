export const RARITIES = [
  { name: 'Common',    color: '#7eef6d', petalMult: 1,   statMult: 1,      dmgMult: 1,   armorMult: 1,   weight: 100,  scale: 1.0  },
  { name: 'Unusual',   color: '#ffe65d', petalMult: 2,   statMult: 2,      dmgMult: 2,   armorMult: 2,   weight: 100,  scale: 1.2  },
  { name: 'Rare',      color: '#4d52e3', petalMult: 4,   statMult: 5,      dmgMult: 4,   armorMult: 4,   weight: 50,   scale: 1.5  },
  { name: 'Epic',      color: '#861fde', petalMult: 8,   statMult: 20,     dmgMult: 8,   armorMult: 8,   weight: 20,   scale: 2.0  },
  { name: 'Legendary', color: '#de1f1f', petalMult: 16,  statMult: 120,    dmgMult: 16,  armorMult: 16,  weight: 5,    scale: 2.8,  maxShare: 0.05  },
  { name: 'Mythic',    color: '#1fdbde', petalMult: 32,  statMult: 800,    dmgMult: 32,  armorMult: 32,  weight: 2.5,  scale: 4.0,  maxShare: 0.04  },
  { name: 'Ultra',     color: '#ff2b75', petalMult: 64,  statMult: 10000,  dmgMult: 64,  armorMult: 64,  weight: 0.2,  scale: 6.0,  maxShare: 0.005 },
  // Super mobs are created only through the admin panel (weight 0).
  { name: 'Super',     color: '#29F79E', petalMult: 192, statMult: 30000,  dmgMult: 192, armorMult: 192, weight: 0, scale: 8.0, maxShare: 0.001, },
  // Eternal mobs are created only through the admin panel (weight 0). Stats
  // are exactly 3x Super's across the board. Their drops are handled as a
  // special case in Mob.die() — they always drop a Common Golden Leaf,
  // regardless of the mob's normal drop table.
  { name: 'Eternal',   color: '#E6E6E6', petalMult: 576, statMult: 90000,  dmgMult: 576, armorMult: 576, weight: 0, scale: 10.0, maxShare: 0.0005, manualOnly: true },
];

export const CHAT_MAX_LEN = 100;
export const NAME_MAX_LEN = 16;
export const stripNonAscii = (s) => s.replace(/[^\x20-\x7e]/g, '');

export const ANT_MAX_SHARE = 0.35;
export const ANT_TYPES = ['baby', 'worker', 'soldier', 'anthole'];

export const MOB_TYPES = {
  rock: {
    name: 'Rock', hp: 45, dmg: 8, armor: 2, radius: 1.6, speed: 0, xp: 2,
    dropSlots: [[['rockPetal', 1]], [], [], [], []],
    spawnWeight: 0.5,
    mobdeathtime: 0,
    mobsummon: null,
  },
  ladybug: {
    name: 'Ladybug', hp: 35, dmg: 12, armor: 0, radius: 1.5, speed: 2.4, xp: 4,
    dropSlots: [[['rose', 1]], [['bubble', 1], ['nothing', 1]], [['light', 1]], [], []],
    mobdeathtime: 0,
    mobsummon: null,
  },
  bee: {
    name: 'Bee', hp: 15, dmg: 40, armor: 0, radius: 1.4, speed: 2.8, xp: 5,
    dropSlots: [[['stinger', 1]], [], [], [], []],
    mobdeathtime: 0,
    mobsummon: null,
  },
  hornet: {
    name: 'Hornet', hp: 62.5, dmg: 30, armor: 1, radius: 1.7, speed: 2.0, xp: 12,
    dropSlots: [[['missile', 1], ['nothing', 1]], [['orange', 1]], [], [], []],
    spawnWeight: 0.35,
    maxAlive: 6,
    missile: { hp: 5, dmg: 6, speed: 16, radius: 0.45 },
    mobdeathtime: 0,
    mobsummon: null,
  },
  soldier: {
    name: 'Soldier Ant', hp: 40, dmg: 10, armor: 0, radius: 1.5, speed: 1.8, xp: 7,
    dropSlots: [[['glass', 1]], [['wing', 1]], [], [], []],
    sightAggro: 14,
    leash: 40,
    spawnWeight: 0.3,
    mobdeathtime: 0,
    mobsummon: null,
  },
  worker: {
    name: 'Worker Ant', hp: 25, dmg: 10, armor: 0, radius: 1.3, speed: 1.8, xp: 5,
    dropSlots: [[['corn', 1]], [['leaf', 1]], [], [], []],
    retaliates: true,
    mobdeathtime: 0,
    mobsummon: null,
  },
  baby: {
    name: 'Baby Ant', hp: 10, dmg: 10, armor: 0, radius: 1.0, speed: 1.4, xp: 2,
    dropSlots: [[['light', 1]], [['rice', 1]], [['leaf', 1]], [], []],
    passive: true,
    spawnWeight: 0.6,
    mobdeathtime: 0,
    mobsummon: null,
  },
  anthole: {
    name: 'Ant Hole', hp: 500, dmg: 10, armor: 2, radius: 2.5, speed: 0, xp: 50,
    dropSlots: [[], [], [], [], []],
    spawnWeight: 0.15,
    maxAlive: 1,
    mobdeathtime: 0,
    mobsummon: null,
  },
  scorpion: {
    name: 'Scorpion', hp: 80, dmg: 40, armor: 3, radius: 2.0, speed: 8, xp: 15,
    dropSlots: [[['iris', 1]], [['pincer', 1]], [['jobapplication', 0.01]], [], []],
    sightAggro: 18,
    spawnWeight: 0.44,
    spawnBiome: 'desert',
    mobdeathtime: 0,
    mobsummon: null,
  },
  beetle: {
    name: 'Beetle', hp: 70, dmg: 30, armor: 1, radius: 2.0, speed: 3, xp: 12,
    dropSlots: [[['privet', 1]], [['beetleegg', 1], ['nothing', 1]], [], [], []],
    sightAggro: 14,
    spawnWeight: 0.39,
    spawnBiome: 'desert',
    mobdeathtime: 0,
    mobsummon: null,
  },
  cactus: {
    name: 'Cactus', hp: 120, dmg: 80, armor: 2, radius: 2.0, speed: 0, xp: 5,
    dropSlots: [[['stinger', 1]], [['cactusPetal', 1]], [], [], []],
    passive: true,
    spawnWeight: 0.14,
    spawnBiome: 'desert',
    mobdeathtime: 0,
    mobsummon: null,
  },
  bush: {
    name: 'Bush', hp: 60, dmg: 20, armor: 0, radius: 2.0, speed: 0, xp: 3,
    dropSlots: [[['goldenleaf', 1], ['nothing', 99]], [['leaf', 1]], [], [], []],
    passive: true,
    spawnWeight: 0.20,
    spawnBiome: 'jungle',
    mobdeathtime: 0,
    mobsummon: null,
  },
  shinyladybug: {
    name: 'Ladybug', hp: 75, dmg: 12, armor: 0, radius: 1.5, speed: 2.4, xp: 12,
    dropSlots: [[['rose', 1]], [['dahlia', 1]], [['bubble', 1]], [], []],
    spawnWeight: 0.01,
    spawnBiome: 'desert',
    mobdeathtime: 0,
    mobsummon: null,
  },
  jungleladybug: {
    name: 'Ladybug', hp: 55, dmg: 12, armor: 0, radius: 1.5, speed: 2.4, xp: 8,
    dropSlots: [[['dahlia', 1], ['nothing', 1]], [['yinyang', 1]], [], [], []],
    spawnWeight: 0.25,
    spawnBiome: 'jungle',
    mobdeathtime: 0,
    mobsummon: null,
  },
  leafbug: {
    name: 'Leafbug', hp: 40, dmg: 14, armor: 5, radius: 1.5, speed: 2.4, xp: 4,
    dropSlots: [[['leaf', 1]], [['root', 1], ['nothing', 1]], [], []],
    spawnWeight: 0.39,
    spawnBiome: 'jungle',
    mobdeathtime: 0,
    mobsummon: null,
  },
  goldenleafbug: {
    name: 'Leafbug', hp: 40, dmg: 14, armor: 5, radius: 1.5, speed: 2.4, xp: 4,
    dropSlots: [[['goldenleaf', 1], ['nothing', 3]], [['root', 1]], [], [], []],
    spawnWeight: 0.01,
    spawnBiome: 'jungle',
    mobdeathtime: 0,
    mobsummon: null,
  },
  nazarbeetle: {
    name: 'Beetle', hp: 70, dmg: 30, armor: 1, radius: 2.0, speed: 3, xp: 12,
    dropSlots: [[['privet', 1]], [['beetleegg', 1]], [], [], []],
    sightAggro: 14,
    spawnWeight: 0.02,
    spawnBiome: 'desert',
    mobdeathtime: 0,
    mobsummon: null,
  },
  firefly: {
    name: 'Firefly', hp: 20, dmg: 20, armor: 0, radius: 1.5, speed: 1.4, xp: 9,
    dropSlots: [[['wing', 1]], [['bur', 1]], [], [], []],
    sightAggro: 14,
    leash: 40,
    spawnWeight: 0.15,
    spawnBiome: 'jungle',
    mobdeathtime: 0,
    mobsummon: null,
  },
  assembler: {
    name: 'Assembler', hp: 999999999999999999999, dmg: 0, armor: 0, radius: 1.5, speed: 0, xp: 100,
    dropSlots: [[['air', 1], ['jobapplication', 0.1]], [], [], [], []],
    passive: true,
    mobdeathtime: 0,
    mobsummon: null,
  },
  mummybeetle: {
    name: 'Beetle', hp: 70, dmg: 30, armor: 1, radius: 2.0, speed: 3, xp: 18,
    dropSlots: [[['privet', 1]], [['beetleegg', 1]], [], [], []],
    sightAggro: 14,
    spawnWeight: 0.02,
    spawnBiome: 'desert',
    mobdeathtime: 0.5,
    mobsummon: null,
  },
  egyptbeetle: {
    name: 'Beetle', hp: 200, dmg: 60, armor: 3, radius: 4.0, speed: 3, xp: 30,
    dropSlots: [[['privet', 1]], [['crown', 1],['nothing', 9]], [], [], []],
    sightAggro: 14,
    spawnWeight: 0.005,
    spawnBiome: 'desert',
    mobdeathtime: 1,
    mobsummon: 'mummybeetle',
  },
};

export const PETAL_TYPES = {
  basic:     { name: 'Basic',   hp: 10, dmg: 10, reload: 2.5, radius: 0.42, count: 1, color: '#ffffff',
               desc: 'A nice petal, not too strong but not too weak.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  rockPetal: { name: 'Rock',    hp: 30, dmg: 10, reload: 4,   radius: 0.5,  count: 1, color: '#7d7d84',
               desc: 'Heavy and durable.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  rose:      { name: 'Rose',    hp: 5,  dmg: 5,  reload: 3.5, radius: 0.42, count: 1, color: '#ff94c9', heal: 11,
               desc: "It's heals your skill issue.",
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  light:     { name: 'Light',   hp: 5 / 3, dmg: 13 / 3, reload: 0.6, radius: 0.28, count: 3, color: '#ffffff',
               desc: 'Weaker, but more and we ALL love more.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  stinger:   { name: 'Stinger', hp: 1,  dmg: 35, reload: 6,   radius: 0.35, count: 1, color: '#333333', flatHp: true,
               desc: 'Long reload, high reward.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  orange:    { name: 'Orange',  hp: 2,  dmg: 8 / 3, reload: 1, radius: 0.3, count: 3, color: '#eb9c2d',
               desc: 'Why would a hornet eat a orange??',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  missile:   { name: 'Missile', hp: 2,  dmg: 20, reload: 3,   radius: 0.4,  count: 1, color: '#333333',
               projectile: { speed: 24, life: 1.8 },
               desc: 'pew pew',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  glass:     { name: 'Glass',   hp: 3,  dmg: 15, reload: 1.5, radius: 0.4,  count: 1, color: '#eaf6fb',
               hitCooldown: 1,
               // Damage = dmg * idle * growth^(speed ratio), where the ratio is
               // your current speed / base walk speed, capped at maxRatio. Tuned
               // so a plain walk (ratio 1) is fairly weak and only pairing with
               // Bubble's speed (ratio ~3) reaches the big numbers. For Ultra
               // (base dmg 960): idle-still ≈ 509, walking ≈ 1220, max ≈ 7030.
               speedDmg: { idle: 0.53, growth: 2.40, maxRatio: 3.0 },
               desc: "This one cuts. Damage climbs exponentially with your movement speed — weak at a walk, devastating in flight. Pair with Bubble to hit top speed. Can't hit the same enemy more than once per second.",
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  rice:      { name: 'Rice',    hp: 1,  dmg: 1,  reload: 0.1, radius: 0.28, count: 1, color: '#f2f2ec',
               desc: 'Slop.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  corn:      { name: 'Corn',    hp: 200, dmg: 5, reload: 20,  radius: 0.55, count: 1, color: '#ffe419',
               desc: 'This petal is so corny.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  leaf:      { name: 'Leaf',    hp: 19, dmg: 8, reload: 3,   radius: 0.42, count: 1, color: '#39b54a', heal: 1,
               desc: 'It heals and damages at the same time.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  wing:      { name: 'Wing',    hp: 15, dmg: 10, reload: 4,  radius: 0.45, count: 1, color: '#ffffff',
               desc: 'Did you know that soldier ants drink redbull?',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  bubble:    { name: 'Bubble',  hp: 1,  dmg: 0,  reload: 5,  radius: 0.45, count: 1, color: '#dff2fb', flatHp: true,
               desc: 'LOOK MOM I CAN FLY',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  iris:      { name: 'Iris',    hp: 9,  dmg: 15, reload: 2.5,  radius: 0.4,  count: 1, color: '#C673D3',
               desc: 'Poisons the mobs I guess',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  goldenleaf:{ name: 'Golden Leaf', hp: 19, dmg: 8, reload: 3, radius: 0.42, count: 1, color: '#a9a613',
               desc: 'Reduces the reload time of all petals: 0% at Common, then 10% more per rarity.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  privet:    { name: 'Privet',    hp: 10, dmg: 0, reload: 3,   radius: 0.35, count: 1, color: '#141410',
               desc: 'I WANT MORE POISON. Boosts iris and pincer damage.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  air:       { name: 'Air',    hp: 0, dmg: 0, reload: 0.1,   radius: 0.35, count: 1, color: '#141410',
               desc: 'Not a placeholder trust.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  pincer:    { name: 'Pincer',    hp: 7,  dmg: 8, reload: 1.5,  radius: 0.4,  count: 1, color: '#141114', slow: 0.30,
               desc: 'Slow down buddy.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  bloodsacrifice:    { name: 'Developer Sacrifice',    hp: 1,  dmg: 0, reload: 10,  radius: 1,  count: 1, color: '#141114',
               desc: 'Sacrifice the blood of the developer to feel the power of admin abuse.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  jobapplication:    { name: 'Mjolnir',    hp: 20,  dmg: 15, reload: 2,  radius: 0.42, count: 1, color: '#ff6b6b',
               desc: 'It sounds Swedish',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  nothing:    { name: 'Nothing',    hp: 0,  dmg: 0, reload: 0,  radius: 0, count: 1, color: '#333333',
               desc: 'Mbappe special.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  crown:     { name: 'Crown',   hp: 1, dmg: 0, reload: 10, radius: 0.42, count: 3, color: '#ffffff',
               desc: 'Summons some old friends from Egypt.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: 'mummybeetle', flowerhealth: 0 },
  beetleegg:     { name: 'Beetle Egg',   hp: 1, dmg: 0, reload: 75, radius: 0.42, count: 1, color: '#ffffff',
               desc: 'A nice petal, not too strong but not too weak.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: 'beetle', flowerhealth: 0 },
  root:     { name: 'Root',   hp: 10, dmg: 5, reload: 2, radius: 0.42, count: 1, color: '#ffffff',
               desc: 'square root',
               minusarmor: 0, flowerarmor: 0.5, yinyang: false, petalsummon: null, flowerhealth: 0 },
  dahlia:     { name: 'Dahlia',   hp: 7, dmg: 7, reload: 2, radius: 0.42, count: 1, color: '#ffffff', heal: 9,
               desc: 'faster',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
  yinyang:     { name: 'Yin Yang',   hp: 4, dmg: 3, reload: 0.1, radius: 0.42, count: 1, color: '#ffffff',
               desc: 'Turn arround.',
               minusarmor: 0, flowerarmor: 0, yinyang: true, petalsummon: null, flowerhealth: 0 },
  cactuspetal:     { name: 'Cactus',   hp: 5, dmg: 12.5, reload: 2.5, radius: 0.42, count: 1, color: '#ffffff',
               desc: 'Kevin has no mercy, cactus is not enough you fool.',
               minusarmor: 0, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 11 },
  bur:     { name: 'Bur',   hp: 10, dmg: 13, reload: 3, radius: 0.42, count: 1, color: '#ffffff',
               desc: 'A nice petal, not too strong but not too weak.',
               minusarmor: 0.5, flowerarmor: 0, yinyang: false, petalsummon: null, flowerhealth: 0 },
};

// GLB models available as player cosmetics in the admin panel. These only
// affect rendering; player statistics and hitboxes remain unchanged.
export const PLAYER_MODEL_IDS = [
  'bee', 'hornet', 'ladybug', 'queen', 'worker', 'baby', 'anthole',
  'scorpion', 'beetle', 'nazarbeetle', 'cactus', 'jungleladybug',
  'shinyladybug', 'goldenleafbug', 'leafbug', 'bush', 'assembler',
  'mummybeetle', 'egyptbeetle',
];

export const FLIGHT = {
  gravity: 18,
  maxFall: 30,
  // Wing glide sink rate = glideSink * sinkRarityMult^rarity. Tuned so a
  // Common wing barely helps (sinks at 15 ≈ half of maxFall) while Ultra is
  // unchanged from before (~1.16). Rarities in between scale steeply.
  glideSink: 15,
  sinkRarityMult: 0.653,
  // Bubble launch impulse = boost * boostRarityMult^rarity. Tuned so a Common
  // bubble is a feeble hop (~6, barely a meter) while Ultra is unchanged from
  // before (~62.3, still clamped to maxBoostSpeed horizontally).
  boost: 6,
  boostRarityMult: 1.477,
  drag: 0.35,
  groundDrag: 6,
  diveRate: 14,
  diveGain: 24,
  climbRate: 18,
  maxBoostSpeed: 40,
  // In-air keyboard/aim movement is faster than on the ground so flight feels
  // agile — you can strafe freely mid-glide instead of barely nudging.
  airControl: 1.3,
  maxAlt: 30,
  topdownPopPitch: 0.45,
};

export let ARENA_HALF = 185;

export const PITCH_LIMIT = Math.PI / 2 - 0.12;

export const TILE_SIZE = 20;
export const TILE_TYPES = {
  grass:     { name: 'Grass' },
  water:     { name: 'Water' },
  dirt:      { name: 'Dirt' },
  desert:    { name: 'Desert' },
  jungle:    { name: 'Jungle' },
  dirtWall:  { name: 'Dirt Wall',  isWall: true },
  stoneWall: { name: 'Stone Wall', isWall: true },
};
export const WALL_HEIGHT = 4;
export let MAP_TILES = [
  { gx: 1, gz: 0, type: 'water' },
  { gx: 2, gz: 0, type: 'water' },
];

export let MAP_WALLS = [];
const wallTops = new Map();
export const SPAWN_POS = { x: 0, z: 0 };

const tileTypes = new Map([['1,0', 'water'], ['2,0', 'water']]);

export function isWallCell(gx, gz) {
  return wallTops.has(gx + ',' + gz);
}
export function tileTypeAt(x, z) {
  return tileTypes.get(Math.round(x / TILE_SIZE) + ',' + Math.round(z / TILE_SIZE)) || 'grass';
}
export function wallTopAt(x, z) {
  return wallTops.get(Math.round(x / TILE_SIZE) + ',' + Math.round(z / TILE_SIZE)) || 0;
}

export function collideWalls(pos, radius) {
  if (wallTops.size === 0) return;
  const cgx = Math.round(pos.x / TILE_SIZE);
  const cgz = Math.round(pos.z / TILE_SIZE);
  const half = TILE_SIZE / 2;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const gx = cgx + dx, gz = cgz + dz;
      const top = wallTops.get(gx + ',' + gz);
      if (!top) continue;
      if ((pos.y || 0) >= top - 0.01) continue;
      const cx = gx * TILE_SIZE, cz = gz * TILE_SIZE;
      const px = Math.max(cx - half, Math.min(cx + half, pos.x));
      const pz = Math.max(cz - half, Math.min(cz + half, pos.z));
      const ex = pos.x - px, ez = pos.z - pz;
      const d2 = ex * ex + ez * ez;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = px + (ex / d) * radius;
        pos.z = pz + (ez / d) * radius;
      } else {
        const ox = pos.x - cx, oz = pos.z - cz;
        if (Math.abs(ox) > Math.abs(oz)) pos.x = cx + Math.sign(ox || 1) * (half + radius);
        else pos.z = cz + Math.sign(oz || 1) * (half + radius);
      }
    }
  }
}

export function applyMap({ arenaHalf, tiles, walls = {} }) {
  if (typeof arenaHalf !== 'number' || !Number.isFinite(arenaHalf) || !tiles) {
    throw new Error('applyMap: expected a normalized map payload ({ arenaHalf, tiles, walls }), got something else');
  }
  MOB_CAP = Math.min(520, Math.max(56, Math.round(56 * (arenaHalf / 185) ** 2)));
  ARENA_HALF = arenaHalf;
  MAP_TILES = [];
  tileTypes.clear();
  for (const [type, coords] of Object.entries(tiles)) {
    for (let i = 0; i < coords.length; i += 2) {
      MAP_TILES.push({ gx: coords[i], gz: coords[i + 1], type });
      tileTypes.set(coords[i] + ',' + coords[i + 1], type);
    }
  }
  MAP_WALLS = [];
  wallTops.clear();
  for (const [type, cols] of Object.entries(walls)) {
    for (let i = 0; i < cols.length; i += 3) {
      const col = { gx: cols[i], gz: cols[i + 1], h: cols[i + 2], type };
      MAP_WALLS.push(col);
      wallTops.set(col.gx + ',' + col.gz, col.h * WALL_HEIGHT);
    }
  }
  const edge = Math.ceil(ARENA_HALF / TILE_SIZE) - 1;
  SPAWN_POS.x = edge * TILE_SIZE; SPAWN_POS.z = -edge * TILE_SIZE;
  outer: for (let ring = 0; ring <= 2 * edge; ring++) {
    for (let dx = 0; dx <= ring; dx++) {
      for (let dz = 0; dz <= ring; dz++) {
        if (Math.max(dx, dz) !== ring) continue;
        const gx = edge - dx, gz = -edge + dz;
        if (isWallCell(gx, gz)) continue;
        if (tileTypes.has(gx + ',' + gz)) continue;
        SPAWN_POS.x = gx * TILE_SIZE;
        SPAWN_POS.z = gz * TILE_SIZE;
        break outer;
      }
    }
  }
}
export let MOB_CAP = 56;
export const VIEW_RADIUS = 110;
export const PLAYER_BODY_DAMAGE = 10;
export const HIT_COOLDOWN = 0.45;
export const EQUAL_RARITY_DROP_BASE = 0.64;
export const DROP_DAMAGE_FRAC = 0.1;
export const MIN_LOOTERS = 10;
export const SPAWN_IMMUNITY = 3;

export function clampToArena(pos, margin = 0) {
  const half = ARENA_HALF - margin;
  pos.x = Math.max(-half, Math.min(half, pos.x));
  pos.z = Math.max(-half, Math.min(half, pos.z));
}

const RARITY_DEPTH_BIAS = 2.0;
export function pickRarity(rng = Math.random, depth = 0) {
  const weights = RARITIES.map((r, i) => r.weight * RARITY_DEPTH_BIAS ** (i * depth));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return 0;
}

export function pickDrop(mobType, rng = Math.random) {
  const dropSlots = MOB_TYPES[mobType].dropSlots || MOB_TYPES[mobType].drops;
  // Handle old drops format for backward compatibility
  if (!Array.isArray(dropSlots) || !Array.isArray(dropSlots[0])) {
    const drops = dropSlots;
    const total = drops.reduce((s, [, w]) => s + w, 0);
    let roll = rng() * total;
    for (const [type, w] of drops) {
      roll -= w;
      if (roll <= 0) return type;
    }
    return null;
  }
  
  // New dropSlots format: 5 slots, each with weighted drops
  const drops = [];
  for (const slot of dropSlots) {
    if (!slot || slot.length === 0) continue;
    const total = slot.reduce((s, [, w]) => s + w, 0);
    let roll = rng() * total;
    for (const [type, w] of slot) {
      roll -= w;
      if (roll <= 0) {
        if (type === 'nothing') continue; // Skip 'nothing' drops
        drops.push(type);
        break;
      }
    }
  }
  return drops.length > 0 ? drops : null;
}
