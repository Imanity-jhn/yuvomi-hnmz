/**
 * Geraetelokale Darstellung der Wandflaeche (#915).
 *
 * Der Wand-Modus selbst ist ein Schalter. WAS auf der Flaeche steht - Bloecke,
 * Dichte, Nacht, Screensaver - gehoert daneben, nicht in die haushaltweite
 * Widget-Konfiguration: ein geteiltes Konto wuerde sonst jedem Handy dieselben
 * Bloecke abdrehen.
 *
 * Dieselbe Aufnahmeregel wie der Kuechentimer (utils/wall-mode.js): kein
 * Navigieren (ausser dem Display-Abhaken, das eine eigene Allowlist hat),
 * localStorage, grosse Ziele.
 *
 * Die Default-Nachtstunden sind dieselben Literale wie WALL_NIGHT_FROM/TO in
 * wall-mode.js (22/6). wall-prefs importiert wall-mode bewusst nicht: der
 * Nachtmodus liest HIERHER, ein Ringimport waere die naechste Drift.
 */

const PREFS_KEY = 'yuvomi-wall-prefs';
const WHO_FILTER_KEY = 'yuvomi-wall-who-filter';

export const WALL_SURFACES = Object.freeze(['classic', 'routine']);
export const WALL_ROW_CAP_DEFAULT = 4;
export const WALL_ROW_CAP_OPTIONS = Object.freeze([3, 4, 6]);
export const WALL_IDLE_OPTIONS = Object.freeze([120, 300, 600, 900]);
export const WALL_NIGHT_PRESETS = Object.freeze([
  Object.freeze({ from: 21, to: 6 }),
  Object.freeze({ from: 22, to: 6 }),
  Object.freeze({ from: 23, to: 7 }),
  Object.freeze({ from: null, to: null }),
]);

/** Reihenfolge auf der Flaeche: Programm links, der Rest im Nebenraum. */
export const WALL_BLOCK_IDS = Object.freeze([
  'program', 'who', 'events', 'meals', 'schedule', 'waste', 'dates', 'weather', 'timer',
]);

export const WALL_PRESETS = Object.freeze({
  hallway: Object.freeze(['program', 'who', 'events', 'weather', 'timer']),
  kitchen: Object.freeze(['program', 'meals', 'waste', 'dates', 'timer']),
});

/** Altes Couloir ohne Termine - wird auf das aktuelle Preset angehoben. */
const LEGACY_HALLWAY = Object.freeze(['program', 'who', 'weather', 'timer']);

export const DEFAULT_WALL_PREFS = Object.freeze({
  blocks: WALL_PRESETS.hallway,
  showWho: true,
  showWeather: true,
  showTimer: true,
  showEvents: true,
  showMeals: false,
  showSchedule: false,
  showWaste: false,
  showDates: false,
  rowCap: WALL_ROW_CAP_DEFAULT,
  nightFrom: 22,
  nightTo: 6,
  screensaverIdleSec: 300,
  surface: 'classic',
});

const FLAG_TO_BLOCK = Object.freeze({
  showWho: 'who',
  showEvents: 'events',
  showWeather: 'weather',
  showTimer: 'timer',
  showMeals: 'meals',
  showSchedule: 'schedule',
  showWaste: 'waste',
  showDates: 'dates',
});

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch { /* Privatmodus/Quota */ }
}

function safeRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch { /* siehe safeGet */ }
}

function normalizeSurface(value) {
  return WALL_SURFACES.includes(value) ? value : DEFAULT_WALL_PREFS.surface;
}

function clampInt(value, allowed, fallback) {
  const n = Number(value);
  return allowed.includes(n) ? n : fallback;
}

function nightHour(value, fallback) {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 23) return fallback;
  return n;
}

function normalizeBlocks(list) {
  const set = new Set(
    (Array.isArray(list) ? list : [])
      .map(String)
      .filter((id) => WALL_BLOCK_IDS.includes(id)),
  );
  set.add('program');
  return WALL_BLOCK_IDS.filter((id) => set.has(id));
}

function blocksFromLegacy(parsed) {
  const set = new Set(['program']);
  if (parsed.showWho !== false) set.add('who');
  if (parsed.showEvents !== false) set.add('events');
  if (parsed.showWeather !== false) set.add('weather');
  if (parsed.showTimer !== false) set.add('timer');
  return WALL_BLOCK_IDS.filter((id) => set.has(id));
}

function flagsFromBlocks(blocks) {
  return {
    showWho: blocks.includes('who'),
    showEvents: blocks.includes('events'),
    showWeather: blocks.includes('weather'),
    showTimer: blocks.includes('timer'),
    showMeals: blocks.includes('meals'),
    showSchedule: blocks.includes('schedule'),
    showWaste: blocks.includes('waste'),
    showDates: blocks.includes('dates'),
  };
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((id) => other.has(id));
}

/** Liest die Darstellung dieses Geraets. Unlesbares faellt auf die Defaults. */
export function readWallPrefs() {
  const raw = safeGet(globalThis.localStorage, PREFS_KEY);
  if (!raw) return { ...DEFAULT_WALL_PREFS, blocks: [...DEFAULT_WALL_PREFS.blocks] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_WALL_PREFS, blocks: [...DEFAULT_WALL_PREFS.blocks] };
    }
    const nightOff = parsed.nightFrom === null && parsed.nightTo === null;
    const rawBlocks = Array.isArray(parsed.blocks)
      ? normalizeBlocks(parsed.blocks)
      : blocksFromLegacy(parsed);
    const blocks = sameSet(rawBlocks, LEGACY_HALLWAY)
      ? [...WALL_PRESETS.hallway]
      : rawBlocks;
    return {
      blocks,
      ...flagsFromBlocks(blocks),
      rowCap: clampInt(parsed.rowCap, WALL_ROW_CAP_OPTIONS, WALL_ROW_CAP_DEFAULT),
      nightFrom: nightOff ? null : nightHour(parsed.nightFrom, DEFAULT_WALL_PREFS.nightFrom),
      nightTo: nightOff ? null : nightHour(parsed.nightTo, DEFAULT_WALL_PREFS.nightTo),
      screensaverIdleSec: clampInt(
        parsed.screensaverIdleSec,
        WALL_IDLE_OPTIONS,
        DEFAULT_WALL_PREFS.screensaverIdleSec,
      ),
      surface: normalizeSurface(parsed.surface),
    };
  } catch {
    return { ...DEFAULT_WALL_PREFS, blocks: [...DEFAULT_WALL_PREFS.blocks] };
  }
}

/** Schreibt eine Teilaenderung und gibt den neuen Stand zurueck. */
export function writeWallPrefs(patch) {
  const current = readWallPrefs();
  let blocks = current.blocks;
  if (Array.isArray(patch.blocks)) {
    blocks = normalizeBlocks(patch.blocks);
  } else {
    const set = new Set(blocks);
    for (const [flag, id] of Object.entries(FLAG_TO_BLOCK)) {
      if (!Object.prototype.hasOwnProperty.call(patch, flag)) continue;
      if (patch[flag]) set.add(id);
      else set.delete(id);
    }
    blocks = normalizeBlocks([...set]);
  }
  const next = {
    ...current,
    ...patch,
    blocks,
    ...flagsFromBlocks(blocks),
  };
  safeSet(globalThis.localStorage, PREFS_KEY, JSON.stringify(next));
  applyWallPrefsToDocument(next);
  return next;
}

export function wallHasBlock(id, prefs = readWallPrefs()) {
  return prefs.blocks.includes(id);
}

export function wallPresetName(prefs = readWallPrefs()) {
  if (sameSet(prefs.blocks, WALL_PRESETS.hallway)) return 'hallway';
  if (sameSet(prefs.blocks, WALL_PRESETS.kitchen)) return 'kitchen';
  return 'custom';
}

export function applyWallPreset(name) {
  const blocks = WALL_PRESETS[name];
  if (!blocks) return readWallPrefs();
  return writeWallPrefs({ blocks: [...blocks] });
}

export function toggleWallBlock(id) {
  if (id === 'program' || !WALL_BLOCK_IDS.includes(id)) return readWallPrefs();
  const set = new Set(readWallPrefs().blocks);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return writeWallPrefs({ blocks: [...set] });
}

/**
 * Screensaver-Leerlauf an die Wurzel, damit photo-screensaver.js ihn liest
 * ohne das Prefs-Modul zu kennen (er laedt frueh, unabhaengig von der Wand).
 */
export function applyWallPrefsToDocument(prefs = readWallPrefs()) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  const ds = root.dataset ?? (root.dataset = {});
  ds.screensaverIdle = String(prefs.screensaverIdleSec);
}

/** Eine Zeile fuer den Screensaver: was als naechstes kommt. */
export function applyWallNextToDocument(text) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  const ds = root.dataset ?? (root.dataset = {});
  const line = String(text || '').trim();
  if (line) ds.wallNext = line;
  else delete ds.wallNext;
}

export function wallNightWindow(prefs = readWallPrefs()) {
  if (prefs.nightFrom == null || prefs.nightTo == null) return null;
  return { from: prefs.nightFrom, to: prefs.nightTo };
}

/** Wer-Filter: nur diese Sitzung, kein gespeichertes "nur Linda". */
export function readWallWhoFilter() {
  const raw = safeGet(globalThis.sessionStorage, WHO_FILTER_KEY);
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function writeWallWhoFilter(userId) {
  if (userId == null) safeRemove(globalThis.sessionStorage, WHO_FILTER_KEY);
  else safeSet(globalThis.sessionStorage, WHO_FILTER_KEY, String(userId));
}

export function toggleWallWhoFilter(userId) {
  const current = readWallWhoFilter();
  const next = current === Number(userId) ? null : Number(userId);
  writeWallWhoFilter(Number.isInteger(next) && next > 0 ? next : null);
  return readWallWhoFilter();
}
