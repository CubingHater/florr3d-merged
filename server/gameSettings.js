import { RARITIES, MOB_TYPES } from '../shared/config.js';

// NOTE: this file must stay free of Node-only imports (no './db.js', no
// 'node:fs', etc). mobs.js and petals.js import it, and those are also
// bundled into the browser via server/worker.js (the offline/local-fallback
// game worker built by Vite for the client) — pulling in better-sqlite3 or
// node:url here breaks that build. Persistence lives in
// gameSettingsStore.js instead, which only server-only files (admin.js)
// import.

// Every mob type except the Assembler (a stationary utility singleton, never
// a boss/loot roll). This is the pool guaranteed-Ultra/Super spawns and
// Blood-Sacrifice-triggered spawns are drawn from.
export const SACRIFICE_MOB_TYPES = Object.keys(MOB_TYPES).filter((t) => t !== 'assembler');

// Default drop rarity weights per mob rarity as specified:
// - common mob: 100% common petal
// - unusual mob: 70% unusual 30% common
// - rare mob: 70% rare 30% unusual
// - epic mob: 50% epic 50% rare
// - legendary mob: 40% legendary 60% epic
// - mythic mob: 20% mythic 80% legendary
// - ultra mob: 15% legendary 75% mythic 10% ultra
// - super mob: 60% mythic 39,9% ultra 0,1% super
function defaultDropRarityWeights() {
  return [
    [100, 0, 0, 0, 0, 0, 0, 0, 0],      // Common mob: 100% common
    [30, 70, 0, 0, 0, 0, 0, 0, 0],     // Unusual mob: 30% common, 70% unusual
    [0, 30, 70, 0, 0, 0, 0, 0, 0],     // Rare mob: 30% unusual, 70% rare
    [0, 0, 50, 50, 0, 0, 0, 0, 0],     // Epic mob: 50% rare, 50% epic
    [0, 0, 0, 60, 40, 0, 0, 0, 0],     // Legendary mob: 60% epic, 40% legendary
    [0, 0, 0, 0, 80, 20, 0, 0, 0],     // Mythic mob: 80% legendary, 20% mythic
    [0, 0, 0, 0, 15, 75, 10, 0, 0],    // Ultra mob: 15% legendary, 75% mythic, 10% ultra
    [0, 0, 0, 0, 0, 60, 39.9, 0.1, 0], // Super mob: 60% mythic, 39.9% ultra, 0.1% super
    [0, 0, 0, 0, 0, 0, 0, 0, 0],       // Eternal mob: special case (always golden leaf)
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
  // rarity, of an extra Super-rarity Blood Sacrifice drop (on top of the
  // mob's normal drop).
  bloodSacrificeDropChance: 0.001,
  // Reload-time reduction granted per Golden Leaf rarity tier (Common = 0,
  // Unusual = 1, ...), stacking across multiple equipped Golden Leafs.
  // 0.05 = 5% less reload per tier (capped at 90% total, see petals.js).
  goldenLeafPercentPerRarity: 0.05,
  // Base damage bonus Privet grants to Iris/Pincer when Privet's rarity
  // equals the boosted petal's rarity. Falls off by half per rarity tier
  // of difference (see getPrivetMultiplier in petals.js). 0.25 = +25%.
  privetBasePercent: 0.25,
  // Guaranteed periodic spawns, in seconds. 0 disables that timer entirely.
  ultraSpawnIntervalSec: 180,
  superSpawnIntervalSec: 3000,
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

// Picks a rarity index by weighted random choice among `weights` (one weight
// per rarity index, non-negative, need not sum to 1). Falls back to
// `fallbackIdx` if the row is missing or every weight in it is 0.
export function pickWeightedRarity(weights, fallbackIdx = 0) {
  if (!Array.isArray(weights)) return fallbackIdx;
  let total = 0;
  for (const w of weights) if (Number.isFinite(w) && w > 0) total += w;
  if (total <= 0) return fallbackIdx;
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (!Number.isFinite(w) || w <= 0) continue;
    if (roll < w) return i;
    roll -= w;
  }
  return fallbackIdx;
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