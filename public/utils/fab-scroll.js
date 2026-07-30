/**
 * Der FAB fährt beim Abwärtsscrollen weg.
 *
 * WARUM: Der FAB ist `position: fixed` in der unteren rechten Ecke. Listen,
 * deren Zeilen dort eine Bedienung tragen, verlieren sie unter ihm. Gemessen
 * (Critique 2026-07-30): 14 Überdeckungen über 4 Routen × 4 Viewports × 3
 * Scrollstände, Maximum 53.2% auf dem Löschen einer Rezeptzeile, 39.8% auf dem
 * Warenkorb einer Vorratszeile bei 320px.
 *
 * `--fab-clearance` polstert nur das Listen-ENDE und löst deshalb nur den Fall
 * „letzte Zeile". Die zweite bisherige Antwort war eine reservierte Gasse pro
 * Zeile (`--fab-lane`, 76px): kollisionsfrei, aber sie kostete bei 320px 24% der
 * Viewportbreite und kürzte Artikelnamen auf vier lesbare Zeichen. Das Modul
 * hatte damit zwei entgegengesetzte Antworten auf dasselbe Problem, und beide
 * waren falsch.
 *
 * DIE ENTSCHEIDUNG: kein horizontaler Platz, sondern Zeit. Wer nach unten
 * scrollt, sucht eine Zeile; solange er sucht, ist der FAB im Weg und
 * verschwindet.
 *
 * ZURÜCK KOMMT ER NICHT PER TIMER. Ein Idle-Timer wäre die naheliegende Wahl und
 * die falsche: nach dem Scrollen greift der Nutzer genau JETZT nach der
 * Zeilenaktion, und der FAB wäre in genau diesem Moment wieder da. Er kommt
 * deshalb nur zurück, wenn der Nutzer
 *
 *   - nach oben scrollt (er sucht nicht mehr, er navigiert),
 *   - am Listenanfang steht, oder
 *   - am Listenende steht (dort garantiert --fab-clearance denselben Freiraum).
 *
 * Damit gibt es immer einen deterministischen Weg zurück, ohne dass der Knopf
 * sich in die Bedienung drängt. Zusätzlich bleibt er per `n`-Shortcut erreichbar
 * (siehe router.js) - der Weg für Tastaturnutzer ist von dieser Mechanik
 * unberührt.
 *
 * WIDERLEGT (Critique 2026-07-30): Hier stand als Begründung für den Listenanfang
 * „dort liegt keine Zeile unter ihm". Das ist falsch, und zwar messbar. Bei
 * `scrollTop = 0` liegen auf 5 von 6 geprüften Route/Viewport-Kombinationen
 * Zeilenaktionen unter dem FAB:
 *
 *   phoneSm /pantry    80.6%  („Menge erhöhen: Spaghetti")
 *   phone   /pantry    33.9%
 *   phoneSm /shopping  28.0%
 *   phone   /shopping  13% + 14%  (zwei „Details zu …")
 *   phone   /meals     10.1%
 *
 * Insgesamt 15 blockierende Überdeckungen über die geprüften Stände. Der
 * Retract-Mechanismus selbst greift zuverlässig (beim Abwärtsscrollen 0
 * Überdeckungen, Opazität 0), und am Listenende stimmt die Annahme - dort wirkt
 * --fab-clearance. Der ungelöste Fall ist der Ruhezustand VOR der ersten Geste.
 *
 * Warum hier trotzdem nichts geändert wurde: eine statische Geometrie löst es
 * nicht. Die Bedienzone sitzt an der rechten Zeilenkante, der FAB in der rechten
 * unteren Ecke; auf einem Telefon ist das dieselbe Spalte. Eine Gasse pro Zeile
 * kostete bei 320px 24% der Viewportbreite (deshalb wurde sie zurückgebaut), und
 * eine Gasse nur für die untersten Zeilen wäre bei scrollTop=0 wirkungslos, weil
 * die betroffenen Zeilen dort mitten in der Liste stehen. Was bleibt, ist eine
 * Struktur-Entscheidung: der FAB verlässt die Ecke (Leiste am Fuß), oder die
 * Zeilen tragen ihre Aktion nicht mehr rechts außen.
 */

const RETRACTED = 'page-fab--retracted';

/** Kumulierte Abwärtsstrecke, bevor der FAB weicht. Unter diesem Wert bleibt er
 *  stehen, damit ein Wackeln am Trackpad ihn nicht flackern lässt. */
const DOWN_THRESHOLD = 24;

/** Toleranz für „am Ende": Sub-Pixel-Layouts treffen scrollHeight selten exakt. */
const BOTTOM_SLACK = 4;

let installed = false;
const lastTop = new WeakMap();
let downRun = 0;

function currentFab() {
  return document.querySelector('.page-fab');
}

/** Der FAB darf nicht wegfahren, während er benutzt wird. */
function isBusy(fab) {
  return document.activeElement === fab || fab.getAttribute('aria-expanded') === 'true';
}

function onScroll(event) {
  const el = event.target;
  // `document` feuert auch für das Dokument selbst; dort gibt es kein scrollTop.
  if (!el || el === document) return;

  const fab = currentFab();
  if (!fab) return;

  const top = el.scrollTop;
  const height = el.scrollHeight;
  const client = el.clientHeight;
  // Nicht scrollbare Container melden ebenfalls scroll (z. B. bei Fokus-Sprüngen).
  if (height <= client) return;

  const previous = lastTop.get(el);
  lastTop.set(el, top);
  if (previous === undefined) return;

  const delta = top - previous;
  const atTop = top <= 0;
  const atBottom = top + client >= height - BOTTOM_SLACK;

  if (atTop || atBottom || delta < 0) {
    downRun = 0;
    fab.classList.remove(RETRACTED);
    return;
  }

  if (delta > 0) {
    downRun += delta;
    if (downRun >= DOWN_THRESHOLD && !isBusy(fab)) {
      fab.classList.add(RETRACTED);
    }
  }
}

/**
 * Installiert den Mechanismus. Idempotent, also unschädlich bei jedem
 * Seitenwechsel aufrufbar.
 *
 * EIN Listener auf `document` in der Capture-Phase, nicht einer pro Scroller:
 * `scroll` steigt nicht auf, wird in der Capture-Phase aber durchgereicht. Jede
 * Seite hat einen anderen Scrollport (die Modul-Roots der Küche sind
 * `overflow: hidden`, die Liste darin scrollt), und ein Listener pro Seite würde
 * bei jeder Navigation neu verdrahtet werden müssen. So gibt es keinen
 * Lebenszyklus, der lecken kann.
 */
export function installFabRetract() {
  if (installed) return;
  installed = true;
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
}
