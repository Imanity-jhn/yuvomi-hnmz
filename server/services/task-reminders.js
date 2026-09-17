/**
 * Modul: Erinnerungen an zugewiesenen Aufgaben
 * Zweck: Eine Stelle fuer (1) das Verteilen der Ersteller-Vorlage an die
 *        Zustaendigen und (2) die automatisch nachgezogenen Termine an der
 *        Faelligkeit und drei Tage davor.
 * Abhaengigkeiten: server/utils/timezone.js
 *
 * WARUM HIER UND NICHT NUR IN DEN ROUTEN. Wie bei Terminen (#921) gibt es zwei
 * Schreibenden, die voneinander nichts wissen: das Setzen einer Erinnerung
 * (routes/reminders.js) und das Zuweisen (routes/tasks.js). Dazu kommt der
 * periodische Lauf in notifications.js, der den Bestand nachzieht, der nie
 * erneut gespeichert wurde. Dieselbe Regel an drei Enden waere drei Antworten.
 */

import {
  daysBetweenDateKeys, householdTimeZone, localToUTC, shiftDateKey, todayKey,
} from '../utils/timezone.js';

export const TASK_DUE_LEAD_DAYS = 3;

function templateReminders(database, taskId, authorId) {
  return database.prepare(`
    SELECT remind_at FROM reminders
    WHERE entity_type = 'task' AND entity_id = ? AND created_by = ?
      AND NOT (assigned_from IS NOT NULL AND assigned_from = created_by)
    ORDER BY remind_at ASC
  `).all(taskId, authorId).map((r) => r.remind_at);
}

function assigneesOf(database, taskId, exceptUserId) {
  return database.prepare(`
    SELECT user_id FROM task_assignments WHERE task_id = ? AND user_id != ?
  `).all(taskId, exceptUserId).map((r) => r.user_id);
}

export function isTaskAutoReminder(row) {
  return row?.assigned_from != null && Number(row.assigned_from) === Number(row.created_by);
}

export function taskAuthorId(database, taskId) {
  return database.prepare('SELECT created_by FROM tasks WHERE id = ?')
    .get(taskId)?.created_by ?? null;
}

/**
 * Legt die Erinnerungen des Erstellers fuer die Zustaendigen an.
 * Gleiche Regel wie fanOutEventReminders: eigene Zeilen bleiben, geerbte
 * werden nur ersetzt, wenn sich die Menge aendert.
 */
export function fanOutTaskReminders(
  database,
  taskId,
  authorId,
  { dropDerivedWhenOwn = false } = {},
) {
  const remindAts = templateReminders(database, taskId, authorId);
  const targets   = assigneesOf(database, taskId, authorId);
  if (!targets.length) return 0;

  const ownRow = database.prepare(`
    SELECT 1 FROM reminders
    WHERE entity_type = 'task' AND entity_id = ? AND created_by = ? AND assigned_from IS NULL
  `);
  const derivedOf = database.prepare(`
    SELECT remind_at FROM reminders
    WHERE entity_type = 'task' AND entity_id = ? AND created_by = ? AND assigned_from = ?
    ORDER BY remind_at ASC
  `);
  const dropDerived = database.prepare(`
    DELETE FROM reminders
    WHERE entity_type = 'task' AND entity_id = ? AND created_by = ? AND assigned_from = ?
  `);
  const insert = database.prepare(`
    INSERT INTO reminders (entity_type, entity_id, remind_at, created_by, assigned_from)
    VALUES ('task', ?, ?, ?, ?)
  `);

  const wanted = remindAts.join('|');
  let written = 0;
  for (const userId of targets) {
    if (ownRow.get(taskId, userId)) {
      if (dropDerivedWhenOwn) dropDerived.run(taskId, userId, authorId);
      continue;
    }
    const have = derivedOf.all(taskId, userId, authorId).map((r) => r.remind_at).join('|');
    if (have === wanted) continue;

    dropDerived.run(taskId, userId, authorId);
    for (const remindAt of remindAts) {
      insert.run(taskId, remindAt, userId, authorId);
      written++;
    }
  }
  return written;
}

export function dropInheritedTaskReminders(database, taskId, userIds) {
  if (!userIds?.length) return 0;
  const stmt = database.prepare(`
    DELETE FROM reminders
    WHERE entity_type = 'task' AND entity_id = ? AND created_by = ? AND assigned_from IS NOT NULL
  `);
  let removed = 0;
  for (const userId of userIds) removed += stmt.run(taskId, userId).changes;
  return removed;
}

function wallTime(dueTime) {
  const raw = String(dueTime || '23:59:59');
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  return '23:59:59';
}

export function taskDueInstant(task, tz) {
  if (!task?.due_date) return null;
  return localToUTC(`${task.due_date}T${wallTime(task.due_time)}`, tz);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function wantedAutoTimes(database, task, now) {
  if (!task?.due_date) return [];
  if (task.status === 'done' || task.archived_at) return [];
  const tz = householdTimeZone(database);
  const dueAt = taskDueInstant(task, tz);
  if (!dueAt) return [];
  const nowIso = iso(now);
  const times = [];
  if (dueAt > nowIso) times.push(dueAt);

  const today = todayKey(database, now);
  const days = daysBetweenDateKeys(today, task.due_date);
  if (days != null && days >= TASK_DUE_LEAD_DAYS) {
    const leadAt = localToUTC(`${shiftDateKey(task.due_date, -TASK_DUE_LEAD_DAYS)}T${wallTime(task.due_time)}`, tz);
    if (leadAt > nowIso && leadAt !== dueAt) times.push(leadAt);
  }
  return [...new Set(times)].sort();
}

const AUTO_SQL = `entity_type = 'task' AND entity_id = ? AND created_by = ?
  AND assigned_from IS NOT NULL AND assigned_from = created_by`;

/**
 * Zieht Faelligkeit und J-3 fuer jede zustaendige Person nach.
 *
 * MARKER: `assigned_from = created_by`. Das ist kein Erben vom Ersteller,
 * sondern "der Server hat diese Zeile fuer diese Person gelegt". Fan-out
 * fasst nur `assigned_from = <Ersteller>` an, GET /all blendet den Marker
 * aus, damit das Formular sie nicht als selbst gesetzt anzeigt.
 */
export function syncTaskAutoReminders(database, taskId, { now = new Date() } = {}) {
  const task = database.prepare(`
    SELECT id, due_date, due_time, status, archived_at, created_by FROM tasks WHERE id = ?
  `).get(taskId);
  if (!task) return 0;

  const assignees = database.prepare(
    'SELECT user_id FROM task_assignments WHERE task_id = ?'
  ).all(taskId).map((r) => r.user_id);

  const dropAuto = database.prepare(`DELETE FROM reminders WHERE ${AUTO_SQL}`);
  const dropAllAuto = database.prepare(`
    DELETE FROM reminders
    WHERE entity_type = 'task' AND entity_id = ?
      AND assigned_from IS NOT NULL AND assigned_from = created_by
  `);

  if (!assignees.length) return dropAllAuto.run(taskId).changes;

  const wanted = wantedAutoTimes(database, task, now);
  if (!wanted.length) return dropAllAuto.run(taskId).changes;

  const existingAuto = database.prepare(`
    SELECT remind_at FROM reminders WHERE ${AUTO_SQL} ORDER BY remind_at ASC
  `);
  const occupied = database.prepare(`
    SELECT remind_at FROM reminders
    WHERE entity_type = 'task' AND entity_id = ? AND created_by = ?
      AND NOT (assigned_from IS NOT NULL AND assigned_from = created_by)
  `);
  const insert = database.prepare(`
    INSERT INTO reminders (entity_type, entity_id, remind_at, created_by, assigned_from)
    VALUES ('task', ?, ?, ?, ?)
  `);

  let written = 0;
  for (const userId of assignees) {
    const skip = new Set(occupied.all(taskId, userId).map((r) => r.remind_at));
    const target = wanted.filter((at) => !skip.has(at));
    const have = existingAuto.all(taskId, userId).map((r) => r.remind_at).join('|');
    if (have === target.join('|')) continue;
    dropAuto.run(taskId, userId);
    for (const remindAt of target) {
      insert.run(taskId, remindAt, userId, userId);
      written++;
    }
  }

  database.prepare(`
    DELETE FROM reminders
    WHERE entity_type = 'task' AND entity_id = ?
      AND assigned_from IS NOT NULL AND assigned_from = created_by
      AND created_by NOT IN (SELECT user_id FROM task_assignments WHERE task_id = ?)
  `).run(taskId, taskId);

  return written;
}

/**
 * Bestand nachziehen: Vorlage des Erstellers plus Auto-Termine, fuer jede
 * offene Aufgabe mit Zustaendigen. Idempotent, fuer den Minuten-Lauf.
 */
export function syncAllTaskReminders(database, now = new Date()) {
  const rows = database.prepare(`
    SELECT DISTINCT t.id, t.created_by
    FROM tasks t
    JOIN task_assignments a ON a.task_id = t.id
  `).all();
  let written = 0;
  for (const row of rows) {
    written += fanOutTaskReminders(database, row.id, row.created_by);
    written += syncTaskAutoReminders(database, row.id, { now });
  }
  return written;
}
