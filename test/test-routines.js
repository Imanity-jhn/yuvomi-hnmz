/**
 * Modul: Kinder-Routinen (API + Display-Grenzen)
 * Zweck: Morgen/Abend-Schritte anlegen, fuer heute abhaken, Display darf nur
 *        den Tipp - nicht das Einrichten. Abhaken gilt nur fuer den Haushaltstag.
 * Ausfuehren: npm run test:routines
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer, cookieHeader } from './server-ready.js';

const { baseUrl: BASE } = await startTestServer({
  name: 'routines',
  env: {
    SESSION_SECRET: 'test-routines-secret-min32chars-xx',
    RATE_LIMIT_MAX_ATTEMPTS: '40',
    RATE_LIMIT_WINDOW_MS: '60000',
  },
});
const dbmod = await import('../server/db.js');
const db = dbmod.get();
const { todayKey } = await import('../server/utils/timezone.js');
const { DISPLAY_COOKIE } = await import('../server/services/display-accounts.js');

await fetch(`${BASE}/api/v1/auth/setup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', display_name: 'Admin', password: 'adminpass123' }),
});

async function login(username, password) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 200, `login ${username}`);
  const cookie = cookieHeader(res.headers.get('set-cookie'));
  const me = await (await fetch(`${BASE}/api/v1/auth/me`, { headers: { Cookie: cookie } })).json();
  return { cookie, csrfToken: me.csrfToken };
}

function as(session) {
  const headers = { 'Content-Type': 'application/json', Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken };
  return async (method, path, body) => {
    const res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

function asDisplay(token) {
  const jar = new Map([[DISPLAY_COOKIE, token]]);
  let csrf = null;
  const send = async (method, path, body) => {
    const headers = {
      'Content-Type': 'application/json',
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    };
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    const fresh = res.headers.get('x-csrf-token');
    if (fresh) csrf = fresh;
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return async (method, path, body) => {
    if (!csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method)) await send('GET', '/preferences');
    return send(method, path, body);
  };
}

const adminSession = await login('admin', 'adminpass123');
const admin = as(adminSession);

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TOO_BIG = `${TINY_PNG}${'A'.repeat(768 * 1024)}`;

const createdDisplay = await admin('POST', '/displays', { display_name: 'Couloir' });
const displayId = createdDisplay.body.data.id;
const issued = await admin('POST', `/displays/${displayId}/pairing-code`, {});
const paired = await fetch(`${BASE}/api/v1/displays/pair`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: issued.body.data.code }),
});
const displayToken = decodeURIComponent(
  String(paired.headers.get('set-cookie') || '').match(new RegExp(`${DISPLAY_COOKIE}=([^;]+)`))[1],
);
const display = asDisplay(displayToken);

function addMember(username, name) {
  return Number(db.prepare(`
    INSERT INTO users(username, display_name, password_hash, role, family_role)
    VALUES (?, ?, '$argon2id$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA', 'member', 'child') RETURNING id
  `).get(username, name).id);
}

const LEA = addMember('lea', 'Lea');
const WORKER = Number(db.prepare(`
  INSERT INTO users(username, display_name, password_hash, role)
  VALUES ('worker', 'Aide', '$argon2id$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA', 'member') RETURNING id
`).get().id);
db.prepare('INSERT INTO housekeeping_workers (user_id, daily_rate) VALUES (?, 0)').run(WORKER);

test('die Mitgliederliste der Routine ist die Haushaltsliste', async () => {
  const res = await admin('GET', '/routines');
  assert.equal(res.status, 200);
  const ids = res.body.data.people.map((p) => p.id);
  assert.ok(ids.includes(LEA));
  assert.ok(!ids.includes(WORKER));
  assert.ok(!ids.includes(displayId));
});

test('ein Mitglied legt Morgen- und Abendschritte an', async () => {
  const morning = await admin('POST', '/routines/steps', {
    user_id: LEA, period: 'morning', title: 'Se lever', icon: 'alarm-clock',
  });
  assert.equal(morning.status, 201, morning.body?.error);
  const evening = await admin('POST', '/routines/steps', {
    user_id: LEA, period: 'evening', title: 'Se coucher', icon: 'moon',
  });
  assert.equal(evening.status, 201);
  const list = await admin('GET', '/routines');
  const mine = list.body.data.steps.filter((s) => s.user_id === LEA);
  assert.equal(mine.length, 2);
  assert.equal(mine.every((s) => s.done_today === false), true);
});

test('Personal bekommt keine Tafel', async () => {
  const res = await admin('POST', '/routines/steps', {
    user_id: WORKER, period: 'morning', title: 'Non', icon: 'x',
  });
  assert.equal(res.status, 403);
});

test('das Tablett liest die Tafel, darf sie aber nicht umbauen', async () => {
  const list = await display('GET', '/routines');
  assert.equal(list.status, 200);
  const step = list.body.data.steps.find((s) => s.user_id === LEA && s.period === 'morning');
  assert.ok(step);
  assert.equal((await display('POST', '/routines/steps', {
    user_id: LEA, period: 'morning', title: 'Secret', icon: 'star',
  })).status, 403);
  assert.equal((await display('PATCH', `/routines/steps/${step.id}`, { title: 'X' })).status, 403);
  assert.equal((await display('DELETE', `/routines/steps/${step.id}`)).status, 403);
});

test('das Tablett hakt ab, wenn das Kind benannt ist', async () => {
  const list = await admin('GET', '/routines');
  const step = list.body.data.steps.find((s) => s.user_id === LEA && s.period === 'morning');
  assert.equal((await display('POST', `/routines/steps/${step.id}/done`)).status, 400);
  const done = await display('POST', `/routines/steps/${step.id}/done`, { user_id: LEA });
  assert.equal(done.status, 200, done.body?.error);
  assert.equal(done.body.data.done_today, true);
  const after = await display('GET', '/routines');
  assert.equal(after.body.data.steps.find((s) => s.id === step.id).done_today, true);
});

test('ein Tipp von gestern zaehlt heute nicht', async () => {
  const list = await admin('GET', '/routines');
  const step = list.body.data.steps.find((s) => s.user_id === LEA && s.period === 'evening');
  const today = todayKey(db);
  db.prepare(`
    INSERT INTO routine_completions (step_id, date_key, done_by_user_id)
    VALUES (?, '1999-01-01', ?)
  `).run(step.id, LEA);
  const shown = await admin('GET', '/routines');
  assert.equal(shown.body.data.date_key, today);
  assert.equal(shown.body.data.steps.find((s) => s.id === step.id).done_today, false);
});

test('das Tablett darf den Tipp zuruecknehmen', async () => {
  const list = await admin('GET', '/routines');
  const step = list.body.data.steps.find((s) => s.user_id === LEA && s.period === 'morning');
  const undo = await display('DELETE', `/routines/steps/${step.id}/done?user_id=${LEA}`);
  assert.equal(undo.status, 200, undo.body?.error);
  assert.equal(undo.body.data.done_today, false);
});

test('hoechstens zwoelf Schritte je Zeitraum', async () => {
  for (let i = 0; i < 12; i += 1) {
    const res = await admin('POST', '/routines/steps', {
      user_id: LEA, period: 'evening', title: `Schritt ${i}`, icon: 'star',
    });
    if (i === 0) assert.equal(res.status, 201, res.body?.error);
  }
  const extra = await admin('POST', '/routines/steps', {
    user_id: LEA, period: 'evening', title: 'Zu viel', icon: 'star',
  });
  assert.equal(extra.status, 400);
});

test('ein Foto gehoert zur Liste nur als Flagge, nie als Data-URL', async () => {
  const created = await admin('POST', '/routines/steps', {
    user_id: LEA, period: 'morning', title: 'Dessin', image_data: TINY_PNG,
  });
  assert.equal(created.status, 201, created.body?.error);
  assert.equal(created.body.data.has_image, true);
  assert.equal(created.body.data.image_data, undefined);
  assert.equal(created.body.data.show_title, false);
  const list = await admin('GET', '/routines');
  const step = list.body.data.steps.find((s) => s.id === created.body.data.id);
  assert.equal(step.has_image, true);
  assert.equal(step.image_data, undefined);
  assert.ok(step.image_rev > 0);
  assert.equal(step.show_title, false);
});

test('der Titel auf der Tafel ist optional und aus', async () => {
  const created = await admin('POST', '/routines/steps', {
    user_id: LEA, period: 'morning', title: 'Zaehne', icon: 'smile',
  });
  assert.equal(created.status, 201, created.body?.error);
  assert.equal(created.body.data.show_title, false);
  const shown = await admin('PATCH', `/routines/steps/${created.body.data.id}`, { show_title: true });
  assert.equal(shown.status, 200, shown.body?.error);
  assert.equal(shown.body.data.show_title, true);
  const list = await admin('GET', '/routines');
  const step = list.body.data.steps.find((s) => s.id === created.body.data.id);
  assert.equal(step.show_title, true);
});

test('das Tablett liest das Schritt-Foto, darf den Hintergrund aber nicht setzen', async () => {
  const list = await admin('GET', '/routines');
  const step = list.body.data.steps.find((s) => s.has_image && s.user_id === LEA);
  assert.ok(step);
  const photo = await fetch(`${BASE}/api/v1/routines/steps/${step.id}/image`, {
    headers: { Cookie: `${DISPLAY_COOKIE}=${displayToken}` },
  });
  assert.equal(photo.status, 200);
  assert.match(photo.headers.get('content-type') || '', /image\/png/i);
  const buf = Buffer.from(await photo.arrayBuffer());
  assert.ok(buf.length > 8);
  assert.equal(buf[0], 0x89);

  const blocked = await display('PUT', `/routines/people/${LEA}`, { wallpaper_data: TINY_PNG });
  assert.equal(blocked.status, 403);

  const set = await admin('PUT', `/routines/people/${LEA}`, { wallpaper_data: TINY_PNG });
  assert.equal(set.status, 200, set.body?.error);
  assert.equal(set.body.data.has_wallpaper, true);
  assert.equal(set.body.data.wallpaper_data, undefined);
  const paper = await fetch(`${BASE}/api/v1/routines/people/${LEA}/wallpaper`, {
    headers: { Cookie: `${DISPLAY_COOKIE}=${displayToken}` },
  });
  assert.equal(paper.status, 200);
  assert.match(paper.headers.get('content-type') || '', /image\/png/i);
});

test('ein zu grosses Foto wird abgewiesen', async () => {
  const res = await admin('POST', '/routines/steps', {
    user_id: LEA, period: 'morning', title: 'Riesig', image_data: TOO_BIG,
  });
  assert.equal(res.status, 400);
});

test('ein Foto laesst sich wieder entfernen', async () => {
  const list = await admin('GET', '/routines');
  const step = list.body.data.steps.find((s) => s.has_image && s.user_id === LEA);
  assert.ok(step);
  const cleared = await admin('PATCH', `/routines/steps/${step.id}`, { image_data: null });
  assert.equal(cleared.status, 200, cleared.body?.error);
  assert.equal(cleared.body.data.has_image, false);
});
