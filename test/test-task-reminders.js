/**
 * Test: automatische Aufgaben-Erinnerungen (Faelligkeit + J-3) und Fan-out.
 *
 * Ausfuehren: node --experimental-sqlite --test test/test-task-reminders.js
 */

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert/strict';

const dbmod = await import('../server/db.js');
const {
  fanOutTaskReminders,
  dropInheritedTaskReminders,
  syncTaskAutoReminders,
  TASK_DUE_LEAD_DAYS,
} = await import('../server/services/task-reminders.js');
const { setEventAssignments } = await import('../server/routes/calendar/helpers.js');
const database = dbmod.get();

const mkUser = (name) => database
  .prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, 'x', 'member')")
  .run(name, name).lastInsertRowid;

const ANNA = mkUser('anna');
const BEN  = mkUser('ben');

function newTask({ assignees = [], dueDate = '2099-06-15', dueTime = '18:00', status = 'open' } = {}) {
  const id = database.prepare(`
    INSERT INTO tasks (title, due_date, due_time, status, created_by, visibility)
    VALUES ('Muell', ?, ?, ?, ?, 'all')
  `).run(dueDate, dueTime, status, ANNA).lastInsertRowid;
  const ins = database.prepare('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)');
  for (const uid of assignees) ins.run(id, uid);
  return id;
}

const autosOf = (taskId, userId) => database.prepare(`
  SELECT remind_at, assigned_from FROM reminders
  WHERE entity_type = 'task' AND entity_id = ? AND created_by = ?
    AND assigned_from IS NOT NULL AND assigned_from = created_by
  ORDER BY remind_at ASC
`).all(taskId, userId);

test('Zustaendige bekommen Faelligkeit und J-3', () => {
  const id = newTask({ assignees: [ANNA, BEN], dueDate: '2099-06-15', dueTime: '18:00' });
  const written = syncTaskAutoReminders(database, id, { now: new Date('2099-06-01T10:00:00Z') });
  assert.ok(written >= 2);
  const bens = autosOf(id, BEN);
  assert.equal(bens.length, 2, 'J-3 und Faelligkeit');
  assert.equal(TASK_DUE_LEAD_DAYS, 3);
  assert.ok(bens[0].remind_at.startsWith('2099-06-12'));
  assert.ok(bens[1].remind_at.startsWith('2099-06-15'));
  assert.equal(bens[0].assigned_from, BEN);
});

test('kein J-3 wenn die Faelligkeit in weniger als 3 Tagen liegt', () => {
  const id = newTask({ assignees: [BEN], dueDate: '2099-06-02', dueTime: '18:00' });
  syncTaskAutoReminders(database, id, { now: new Date('2099-06-01T10:00:00Z') });
  const bens = autosOf(id, BEN);
  assert.equal(bens.length, 1, 'nur die Faelligkeit, nicht der Vorlauf');
  assert.ok(bens[0].remind_at.startsWith('2099-06-02'));
});

test('ohne Faelligkeit keine Auto-Erinnerung', () => {
  const id = newTask({ assignees: [BEN], dueDate: null, dueTime: null });
  database.prepare('UPDATE tasks SET due_date = NULL, due_time = NULL WHERE id = ?').run(id);
  syncTaskAutoReminders(database, id, { now: new Date('2099-06-01T10:00:00Z') });
  assert.equal(autosOf(id, BEN).length, 0);
});

test('Wer nicht mehr zugewiesen ist, verliert geerbte und Auto-Zeilen', () => {
  const id = newTask({ assignees: [ANNA, BEN], dueDate: '2099-06-15', dueTime: '18:00' });
  database.prepare(`
    INSERT INTO reminders (entity_type, entity_id, remind_at, created_by, assigned_from)
    VALUES ('task', ?, '2099-06-14T10:00:00Z', ?, ?)
  `).run(id, ANNA, null);
  fanOutTaskReminders(database, id, ANNA);
  syncTaskAutoReminders(database, id, { now: new Date('2099-06-01T10:00:00Z') });
  assert.ok(autosOf(id, BEN).length > 0);
  assert.ok(database.prepare(
    "SELECT COUNT(*) n FROM reminders WHERE entity_type='task' AND entity_id=? AND created_by=? AND assigned_from=?"
  ).get(id, BEN, ANNA).n >= 1);

  dropInheritedTaskReminders(database, id, [BEN]);
  assert.equal(database.prepare(
    "SELECT COUNT(*) n FROM reminders WHERE entity_type='task' AND entity_id=? AND created_by=?"
  ).get(id, BEN).n, 0);
});

test('eine selbst gesetzte Erinnerung an derselben Uhrzeit verhindert das Auto-Duplikat', () => {
  const id = newTask({ assignees: [BEN], dueDate: '2099-06-15', dueTime: '18:00' });
  syncTaskAutoReminders(database, id, { now: new Date('2099-06-01T10:00:00Z') });
  const dueAt = autosOf(id, BEN).find((r) => r.remind_at.startsWith('2099-06-15')).remind_at;
  dropInheritedTaskReminders(database, id, [BEN]);
  database.prepare(`
    INSERT INTO reminders (entity_type, entity_id, remind_at, created_by, assigned_from)
    VALUES ('task', ?, ?, ?, NULL)
  `).run(id, dueAt, BEN);
  syncTaskAutoReminders(database, id, { now: new Date('2099-06-01T10:00:00Z') });
  const dues = database.prepare(`
    SELECT remind_at FROM reminders
    WHERE entity_type='task' AND entity_id=? AND created_by=? AND remind_at = ?
  `).all(id, BEN, dueAt);
  assert.equal(dues.length, 1, 'kein zweites Exemplar derselben Uhrzeit');
});

test('erledigte Aufgabe raeumt Auto-Erinnerungen weg', () => {
  const id = newTask({ assignees: [BEN], dueDate: '2099-06-15', dueTime: '18:00' });
  syncTaskAutoReminders(database, id, { now: new Date('2099-06-01T10:00:00Z') });
  assert.ok(autosOf(id, BEN).length > 0);
  database.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(id);
  syncTaskAutoReminders(database, id, { now: new Date('2099-06-01T10:00:00Z') });
  assert.equal(autosOf(id, BEN).length, 0);
});

test('setEventAssignments bleibt der Termin-Weg', () => {
  const eventId = database.prepare(`
    INSERT INTO calendar_events (title, start_datetime, end_datetime, created_by, visibility)
    VALUES ('Zahnarzt', '2099-09-01T10:00:00', '2099-09-01T11:00:00', ?, 'all')
  `).run(ANNA).lastInsertRowid;
  database.prepare(`
    INSERT INTO reminders (entity_type, entity_id, remind_at, created_by)
    VALUES ('event', ?, '2099-08-31T10:00:00', ?)
  `).run(eventId, ANNA);
  setEventAssignments(database, eventId, [ANNA, BEN]);
  assert.equal(database.prepare(
    "SELECT COUNT(*) n FROM reminders WHERE entity_type='event' AND entity_id=? AND created_by=?"
  ).get(eventId, BEN).n, 1);
});
