/**
 * Modul: Guard - Abhaken auf der Wandflaeche
 * Zweck: Ein gekoppeltes Display darf eine Aufgabe fuer eine AM GERAET
 *        gewaehlte Person erledigen. Die Person wird nicht gemerkt.
 *        Mitgliedskonten bleiben lesend. Kein Undo.
 * Ausfuehren: npm run test:wall-tick
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const session = new Map();
global.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => session.set(k, String(v)),
  removeItem: (k) => session.delete(k),
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const {
  renderWallTick, readWallTickTask, setWallTickTask, isWallTickOpen,
} = await import('../public/components/wall-tick.js');

const TICK_SRC = readFileSync(new URL('../public/components/wall-tick.js', import.meta.url), 'utf8');
const WAKE_SRC = readFileSync(new URL('../public/utils/wall-wake-lock.js', import.meta.url), 'utf8');
const DASH = readFileSync(new URL('../public/pages/dashboard.js', import.meta.url), 'utf8');
const MODE = readFileSync(new URL('../public/utils/wall-mode.js', import.meta.url), 'utf8');
const SCREENSAVER = readFileSync(new URL('../public/components/photo-screensaver.js', import.meta.url), 'utf8');

test.beforeEach(() => session.clear());

test('(a) das Overlay navigiert nicht', () => {
  const html = renderWallTick([
    { id: 3, display_name: 'Mia Muster', can_tick_off: true, avatar_color: '#CE2A63' },
  ], { title: 'Muell' });
  assert.match(html, /data-wall-doer="3"/, 'Reichweite: ein Gesicht steht da');
  assert.ok(!/<a\b|href=|data-route=|data-modal|openModal/.test(html),
    'ein Tipp darf die Flaeche nicht verlassen');
});

test('(c) die Wahl lebt nur in der Sitzung', () => {
  assert.equal(readWallTickTask(), null);
  setWallTickTask(12);
  assert.equal(readWallTickTask(), 12);
  assert.equal(session.get('yuvomi-wall-tick'), '12');
  setWallTickTask(null);
  assert.equal(readWallTickTask(), null);
  assert.match(TICK_SRC, /sessionStorage/, 'die Wahl darf die naechste Sitzung nicht ueberleben');
  assert.ok(!/localStorage/.test(TICK_SRC), 'und wird nicht geraeteweit gemerkt');
});

test('(d) Gesichter, kein Tastenfeld', () => {
  const html = renderWallTick([
    { id: 1, display_name: 'Leo Lang', can_tick_off: true },
    { id: 2, display_name: 'Nur Lesen', can_tick_off: false },
  ]);
  assert.match(html, /Leo/, 'wer abhaken darf, steht da');
  assert.ok(!/Nur Lesen/.test(html), 'wer nicht darf, nicht');
  assert.ok(!/<input|<select|contenteditable/.test(html),
    'ein Tastenfeld ist aus zwei Metern nicht bedienbar');
});

test('ohne offene Aufgabe ist das Overlay zu', () => {
  const html = renderWallTick([{ id: 1, display_name: 'Mia', can_tick_off: true }]);
  assert.match(html, /hidden/, 'ohne Wahl kein Dialog');
  assert.equal(isWallTickOpen({ hasAttribute: () => false }), false);
});

test('der Schreibpfad ist genau die Display-Allowlist', () => {
  assert.match(TICK_SRC, /api\.patch\(`\/tasks\/\$\{taskId\}\/status`/,
    'PATCH /tasks/:id/status ist die eine Display-Schreibroute');
  assert.match(TICK_SRC, /done_by_user_id/, 'ohne benannte Person passiert nichts');
  assert.ok(!/undo|status:\s*'open'|pending/.test(TICK_SRC),
    'zuruecknehmen gibt es hier nicht');
});

test('Wake Lock haelt den Bildschirm, ohne den Haushalt anzufassen', () => {
  assert.match(WAKE_SRC, /wakeLock\.request\('screen'\)/, 'Screen-Lock, nicht irgendwas');
  assert.ok(!/from '.*\/api\.js'|api\.(get|post|put|patch|delete)\(|fetch\(/.test(WAKE_SRC),
    'kein Server-Aufruf');
  assert.match(MODE, /syncWallWakeLock\(active\)/, 'einmal pro syncWallMode, nicht je Minute neu erzwungen');
  assert.match(WAKE_SRC, /if \(sentinel/, 'ein bestehendes Lock wird nicht neu angefordert');
});

test('die Wand fragt Display-Gesichter und taktet schneller', () => {
  assert.match(DASH, /\/displays\/people/, 'Gesichter kommen vom Display-Endpunkt');
  assert.match(DASH, /can_tick_off/, 'nur wer abhaken darf');
  assert.match(DASH, /wallMode \? 20_000/, 'solange die Wand laeuft, frisch in Sekunden');
  assert.match(DASH, /completeWallTask/, 'der Tipp schreibt ueber den Display-Pfad');
  assert.match(DASH, /wireWallTick/, 'das Overlay ist verdrahtet');
});

test('der Screensaver liest die naechste Sache', () => {
  assert.match(SCREENSAVER, /photo-screensaver__next/);
  assert.match(SCREENSAVER, /dataset\.wallNext/);
});
