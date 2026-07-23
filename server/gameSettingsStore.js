import { RARITIES } from '../shared/config.js';
import { getSetting, setSetting } from './db.js';
import { settings, SACRIFICE_MOB_TYPES, setPersistHook } from './gameSettings.js';

const SETTINGS_KEY = 'gameplay';

// Merges any previously-saved values from the database over the live
// `settings` singleton's defaults, in place — so every module already
// holding a reference to `settings` sees the persisted values too.
function loadPersisted() {
  const stored = getSetting(SETTINGS_KEY);
  if (!stored || typeof stored !== 'object') return;

  // Handle new dropRarityWeights format (per-mob-rarity weight distribution)
  if (Array.isArray(stored.dropRarityWeights) && stored.dropRarityWeights.length === RARITIES.length) {
    settings.dropRarityWeights = settings.dropRarityWeights.map((row, i) => {
      const storedRow = stored.dropRarityWeights[i];
      if (!Array.isArray(storedRow) || storedRow.length !== RARITIES.length) return row;
      return row.map((cur, j) => {
        const v = Number(storedRow[j]);
        return Number.isFinite(v) && v >= 0 ? v : cur;
      });
    });
  }

  // Legacy: handle old dropUpgradeChance format for backward compatibility
  if (Array.isArray(stored.dropUpgradeChance) && stored.dropUpgradeChance.length === RARITIES.length) {
    settings.dropUpgradeChance = stored.dropUpgradeChance.map((v, i) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : settings.dropUpgradeChance[i];
    });
  }

  if (stored.sacrificeSpawnWeights && typeof stored.sacrificeSpawnWeights === 'object') {
    for (const type of SACRIFICE_MOB_TYPES) {
      const v = Number(stored.sacrificeSpawnWeights[type]);
      if (Number.isFinite(v) && v >= 0) settings.sacrificeSpawnWeights[type] = v;
    }
  }

  for (const key of ['bloodSacrificeDropChance', 'goldenLeafPercentPerRarity', 'privetBasePercent', 'ultraSpawnIntervalSec', 'superSpawnIntervalSec']) {
    const v = Number(stored[key]);
    if (Number.isFinite(v) && v >= 0) settings[key] = v;
  }
}

loadPersisted();
setPersistHook((current) => setSetting(SETTINGS_KEY, current));
