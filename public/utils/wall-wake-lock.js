/**
 * Modul: Bildschirm wach halten, solange die Wand laeuft.
 * Zweck: Ein Wandtablet ist kein Telefon - der Bildschirm darf nicht von allein
 *        ausgehen, waehrend jemand an der Kuechentheke steht.
 * Abhaengigkeiten: keine
 *
 * Geraetelokal, kein Server. Scheitert still (Browser ohne Wake Lock, Stromspar-
 * Richtlinie): die Flaeche bleibt lesbar, nur der Bildschirm darf dann schlafen.
 */

let sentinel = null;
let watching = false;

async function requestLock() {
  if (sentinel || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    sentinel = null;
  }
}

async function releaseLock() {
  try {
    await sentinel?.release();
  } catch { /* schon frei */ }
  sentinel = null;
}

function onVisibility() {
  if (document.hidden) return;
  if (document.documentElement.hasAttribute('data-wall-mode')) requestLock();
}

/** `active` folgt syncWallMode: an der Wand anfordern, sonst abgeben. */
export function syncWallWakeLock(active) {
  if (!watching && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    watching = true;
  }
  if (active) requestLock();
  else releaseLock();
}
