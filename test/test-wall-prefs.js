/**
 * Modul: Guard - Darstellung der Wandflaeche (#915)
 * Zweck: Bloecke, Dichte, Nachtfenster, Screensaver-Leerlauf und Wer-Filter
 *        bleiben geraetelokal und erfuellen die Aufnahmeregel aus wall-mode.js:
 *          (a) navigiert nicht, (b) aendert nichts am Haushalt,
 *          (c) bleibt auf diesem Geraet, (d) ist aus zwei Metern bedienbar.
 * Ausfuehren: npm run test:wall-prefs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
const session = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
global.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => session.set(k, String(v)),
  removeItem: (k) => session.delete(k),
};
global.document = { documentElement: { dataset: {} } };

const {
  readWallPrefs, writeWallPrefs, DEFAULT_WALL_PREFS, WALL_ROW_CAP_OPTIONS,
  WALL_IDLE_OPTIONS, WALL_PRESETS, wallNightWindow, toggleWallWhoFilter,
  readWallWhoFilter, applyWallPrefsToDocument, applyWallNextToDocument,
  applyWallPreset, wallPresetName, wallHasBlock, toggleWallBlock,
} = await import('../public/utils/wall-prefs.js');
const { renderWallSetup } = await import('../public/components/wall-setup.js');
const { isWallNight } = await import('../public/utils/wall-mode.js');

const PREFS_SRC = readFileSync(new URL('../public/utils/wall-prefs.js', import.meta.url), 'utf8');
const SETUP_SRC = readFileSync(new URL('../public/components/wall-setup.js', import.meta.url), 'utf8');
const DASH = readFileSync(new URL('../public/pages/dashboard.js', import.meta.url), 'utf8');
const PAIR = readFileSync(new URL('../public/pages/pair-display.js', import.meta.url), 'utf8');
const APPEARANCE = readFileSync(new URL('../public/settings/pages/personal-appearance.js', import.meta.url), 'utf8');
const SCREENSAVER = readFileSync(new URL('../public/components/photo-screensaver.js', import.meta.url), 'utf8');

test.beforeEach(() => {
  store.clear();
  session.clear();
  global.document.documentElement.dataset = {};
});

test('ohne Eintrag gelten die Defaults - vier Zeilen, Nacht 22-6, Screensaver 5 min', () => {
  assert.deepEqual(readWallPrefs(), { ...DEFAULT_WALL_PREFS });
  assert.deepEqual(wallNightWindow(), { from: 22, to: 6 });
});

test('eine Teilaenderung bleibt, Unlesbares faellt zurueck', () => {
  writeWallPrefs({ rowCap: 6, showWeather: false, screensaverIdleSec: 120 });
  assert.equal(readWallPrefs().rowCap, 6);
  assert.equal(readWallPrefs().showWeather, false);
  assert.equal(readWallPrefs().showWho, true);
  assert.equal(readWallPrefs().screensaverIdleSec, 120);

  global.localStorage.setItem('yuvomi-wall-prefs', '{nicht json');
  assert.equal(readWallPrefs().rowCap, DEFAULT_WALL_PREFS.rowCap);

  writeWallPrefs({ rowCap: 99, screensaverIdleSec: 7 });
  assert.ok(WALL_ROW_CAP_OPTIONS.includes(readWallPrefs().rowCap));
  assert.ok(WALL_IDLE_OPTIONS.includes(readWallPrefs().screensaverIdleSec));
});

test('Nacht aus schaltet das Fenster, isWallNight bleibt dann falsch', () => {
  writeWallPrefs({ nightFrom: null, nightTo: null });
  assert.equal(wallNightWindow(), null);
  assert.equal(isWallNight(new Date(2026, 7, 11, 23, 0)), false);
});

test('Wer-Filter ist sitzungslokal und umschaltbar', () => {
  assert.equal(readWallWhoFilter(), null);
  assert.equal(toggleWallWhoFilter(7), 7);
  assert.equal(toggleWallWhoFilter(7), null);
  assert.equal(toggleWallWhoFilter(3), 3);
});

test('der Screensaver-Leerlauf steht an der Wurzel, und photo-screensaver liest ihn jedes Mal', () => {
  writeWallPrefs({ screensaverIdleSec: 900 });
  applyWallPrefsToDocument();
  assert.equal(global.document.documentElement.dataset.screensaverIdle, '900');
  assert.match(SCREENSAVER, /function idleMs\(\)/);
  assert.match(SCREENSAVER, /dataset\.screensaverIdle/);
});

test('(a) Setup navigiert nicht - kein Link, keine Route, kein Modal', () => {
  const html = renderWallSetup();
  assert.match(html, /id="wall-setup-panel"/, 'Reichweite: das Blatt wurde gebaut');
  assert.ok(!/<a\b|href=|data-route=|data-modal|openModal/.test(html),
    'ein Chip auf der Wand darf die Flaeche nicht verlassen');
});

test('(b) Prefs und Setup kennen die API nicht', () => {
  for (const src of [PREFS_SRC, SETUP_SRC]) {
    assert.ok(!/from '.*\/api\.js'|api\.(get|post|put|patch|delete)\(|fetch\(/.test(src),
      'ein Server-Aufruf waere ein Zustand, der auf einem zweiten Geraet ankommt');
  }
});

test('(c) Prefs liegen in localStorage, der Wer-Filter in der Sitzung', () => {
  assert.match(PREFS_SRC, /localStorage/, 'die Darstellung bleibt geraetelokal');
  assert.match(PREFS_SRC, /sessionStorage/, 'der Filter darf die naechste Sitzung nicht ueberleben');
  assert.ok(!/document\.cookie/.test(PREFS_SRC), 'und nirgends sonst');
});

test('(d) Setup ist aus zwei Metern bedienbar - Chips, kein Tastenfeld', () => {
  const html = renderWallSetup();
  const knoepfe = html.match(/<button/g) ?? [];
  assert.ok(knoepfe.length >= 8, 'Reichweite: mehrere grosse Ziele');
  assert.ok(knoepfe.length <= 28, 'mehr als die Presets plus Bloecke trifft aus zwei Metern niemand');
  assert.ok(!/<input|<select|contenteditable/.test(html),
    'ein Tastenfeld ist aus zwei Metern nicht bedienbar');
});

test('die Flaeche merkt sich classic oder routine', () => {
  assert.equal(readWallPrefs().surface, 'classic');
  writeWallPrefs({ surface: 'routine' });
  assert.equal(readWallPrefs().surface, 'routine');
  writeWallPrefs({ surface: 'nope' });
  assert.equal(readWallPrefs().surface, 'classic');
});

test('die Flaeche traegt den Wechsel classic/routine', () => {
  assert.match(DASH, /id="wall-routine-toggle"/, 'der Wechsel steht am Fuss');
  assert.match(DASH, /wallSurfaceRoutine|surface === 'routine'/, 'die Routine-Flaeche ist erreichbar');
  assert.match(SETUP_SRC, /chip\('surface', 'routine'/, 'die Darstellung kennt den Chip');
});

test('die Flaeche traegt Setup und Wer-Filter, die Programmzeilen bleiben ohne Route', () => {
  assert.match(DASH, /id="wall-setup"/, 'der Setup-Knopf steht auf der Flaeche');
  assert.match(DASH, /data-wall-who/, 'Gesichter sind Ziele');
  assert.match(DASH, /toggleWallWhoFilter/, 'ein Tipp filtert, ein zweiter hebt auf');
  const listAt = DASH.indexOf('function renderWallRow');
  const listFn = DASH.slice(listAt, DASH.indexOf('function renderWallProgram', listAt));
  assert.match(listFn, /wall-row__tick/, 'ein Display darf die Zeile zum Abhaken machen');
  assert.match(listFn, /canTick/, 'nur wenn Gesichter da sind');
  assert.ok(!/data-route/.test(listFn), 'und ohne Route');
});

test('Presets setzen Bloecke, Programm bleibt immer an, Legacy-Flags wandern mit', () => {
  assert.equal(wallPresetName(), 'hallway');
  applyWallPreset('kitchen');
  assert.equal(wallPresetName(), 'kitchen');
  assert.deepEqual(readWallPrefs().blocks, [...WALL_PRESETS.kitchen]);
  assert.equal(wallHasBlock('meals'), true);
  assert.equal(wallHasBlock('who'), false);
  assert.equal(readWallPrefs().showMeals, true);
  assert.equal(readWallPrefs().showWho, false);

  toggleWallBlock('who');
  assert.equal(wallPresetName(), 'custom');
  assert.equal(wallHasBlock('program'), true);

  global.localStorage.setItem('yuvomi-wall-prefs', JSON.stringify({
    showWho: true, showWeather: false, showTimer: true, rowCap: 4,
  }));
  const legacy = readWallPrefs();
  assert.deepEqual(legacy.blocks, ['program', 'who', 'events', 'timer']);
  assert.equal(legacy.showWeather, false);

  global.localStorage.setItem('yuvomi-wall-prefs', JSON.stringify({
    blocks: ['program', 'who', 'weather', 'timer'], rowCap: 4,
  }));
  assert.deepEqual(readWallPrefs().blocks, [...WALL_PRESETS.hallway]);
  assert.equal(readWallPrefs().showEvents, true);
});

test('die naechste Sache steht an der Wurzel fuer den Screensaver', () => {
  applyWallNextToDocument('18:00 · Abendessen');
  assert.equal(global.document.documentElement.dataset.wallNext, '18:00 · Abendessen');
  applyWallNextToDocument('  ');
  assert.equal(global.document.documentElement.dataset.wallNext, undefined);
  assert.match(SCREENSAVER, /dataset\.wallNext/);
  assert.match(SCREENSAVER, /photo-screensaver__next/);
});

test('die Verdrahtung haengt nicht am Datenladen', () => {
  const renderAt = DASH.indexOf('export async function render(');
  const bisAwait = DASH.slice(renderAt, DASH.indexOf('await ', renderAt));
  assert.match(bisAwait, /wireWallSetup\(/, 'Setup ist bedienbar, sobald die Flaeche im DOM steht');
});

test('Apparence und Appairage schreiben dieselben Prefs bzw. denselben Schalter', () => {
  assert.match(APPEARANCE, /writeWallPrefs/, 'Darstellung unter Einstellungen trifft denselben Speicher');
  assert.match(PAIR, /setWallModeEnabled\(true\)/, 'ein frisch gekoppeltes Display startet im Wand-Modus');
});
