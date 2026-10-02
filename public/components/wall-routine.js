/**
 * Modul: Kinder-Routine auf der Wandflaeche
 * Zweck: Ein Morgen- und ein Abendbild pro Kind. Antippen laesst den Schritt
 *        fuer heute verschwinden. Die Person kommt vom Reiter, nicht vom
 *        Gesichterwaehler der Aufgaben.
 * Abhaengigkeiten: /api.js, /i18n.js, /utils/html.js, /utils/color.js,
 *                  /utils/routines.js, /utils/timezone.js
 *
 * KEIN FACE-PICKER. Der Reiter IST das Kind. Ein Display muss die Person
 * trotzdem namentlich mitschicken (DISPLAY_WRITE_ROUTES).
 */
import { api } from '../api.js';
import { t } from '../i18n.js';
import { esc } from '../utils/html.js';
import { getReadableTextColor, AVATAR_FALLBACK_COLOR } from '../utils/color.js';
import { nowFields } from '../utils/timezone.js';
import { routinePeriodForHour, routineStepImageUrl } from '../utils/routines.js';

const WHO_KEY = 'yuvomi-wall-routine-who';
const PERIOD_KEY = 'yuvomi-wall-routine-period';

function initials(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function firstName(displayName) {
  return String(displayName || '').trim().split(/\s+/)[0] || '';
}

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch { /* Privatmodus */ }
}

export function readRoutineWho() {
  const n = Number(safeGet(globalThis.sessionStorage, WHO_KEY));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function writeRoutineWho(userId) {
  safeSet(globalThis.sessionStorage, WHO_KEY, userId);
}

export function readRoutinePeriod() {
  const raw = safeGet(globalThis.sessionStorage, PERIOD_KEY);
  return raw === 'morning' || raw === 'evening' ? raw : null;
}

export function writeRoutinePeriod(period) {
  safeSet(globalThis.sessionStorage, PERIOD_KEY, period);
}

export function defaultRoutinePeriod() {
  return routinePeriodForHour(nowFields()?.hour);
}

export function activeRoutinePerson(board = {}) {
  const people = Array.isArray(board.people) ? board.people : [];
  const storedWho = readRoutineWho();
  const whoId = people.some((p) => Number(p.id) === Number(storedWho))
    ? Number(storedWho)
    : (people[0] ? Number(people[0].id) : null);
  return people.find((p) => Number(p.id) === Number(whoId)) || null;
}

function isLandscapeWall() {
  try {
    if (globalThis.matchMedia?.('(orientation: landscape)')?.matches) return true;
    return (Number(globalThis.innerWidth) || 0) > (Number(globalThis.innerHeight) || 0);
  } catch {
    return true;
  }
}

function routineGridShape(count) {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 1) return { cols: 1, rows: 1 };
  if (isLandscapeWall()) {
    if (n <= 5) return { cols: n, rows: 1 };
    if (n <= 10) return { cols: Math.ceil(n / 2), rows: 2 };
    return { cols: Math.ceil(n / 3), rows: 3 };
  }
  if (n <= 4) return { cols: 2, rows: Math.ceil(n / 2) };
  if (n <= 9) return { cols: 3, rows: Math.ceil(n / 3) };
  return { cols: 3, rows: Math.ceil(n / 3) };
}

export async function completeRoutineStep(stepId, userId) {
  await api.post(`/routines/steps/${stepId}/done`, { user_id: userId });
}

export async function undoRoutineStep(stepId, userId) {
  await api.delete(`/routines/steps/${stepId}/done?user_id=${encodeURIComponent(userId)}`);
}

function personTab(person, selectedId) {
  const color = person.avatar_color || AVATAR_FALLBACK_COLOR;
  const on = Number(person.id) === Number(selectedId);
  const name = firstName(person.display_name);
  return `
    <button type="button" class="wall-routine__person${on ? ' wall-routine__person--on' : ''}"
        data-routine-who="${esc(String(person.id))}" aria-pressed="${on ? 'true' : 'false'}"
        aria-label="${esc(name)}">
      <span class="wall-routine__avatar" style="background:${esc(color)};color:${getReadableTextColor(color)}">
        ${person.avatar_data ? `<img src="${esc(person.avatar_data)}" alt="" loading="lazy">` : esc(initials(person.display_name))}
      </span>
      <span class="wall-routine__who-name">${esc(name)}</span>
    </button>`;
}

function stepCard(step, { done = false } = {}) {
  const action = done ? 'undo' : 'done';
  const photo = routineStepImageUrl(step);
  const titled = !done && Boolean(step.show_title);
  const picture = photo
    ? `<img class="wall-routine__photo" src="${esc(photo)}" alt="" loading="lazy">`
    : `<span class="wall-routine__icon" aria-hidden="true">
         <i data-lucide="${esc(step.icon)}"></i>
       </span>`;
  return `
    <button type="button" class="wall-routine__card${done ? ' wall-routine__card--done' : ''}${photo ? ' wall-routine__card--photo' : ''}${titled ? ' wall-routine__card--titled' : ''}"
        data-routine-${action}="${esc(String(step.id))}"
        aria-label="${esc(step.title)}">
      ${picture}
      ${titled ? `<span class="wall-routine__label">${esc(step.title)}</span>` : ''}
    </button>`;
}

export function renderWallRoutine(board = {}, prefsPeriod = null) {
  const people = Array.isArray(board.people) ? board.people : [];
  const steps = Array.isArray(board.steps) ? board.steps : [];
  const person = activeRoutinePerson(board);
  const whoId = person ? Number(person.id) : null;
  const period = readRoutinePeriod() || prefsPeriod || defaultRoutinePeriod();
  const mine = steps.filter((s) => Number(s.user_id) === Number(whoId) && s.period === period);
  const remaining = mine.filter((s) => !s.done_today);
  const finished = mine.filter((s) => s.done_today);
  const name = firstName(person?.display_name) || '';
  const grid = routineGridShape(remaining.length);

  const empty = !mine.length
    ? `<p class="wall-routine__empty">${esc(t('dashboard.wallRoutineEmpty'))}</p>`
    : remaining.length
      ? `<div class="wall-routine__grid" style="--routine-cols:${grid.cols};--routine-rows:${grid.rows}">${remaining.map((s) => stepCard(s)).join('')}</div>`
      : `<p class="wall-routine__empty wall-routine__empty--done">${esc(t('dashboard.wallRoutineAllDone'))}</p>`;

  const doneRow = finished.length
    ? `<section class="wall-routine__done" aria-label="${esc(t('dashboard.wallRoutineDone'))}">
         <div class="wall-routine__done-row">${finished.map((s) => stepCard(s, { done: true })).join('')}</div>
       </section>`
    : '';

  return `
    <section class="wall-routine" data-routine-who-id="${esc(String(whoId || ''))}"
        aria-label="${esc(t('dashboard.wallRoutineOf', { name }))}">
      <div class="wall-routine__chrome">
        ${people.length
          ? `<div class="wall-routine__people">${people.map((p) => personTab(p, whoId)).join('')}</div>`
          : ''}
        <div class="wall-routine__periods">
          <button type="button" class="wall-routine__period${period === 'morning' ? ' wall-routine__period--on' : ''}"
              data-routine-period="morning" aria-pressed="${period === 'morning' ? 'true' : 'false'}">
            <i data-lucide="sun" aria-hidden="true"></i>
            ${esc(t('dashboard.wallRoutineMorning'))}
          </button>
          <button type="button" class="wall-routine__period${period === 'evening' ? ' wall-routine__period--on' : ''}"
              data-routine-period="evening" aria-pressed="${period === 'evening' ? 'true' : 'false'}">
            <i data-lucide="moon" aria-hidden="true"></i>
            ${esc(t('dashboard.wallRoutineEvening'))}
          </button>
        </div>
      </div>
      ${empty}
      ${doneRow}
    </section>`;
}

export function wireWallRoutine(wall, { onDone, onUndo, paint }, signal) {
  if (!wall) return;
  wall.addEventListener('click', (event) => {
    const whoBtn = event.target.closest('[data-routine-who]');
    if (whoBtn && wall.contains(whoBtn)) {
      writeRoutineWho(Number(whoBtn.dataset.routineWho));
      paint?.();
      return;
    }
    const periodBtn = event.target.closest('[data-routine-period]');
    if (periodBtn && wall.contains(periodBtn)) {
      writeRoutinePeriod(periodBtn.dataset.routinePeriod);
      paint?.();
      return;
    }
    const doneBtn = event.target.closest('[data-routine-done]');
    if (doneBtn && wall.contains(doneBtn)) {
      const whoId = Number(wall.querySelector('.wall-routine')?.dataset.routineWhoId);
      if (!Number.isInteger(whoId) || whoId < 1) return;
      doneBtn.disabled = true;
      onDone?.(Number(doneBtn.dataset.routineDone), whoId);
      return;
    }
    const undoBtn = event.target.closest('[data-routine-undo]');
    if (undoBtn && wall.contains(undoBtn)) {
      const whoId = Number(wall.querySelector('.wall-routine')?.dataset.routineWhoId);
      if (!Number.isInteger(whoId) || whoId < 1) return;
      undoBtn.disabled = true;
      onUndo?.(Number(undoBtn.dataset.routineUndo), whoId);
    }
  }, { signal });
}
