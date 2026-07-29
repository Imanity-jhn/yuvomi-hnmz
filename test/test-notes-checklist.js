/**
 * Test: Interactive note checklists (HNMZ)
 * - toggleChecklistItem pure helper
 * - renderMarkdownLight interactive mode
 * - PATCH /notes/:id/checklist
 */

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { toggleChecklistItem, renderMarkdownLight, continueChecklistEnter } from '../public/utils/html.js';

test('continueChecklistEnter continues and exits checklist lines', () => {
  const cont = continueChecklistEnter('- [ ] milk', '- [ ] milk'.length);
  assert.equal(cont.value, '- [ ] milk\n- [ ] ');
  assert.equal(cont.selectionStart, cont.value.length);

  const mid = continueChecklistEnter('- [x] hello world', '- [x] hello'.length);
  assert.equal(mid.value, '- [x] hello\n- [ ] world');
  assert.equal(mid.selectionStart, '- [x] hello\n- [ ] '.length);

  const exit = continueChecklistEnter('- [ ] milk\n- [ ] ', '- [ ] milk\n- [ ] '.length);
  assert.equal(exit.value, '- [ ] milk\n');
  assert.equal(exit.selectionStart, '- [ ] milk\n'.length);

  assert.equal(continueChecklistEnter('- plain list', 5), null);
  assert.equal(continueChecklistEnter('1. ordered', 5), null);
  assert.equal(continueChecklistEnter('no list', 3), null);
});

test('notes.js wires checklist Enter continuation', async () => {
  const src = await (await import('node:fs/promises')).readFile(
    new URL('../public/pages/notes.js', import.meta.url),
    'utf8',
  );
  assert.match(src, /continueChecklistEnter/);
  assert.match(src, /e\.key === 'Enter'/);
});

test('toggleChecklistItem flips and forces state', () => {
  const src = '- [ ] milk\n- [x] bread\nplain';
  const a = toggleChecklistItem(src, 0);
  assert.equal(a.checked, true);
  assert.match(a.content, /^- \[x\] milk$/m);
  const b = toggleChecklistItem(a.content, 1, false);
  assert.equal(b.checked, false);
  assert.match(b.content, /^- \[ \] bread$/m);
  assert.equal(toggleChecklistItem(src, 9), null);
  assert.equal(toggleChecklistItem(src, -1), null);
});

test('renderMarkdownLight interactive emits checkbox controls', () => {
  const html = renderMarkdownLight('- [ ] one\n- [x] two', { interactive: true });
  assert.match(html, /data-action="toggle-check"/);
  assert.match(html, /aria-checked="false"/);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /note-md-check--interactive/);
  const plain = renderMarkdownLight('- [ ] one');
  assert.doesNotMatch(plain, /toggle-check/);
});

const dbmod = await import('../server/db.js');
const { default: notesRouter } = await import('../server/routes/notes.js');
const db = dbmod.get();

const U = db.prepare(
  `INSERT INTO users (username, display_name, password_hash, role) VALUES ('u','Uli','x','member')`,
).run().lastInsertRowid;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.authUserId = U;
  req.authRole = 'member';
  req.session = { userId: U, role: 'member' };
  next();
});
app.use('/', notesRouter);
const server = app.listen(0);
const baseUrl = await new Promise((r) =>
  server.on('listening', () => r(`http://127.0.0.1:${server.address().port}`)),
);

async function call(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' }: undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

test('PATCH /:id/checklist toggles markdown task items', async () => {
  const created = await call('POST', '/', {
    content: 'Todo:\n- [ ] alpha\n- [ ] beta',
    title: 'List',
  });
  assert.equal(created.status, 201);
  const id = created.body.data.id;

  const r1 = await call('PATCH', `/${id}/checklist`, { index: 0, checked: true });
  assert.equal(r1.status, 200);
  assert.match(r1.body.data.content, /^- \[x\] alpha$/m);
  assert.match(r1.body.data.content, /^- \[ \] beta$/m);

  const r2 = await call('PATCH', `/${id}/checklist`, { index: 1 });
  assert.equal(r2.status, 200);
  assert.match(r2.body.data.content, /^- \[x\] beta$/m);

  const bad = await call('PATCH', `/${id}/checklist`, { index: 99 });
  assert.equal(bad.status, 400);

  const missing = await call('PATCH', '/99999/checklist', { index: 0 });
  assert.equal(missing.status, 404);
});

test('notes.js wires interactive checklist handlers', async () => {
  const src = await (await import('node:fs/promises')).readFile(
    new URL('../public/pages/notes.js', import.meta.url),
    'utf8',
  );
  assert.match(src, /toggleNoteChecklistItem/);
  assert.match(src, /handleChecklistClick/);
  assert.match(src, /interactive:\s*true/);
  assert.match(src, /\/notes\/\$\{noteId\}\/checklist/);
});

test.after(() => server.close());
