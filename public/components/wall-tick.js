/**
 * Modul: Abhaken auf der Wandflaeche (#1209 auf dem Programm)
 * Zweck: Ein gekoppeltes Display darf eine Aufgabe fuer eine AM GERAET
 *        gewaehlte Person erledigen. Die Person wird nicht gemerkt.
 * Abhaengigkeiten: /api.js, /i18n.js, /utils/html.js, /utils/color.js
 *
 * KEINE AUFNAHME IN DIE ALLGEMEINE WANDBEDIENUNG. Ein Mitgliedskonto bleibt
 * auf der Flaeche lesend - der Schreibpfad ist die Display-Allowlist
 * (PATCH /tasks/:id/status), nicht ein Scope. Ohne benannte Person passiert
 * nichts; zuruecknehmen gibt es hier nicht.
 *
 * (a) navigiert nicht - Overlay, keine Route.
 * (b) aendert den Haushalt NUR ueber die eine Display-Schreibroute.
 * (c) merkt niemanden - die Wahl lebt in sessionStorage bis zum Tipp.
 * (d) Gesichter, grosse Ziele, kein Tastenfeld.
 */
import { api } from '../api.js';
import { t } from '../i18n.js';
import { esc } from '../utils/html.js';
import { getReadableTextColor, AVATAR_FALLBACK_COLOR } from '../utils/color.js';

const TICK_KEY = 'yuvomi-wall-tick';

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

export function readWallTickTask() {
  try {
    const n = Number(sessionStorage.getItem(TICK_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setWallTickTask(taskId) {
  try {
    if (taskId == null) sessionStorage.removeItem(TICK_KEY);
    else sessionStorage.setItem(TICK_KEY, String(taskId));
  } catch { /* Privatmodus */ }
}

export function isWallTickOpen(wall) {
  return Boolean(wall?.hasAttribute('data-wall-tick')) || readWallTickTask() != null;
}

export function renderWallTick(people, { title = '' } = {}) {
  const open = readWallTickTask() != null;
  const faces = (Array.isArray(people) ? people : []).filter((p) => p?.id && p.can_tick_off !== false);
  const list = faces.length
    ? `<ul class="wall-tick__list">${faces.map((u) => {
        const color = u.avatar_color || AVATAR_FALLBACK_COLOR;
        return `
          <li>
            <button type="button" class="wall-tick__member" data-wall-doer="${esc(String(u.id))}">
              <span class="wall-who__avatar" style="background:${esc(color)};color:${getReadableTextColor(color)}">
                ${u.avatar_data ? `<img src="${esc(u.avatar_data)}" alt="" loading="lazy">` : esc(initials(u.display_name))}
              </span>
              <span class="wall-who__name">${esc(firstName(u.display_name))}</span>
            </button>
          </li>`;
      }).join('')}</ul>`
    : `<p class="wall-tick__empty">${esc(t('dashboard.wallTickEmpty'))}</p>`;

  return `
    <div class="wall-setup wall-tick" id="wall-tick-panel"${open ? '' : ' hidden'}>
      <div class="wall-setup__sheet" role="dialog" aria-labelledby="wall-tick-title">
        <h2 class="wall-setup__title" id="wall-tick-title">${esc(t('dashboard.wallTickWho', { title }))}</h2>
        ${list}
        <button type="button" class="wall-setup__done" id="wall-tick-cancel">${esc(t('common.cancel'))}</button>
      </div>
    </div>`;
}

export async function completeWallTask(taskId, userId) {
  await api.patch(`/tasks/${taskId}/status`, {
    status: 'done',
    done_by_user_id: userId,
  });
}

export function wireWallTick(wall, { people, rerender, onDone }, signal) {
  if (!wall) return;
  wall.addEventListener('click', (event) => {
    const cancel = event.target.closest('#wall-tick-cancel');
    if (cancel) {
      setWallTickTask(null);
      wall.removeAttribute('data-wall-tick');
      const panel = wall.querySelector('#wall-tick-panel');
      if (panel) panel.hidden = true;
      return;
    }
    const row = event.target.closest('button.wall-row__tick');
    if (row && wall.contains(row) && !event.target.closest('[data-wall-doer]')) {
      setWallTickTask(Number(row.dataset.wallTick));
      wall.setAttribute('data-wall-tick', '');
      wall.setAttribute('data-wall-awake', '');
      rerender();
      return;
    }
    const doer = event.target.closest('[data-wall-doer]');
    if (!doer || !wall.contains(doer)) return;
    const taskId = readWallTickTask();
    const userId = Number(doer.dataset.wallDoer);
    if (!taskId || !Number.isInteger(userId)) return;
    const person = (people || []).find((p) => Number(p.id) === userId);
    setWallTickTask(null);
    wall.removeAttribute('data-wall-tick');
    onDone?.(taskId, userId, person);
  }, { signal });
}
