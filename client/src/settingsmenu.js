import {
  SENS_MIN, SENS_DEFAULT, SENS_MAX, getSensitivity, setSensitivity,
  FOV_MIN, FOV_DEFAULT, FOV_MAX, getFov, setFov,
} from './settings.js';

// How close (in slider travel, 0..1) you must drag to the centre before it
// snaps to the default. Small enough that it doesn't grab from far away.
const SNAP = 0.02;
const lerp = (a, b, t) => a + (b - a) * t;

// The slider position (t, 0..1) maps to the value with the default pinned to
// the exact centre (t=0.5): the lower half lerps min→default, the upper half
// default→max. So the ranges either side of default can differ (e.g. 0.2→1
// vs 1→3) while the handle still rests dead-centre at the default.
const valueFromT = (t, min, def, max) =>
  (t < 0.5 ? lerp(min, def, t / 0.5) : lerp(def, max, (t - 0.5) / 0.5));
const tFromValue = (v, min, def, max) =>
  (v < def ? (v - min) / (def - min) * 0.5 : 0.5 + (v - def) / (max - def) * 0.5);

function setupSlider({ slider, readout, min, def, max, get, set, format }) {
  const render = (v) => { readout.textContent = format(v); };
  slider.value = tFromValue(get(), min, def, max);
  render(get());

  slider.addEventListener('input', () => {
    let t = parseFloat(slider.value);
    if (Math.abs(t - 0.5) < SNAP) { t = 0.5; slider.value = '0.5'; } // magnetic centre
    const v = valueFromT(t, min, def, max);
    set(v);
    render(v);
  });
  // Double-click the handle to jump straight back to the default.
  slider.addEventListener('dblclick', () => {
    slider.value = '0.5';
    set(def);
    render(def);
  });
}

const HELP_HIDDEN_KEY = 'florr3d-help-hidden';

export function initSettingsMenu() {
  const btn = document.getElementById('settingsBtn');
  const panel = document.getElementById('settingsPanel');
  btn.addEventListener('click', () => panel.classList.toggle('hidden'));
  // Click anywhere outside closes it (the gear itself toggles, so ignore it).
  document.addEventListener('mousedown', (e) => {
    if (panel.classList.contains('hidden')) return;
    if (!panel.contains(e.target) && !btn.contains(e.target)) panel.classList.add('hidden');
  });

  // Mirror the corner controls list into the panel (single source of truth)
  // so it's still reachable after the newcomer dismisses the floating one.
  const help = document.getElementById('help');
  const helpList = document.getElementById('helpList');
  const controls = document.getElementById('settingsControls');
  if (helpList && controls) controls.innerHTML = helpList.innerHTML;

  // The floating controls list starts visible for newcomers; once dismissed,
  // the choice is remembered so it stays hidden on future visits.
  let helpHidden = false;
  try { helpHidden = localStorage.getItem(HELP_HIDDEN_KEY) === '1'; } catch {}
  if (helpHidden) help.classList.add('hidden');
  document.getElementById('helpClose').addEventListener('click', () => {
    help.classList.add('hidden');
    try { localStorage.setItem(HELP_HIDDEN_KEY, '1'); } catch {}
  });

  setupSlider({
    slider: document.getElementById('sensSlider'),
    readout: document.getElementById('sensVal'),
    min: SENS_MIN, def: SENS_DEFAULT, max: SENS_MAX,
    get: getSensitivity, set: setSensitivity,
    format: (v) => `${v.toFixed(2)}×`,
  });
  setupSlider({
    slider: document.getElementById('fovSlider'),
    readout: document.getElementById('fovVal'),
    min: FOV_MIN, def: FOV_DEFAULT, max: FOV_MAX,
    get: getFov, set: setFov,
    format: (v) => `${Math.round(v)}°`,
  });
}
