/**
 * Modul: Darstellung der Wandflaeche, auf der Flaeche selbst (#915)
 * Zweck: Bloecke, Dichte, Nachtfenster und Screensaver-Leerlauf - grosse Ziele,
 *        localStorage, ohne die Route zu verlassen.
 * Abhaengigkeiten: /i18n.js, /utils/wall-prefs.js
 *
 * WARUM HIER UND NICHT NUR UNTER EINSTELLUNGEN. Ein gekoppeltes Display hat
 * keine Settings-Navigation. Wer die Wand nur dort einrichten koennte, koennte
 * sie auf dem Geraet, fuer das sie da ist, nicht einrichten.
 *
 * Aufnahmeregel (utils/wall-mode.js): (a) keine Route, (b) kein Server,
 * (c) dieses Geraet, (d) wenige grosse Ziele, kein Tastenfeld.
 */
import { t } from '../i18n.js';
import { esc } from '../utils/html.js';
import {
  readWallPrefs,
  writeWallPrefs,
  writeWallWhoFilter,
  applyWallPreset,
  toggleWallBlock,
  wallPresetName,
  WALL_ROW_CAP_OPTIONS,
  WALL_IDLE_OPTIONS,
  WALL_NIGHT_PRESETS,
} from '../utils/wall-prefs.js';
import { syncWallMode } from '../utils/wall-mode.js';

function chip(name, value, current, label) {
  const on = String(current) === String(value);
  return `<button type="button" class="wall-chip${on ? ' wall-chip--on' : ''}"
      data-wall-pref="${esc(name)}" data-wall-value="${esc(String(value))}"
      aria-pressed="${on ? 'true' : 'false'}">${esc(label)}</button>`;
}

function hourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function nightValue(preset) {
  return preset.from == null ? 'off' : `${preset.from}-${preset.to}`;
}

function nightCurrent(prefs) {
  return prefs.nightFrom == null ? 'off' : `${prefs.nightFrom}-${prefs.nightTo}`;
}

function densityLabel(cap) {
  if (cap === 3) return t('dashboard.wallDensityComfortable');
  if (cap === 6) return t('dashboard.wallDensityFull');
  return t('dashboard.wallDensityDefault');
}

function idleLabel(sec) {
  return t('dashboard.wallIdleMinutes', { count: Math.round(sec / 60) });
}

const OPTIONAL_BLOCKS = [
  ['who', 'dashboard.wallWho'],
  ['events', 'nav.calendar'],
  ['meals', 'dashboard.todayMeals'],
  ['schedule', 'nav.schedule'],
  ['waste', 'nav.waste'],
  ['dates', 'dashboard.countdownTitle'],
  ['weather', 'dashboard.weather'],
  ['timer', 'dashboard.wallTimerLabel'],
];

export function renderWallSetup(prefs = readWallPrefs()) {
  const night = nightCurrent(prefs);
  const open = isWallSetupFlag();
  const preset = wallPresetName(prefs);
  const surface = prefs.surface === 'routine' ? 'routine' : 'classic';
  return `
    <div class="wall-setup" id="wall-setup-panel"${open ? '' : ' hidden'}>
      <div class="wall-setup__sheet">
        <h2 class="wall-setup__title" id="wall-setup-title">${esc(t('dashboard.wallSetupTitle'))}</h2>
        <div class="wall-setup__block">
          <p class="wall-setup__label">${esc(t('dashboard.wallSurface'))}</p>
          <div class="wall-setup__chips">
            ${chip('surface', 'classic', surface, t('dashboard.wallSurfaceClassic'))}
            ${chip('surface', 'routine', surface, t('dashboard.wallSurfaceRoutine'))}
          </div>
        </div>
        <div class="wall-setup__block">
          <p class="wall-setup__label">${esc(t('dashboard.wallPreset'))}</p>
          <div class="wall-setup__chips">
            ${chip('preset', 'hallway', preset, t('dashboard.wallPresetHallway'))}
            ${chip('preset', 'kitchen', preset, t('dashboard.wallPresetKitchen'))}
          </div>
        </div>
        <div class="wall-setup__block">
          <p class="wall-setup__label">${esc(t('dashboard.wallBlocks'))}</p>
          <div class="wall-setup__chips">
            ${OPTIONAL_BLOCKS.map(([id, key]) => chip(
              'block',
              id,
              prefs.blocks.includes(id) ? id : '',
              t(key),
            )).join('')}
          </div>
        </div>
        <div class="wall-setup__block">
          <p class="wall-setup__label">${esc(t('dashboard.wallDensity'))}</p>
          <div class="wall-setup__chips">
            ${WALL_ROW_CAP_OPTIONS.map((cap) => chip('rowCap', cap, prefs.rowCap, densityLabel(cap))).join('')}
          </div>
        </div>
        <div class="wall-setup__block">
          <p class="wall-setup__label">${esc(t('dashboard.wallNight'))}</p>
          <div class="wall-setup__chips">
            ${WALL_NIGHT_PRESETS.map((presetNight) => chip(
              'night',
              nightValue(presetNight),
              night,
              presetNight.from == null
                ? t('dashboard.wallNightOff')
                : t('dashboard.wallNightPreset', { from: hourLabel(presetNight.from), to: hourLabel(presetNight.to) }),
            )).join('')}
          </div>
        </div>
        <div class="wall-setup__block">
          <p class="wall-setup__label">${esc(t('dashboard.wallIdle'))}</p>
          <div class="wall-setup__chips">
            ${WALL_IDLE_OPTIONS.map((sec) => chip('idle', sec, prefs.screensaverIdleSec, idleLabel(sec))).join('')}
          </div>
        </div>
        <button type="button" class="wall-setup__done" id="wall-setup-done">${esc(t('dashboard.wallSetupDone'))}</button>
      </div>
    </div>`;
}

const SETUP_KEY = 'yuvomi-wall-setup';

export function isWallSetupFlag() {
  try {
    return sessionStorage.getItem(SETUP_KEY) === '1';
  } catch {
    return false;
  }
}

export function isWallSetupOpen(wall) {
  return Boolean(wall?.hasAttribute('data-wall-setup')) || isWallSetupFlag();
}

export function setWallSetupOpen(wall, open) {
  try {
    if (open) sessionStorage.setItem(SETUP_KEY, '1');
    else sessionStorage.removeItem(SETUP_KEY);
  } catch { /* Privatmodus */ }
  if (!wall) return;
  wall.toggleAttribute('data-wall-setup', open);
  if (open) wall.setAttribute('data-wall-awake', '');
  const panel = wall.querySelector('#wall-setup-panel');
  if (panel) panel.hidden = !open;
}

function applyChip(name, value) {
  if (name === 'surface') {
    writeWallPrefs({ surface: value });
    syncWallMode(location.pathname);
    return;
  }
  if (name === 'preset') {
    applyWallPreset(value);
    if (value !== 'hallway') writeWallWhoFilter(null);
    syncWallMode(location.pathname);
    return;
  }
  if (name === 'block') {
    const next = toggleWallBlock(value);
    if (value === 'who' && !next.showWho) writeWallWhoFilter(null);
    syncWallMode(location.pathname);
    return;
  }
  if (name === 'rowCap') {
    writeWallPrefs({ rowCap: Number(value) });
    return;
  }
  if (name === 'idle') {
    writeWallPrefs({ screensaverIdleSec: Number(value) });
    return;
  }
  if (name === 'night') {
    if (value === 'off') writeWallPrefs({ nightFrom: null, nightTo: null });
    else {
      const [from, to] = String(value).split('-').map(Number);
      writeWallPrefs({ nightFrom: from, nightTo: to });
    }
    syncWallMode(location.pathname);
  }
}

export function wireWallSetup(wall, rerender, signal) {
  if (!wall) return;
  wall.addEventListener('click', (event) => {
    const done = event.target.closest('#wall-setup-done');
    if (done) {
      setWallSetupOpen(wall, false);
      return;
    }
    const openBtn = event.target.closest('#wall-setup');
    if (openBtn) {
      setWallSetupOpen(wall, true);
      wall.setAttribute('data-wall-awake', '');
      return;
    }
    const chipBtn = event.target.closest('[data-wall-pref]');
    if (!chipBtn || !wall.contains(chipBtn)) return;
    applyChip(chipBtn.dataset.wallPref, chipBtn.dataset.wallValue);
    rerender();
  }, { signal });
}
