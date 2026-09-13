import { RARITIES } from '../shared/config.js';
import { MOB_TYPES } from '../shared/mobs.js';

// NOTE: this file must stay free of Node-only imports (no './db.js', no
// 'node:fs', etc). mobs.js and petals.js import it, and those are also
// bundled into the browser via server/worker.js (the offline/local-fallback
// game worker built by Vite for the client) — pulling in better-sqlite3 or
// node:url here breaks that build. Persistence lives in
// gameSettingsStore.js instead, which only server-only files (admin.js)
// import.

// Every mob type except the Assembler (a stationary utility singleton, never
// a boss/loot roll) and Queen Ant (which only spawns when ant holes die).
// This is the pool guaranteed-Ultra/Super spawns and Blood-Sacrifice-triggered
// spawns are drawn from.
export const SACRIFICE_MOB_TYPES = Object.keys(MOB_TYPES).filter((t) => t !== 'assembler' && t !== 'queen');

// Default drop rarity weights per mob rarity as specified:
// - special mob: (should not spawn naturally)
// - common mob: 100% common petal
// - unusual mob: 70% common, 30% unusual
// - rare mob: 20% common, 55% unusual, 25% rare
// - epic mob: 25% unusual, 55% rare, 20% epic
// - legendary mob: 30% rare, 60% epic, 10% legendary
// - mythic mob: 40% epic, 55% legendary, 5% mythic
// - ultra mob: 50% legendary, 48% mythic, 2% ultra
// - super mob: 91.9% mythic 8% ultra 0.1% super
function defaultDropRarityWeights() {
  return [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],           // Special mob: (should not spawn naturally)
    [0, 100, 0, 0, 0, 0, 0, 0, 0, 0],         // Common mob: 100% common
    [0, 70, 30, 0, 0, 0, 0, 0, 0, 0],        // Unusual mob: 70% common, 30% unusual
    [0, 20, 55, 25, 0, 0, 0, 0, 0, 0],       // Rare mob: 20% common, 55% unusual, 25% rare
    [0, 0, 25, 55, 20, 0, 0, 0, 0, 0],       // Epic mob: 25% unusual, 55% rare, 20% epic
    [0, 0, 0, 30, 60, 10, 0, 0, 0, 0],       // Legendary mob: 30% rare, 60% epic, 10% legendary
    [0, 0, 0, 0, 40, 55, 5, 0, 0, 0],       // Mythic mob: 40% epic, 55% legendary, 5% mythic
    [0, 0, 0, 0, 0, 50, 48, 2, 0, 0],       // Ultra mob: 50% legendary, 48% mythic, 2% ultra
    [0, 0, 0, 0, 0, 0, 91.9, 8, 0.1, 0],   // Super mob: 91.9% mythic, 8% ultra, 0.1% super
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],          // Eternal mob: special case (99% Ultra, 1% Super golden leaf)
  ];
}

const DEFAULTS = {
  // Per-mob-rarity drop table: dropRarityWeights[mobRarity] is an array of
  // relative weights, one per possible drop rarity (same indices as
  // RARITIES). A kill rolls a drop rarity by picking randomly among the
  // weights in its row, proportional to their size (a weight of 0 means
  // that rarity never drops). Rows are NOT required to sum to any
  // particular total — only the ratios between weights in a row matter.
  // e.g. dropRarityWeights[0] = [9, 1, 0, 0, ...] means a Common mob (row 0)
  // drops Common 90% of the time and Unusual 10% of the time.
  // Only rows for Common..Ultra are used; Super/Eternal mobs keep their own
  // special-cased drop logic (see mobs.js Mob.die()).
  dropRarityWeights: defaultDropRarityWeights(),
  // Per-mob-type weight used when picking which mob type spawns as a
  // guaranteed/triggered boss (Blood Sacrifice, and the periodic guaranteed
  // Ultra/Super timers). Higher = more likely to be picked; 0 = never.
  sacrificeSpawnWeights: Object.fromEntries(SACRIFICE_MOB_TYPES.map((t) => [t, 1])),
  // Chance [0..1], rolled per eligible participant on every mob kill of any
  // rarity, of an extra Special-rarity Blood Sacrifice drop (on top of the
  // mob's normal drop).
  bloodSacrificeDropChance: 0.001,
  // Reload-time reduction granted per Golden Leaf rarity tier (Common = 0,
  // Unusual = 1, ...), stacking across multiple equipped Golden Leafs.
  // 0.03 = 3% less reload per tier (capped at 90% total, see petals.js).
  goldenLeafPercentPerRarity: 0.03,
  // Base damage bonus Privet grants to Iris/Pincer when Privet's rarity
  // equals the boosted petal's rarity. Falls off by half per rarity tier
  // of difference (see getPrivetMultiplier in petals.js). 0.25 = +25%.
  privetBasePercent: 0.25,
  // Guaranteed periodic spawns, in seconds. 0 disables that timer entirely.
  ultraSpawnIntervalSec: 1800, // 30 minutes
  superSpawnIntervalSec: 21600, // 6 hours
};

// A single live, mutable object, seeded with defaults. Other modules import
// `settings` and read fields off it at use-time (never destructure at
// import-time) so admin edits — and the persisted values gameSettingsStore.js
// loads in over these defaults at server boot — take effect immediately.
export const settings = {
  ...DEFAULTS,
  dropRarityWeights: DEFAULTS.dropRarityWeights.map((row) => row.slice()),
  sacrificeSpawnWeights: { ...DEFAULTS.sacrificeSpawnWeights },
};

// Log drop rarity weights at module load for debugging
console.log('[DROP WEIGHTS] Current drop rarity weights:');
settings.dropRarityWeights.forEach((weights, mobRarity) => {
  const total = weights.reduce((sum, w) => sum + (Number.isFinite(w) && w > 0 ? w : 0), 0);
  const activeWeights = weights.map((w, i) => `${RARITIES[i].name}:${w}`).filter(w => w.includes(':') && !w.endsWith(':0')).join(', ');
  console.log(`  ${RARITIES[mobRarity].name} mob: total=${total}, active=[${activeWeights || 'none'}]`);
});

// Picks a rarity index by weighted random choice among `weights` (one weight
// per rarity index, non-negative, need not sum to 1). Falls back to
// the default drop rarity weights for the given mob rarity if the row is
// missing or every weight in it is 0.
export function pickWeightedRarity(weights, mobRarityIdx = 0) {
  if (!Array.isArray(weights)) {
    // Fallback to default weights for this mob rarity
    const defaultWeights = DEFAULTS.dropRarityWeights[mobRarityIdx];
    if (Array.isArray(defaultWeights)) weights = defaultWeights;
    else return mobRarityIdx;
  }
  let total = 0;
  for (const w of weights) if (Number.isFinite(w) && w > 0) total += w;
  if (total <= 0) {
    // Fallback to default weights for this mob rarity
    const defaultWeights = DEFAULTS.dropRarityWeights[mobRarityIdx];
    if (Array.isArray(defaultWeights)) weights = defaultWeights;
    else return mobRarityIdx;
    // Recalculate total with default weights
    total = 0;
    for (const w of weights) if (Number.isFinite(w) && w > 0) total += w;
    if (total <= 0) return mobRarityIdx;
  }
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (!Number.isFinite(w) || w <= 0) continue;
    if (roll < w) return i;
    roll -= w;
  }
  return mobRarityIdx;
}

// Optional hook a server-only module (gameSettingsStore.js) can register to
// be notified whenever settings change, so it can persist them. Left unset,
// patchSettings() still updates `settings` in memory as normal.
let onChange = null;
export function setPersistHook(fn) { onChange = fn; }

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Validates and applies a partial patch (as sent from the admin panel).
// Unknown/invalid fields are ignored rather than throwing, so a bad value
// in one field never blocks the rest of the update. Returns the full,
// current settings object.
export function patchSettings(patch) {
  if (!patch || typeof patch !== 'object') return settings;

  if (Array.isArray(patch.dropRarityWeights)) {
    settings.dropRarityWeights = settings.dropRarityWeights.map((row, i) => {
      const patchRow = patch.dropRarityWeights[i];
      if (!Array.isArray(patchRow)) return row;
      return row.map((cur, j) => {
        const v = Number(patchRow[j]);
        return Number.isFinite(v) && v >= 0 ? v : cur;
      });
    });
  }

  if (patch.sacrificeSpawnWeights && typeof patch.sacrificeSpawnWeights === 'object') {
    for (const type of SACRIFICE_MOB_TYPES) {
      if (patch.sacrificeSpawnWeights[type] === undefined) continue;
      const v = Number(patch.sacrificeSpawnWeights[type]);
      if (Number.isFinite(v) && v >= 0) settings.sacrificeSpawnWeights[type] = v;
    }
  }

  if (patch.bloodSacrificeDropChance !== undefined) {
    const v = Number(patch.bloodSacrificeDropChance);
    if (Number.isFinite(v)) settings.bloodSacrificeDropChance = clamp01(v);
  }

  if (patch.goldenLeafPercentPerRarity !== undefined) {
    const v = Number(patch.goldenLeafPercentPerRarity);
    if (Number.isFinite(v)) settings.goldenLeafPercentPerRarity = Math.max(0, v);
  }

  if (patch.privetBasePercent !== undefined) {
    const v = Number(patch.privetBasePercent);
    if (Number.isFinite(v)) settings.privetBasePercent = Math.max(0, v);
  }

  if (patch.ultraSpawnIntervalSec !== undefined) {
    const v = Number(patch.ultraSpawnIntervalSec);
    if (Number.isFinite(v) && v >= 0) settings.ultraSpawnIntervalSec = v;
  }

  if (patch.superSpawnIntervalSec !== undefined) {
    const v = Number(patch.superSpawnIntervalSec);
    if (Number.isFinite(v) && v >= 0) settings.superSpawnIntervalSec = v;
  }

  onChange?.(settings);
  return settings;
}