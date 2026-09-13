const QUALITY_KEY = 'florr3d-quality';
const SENS_KEY = 'florr3d-sensitivity';
const FOV_KEY = 'florr3d-fov';

// Mouse-look sensitivity is stored as a multiplier on the base sensitivity.
// The slider centres on 1x (the game default) and runs from 0.2x to 3x.
export const SENS_MIN = 0.2;
export const SENS_DEFAULT = 1;
export const SENS_MAX = 3;

// First-person field of view in degrees. Centres on the game default (75),
// can be narrowed a bit or widened up to 90.
export const FOV_MIN = 60;
export const FOV_DEFAULT = 75;
export const FOV_MAX = 90;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function loadNum(key, def, lo, hi) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? clamp(v, lo, hi) : def;
  } catch { return def; }
}

// Cached so the hot paths (mousemove, per-frame camera) never touch
// localStorage — setters keep the cache and storage in sync.
let sensMult = loadNum(SENS_KEY, SENS_DEFAULT, SENS_MIN, SENS_MAX);
let fov = loadNum(FOV_KEY, FOV_DEFAULT, FOV_MIN, FOV_MAX);

export const getSensitivity = () => sensMult;
export function setSensitivity(m) {
  sensMult = clamp(m, SENS_MIN, SENS_MAX);
  try { localStorage.setItem(SENS_KEY, sensMult); } catch {}
}

export const getFov = () => fov;
export function setFov(v) {
  fov = clamp(v, FOV_MIN, FOV_MAX);
  try { localStorage.setItem(FOV_KEY, fov); } catch {}
}

const ULTRA_ENABLED = false;

const LEVELS = ULTRA_ENABLED ? ['low', 'high', 'ultra'] : ['low', 'high'];
const LABELS = { low: 'Low', high: 'High', ultra: 'Ultra Realistic' };

export function getQuality() {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    return LEVELS.includes(q) ? q : 'high';
  } catch {
    return 'high';
  }
}

export function setQuality(q) {
  try { localStorage.setItem(QUALITY_KEY, q); } catch {}
}

export function initQualityToggle() {
  const el = document.getElementById('quality');
  el.textContent = `Quality: ${LABELS[getQuality()]}`;
  el.onclick = () => {
    const next = LEVELS[(LEVELS.indexOf(getQuality()) + 1) % LEVELS.length];
    setQuality(next);
    location.reload();
  };
}
