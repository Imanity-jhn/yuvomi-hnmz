/**
 * Modul: Kinder-Routinen (Morgen/Abend)
 * Zweck: Pro Haushaltsmitglied eine Bilderleiste fuer den Morgen und eine fuer
 *        den Abend. Abhaken gilt nur fuer den heutigen Haushaltstag und faellt
 *        um Mitternacht von selbst zurueck - keine Aufgaben, keine Punkte.
 * Abhaengigkeiten: express, server/db.js, household-members, timezone
 *
 * KEIN EIGENES BERECHTIGUNGS-MODUL. Die Flaeche haengt am Wand-Modus, die
 * Einrichtung an den Einstellungen. Ein Display darf die Tafel LESEN und eine
 * benannte Person abhaken; anlegen darf nur ein angemeldetes Mitglied.
 */

import express from 'express';
import * as db from '../db.js';
import { str, oneOf, id as idField, bool, collectErrors } from '../middleware/validate.js';
import { householdMemberSql, isHouseholdMember, nonMemberMessage } from '../services/household-members.js';
import { isDisplayRequest } from '../services/display-acting.js';
import { todayKey } from '../utils/timezone.js';
import { dataUrlContentMatches } from '../utils/file-signature.js';

const router = express.Router();

const PERIODS = ['morning', 'evening'];
const ICON_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ICON_NAME_LENGTH = 48;
const MAX_STEPS_PER_PERIOD = 12;
const MAX_STEP_IMAGE_LENGTH = 768 * 1024;
const MAX_WALLPAPER_LENGTH = 1_572_864;
const IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i;

function iconName(value, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) return { value: null, error: 'Icon name is required.' };
    return { value: null, error: null };
  }
  if (typeof value !== 'string') return { value: null, error: 'Icon name must be a string.' };
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) return { value: null, error: 'Icon name is required.' };
    return { value: null, error: null };
  }
  if (trimmed.length > MAX_ICON_NAME_LENGTH) return { value: null, error: 'Icon name is too long.' };
  if (!ICON_NAME_RE.test(trimmed)) {
    return { value: null, error: 'Icon name must contain only lowercase letters, digits, and hyphens.' };
  }
  return { value: trimmed, error: null };
}

function imageData(value, { max = MAX_STEP_IMAGE_LENGTH } = {}) {
  if (value === undefined) return { value: undefined, error: null };
  if (value === null || value === '') return { value: null, error: null };
  if (typeof value !== 'string') return { value: null, error: 'Image must be a data URL string.' };
  const trimmed = value.trim();
  if (trimmed.length > max) return { value: null, error: 'Image is too large.' };
  if (!IMAGE_RE.test(trimmed)) return { value: null, error: 'Image must be PNG, JPEG, or WebP.' };
  if (!dataUrlContentMatches(trimmed)) {
    return { value: null, error: 'Image content does not match its image type.' };
  }
  return { value: trimmed, error: null };
}

function sendStoredImage(res, dataUrl) {
  if (!dataUrl) return res.status(404).json({ error: 'No image available.', code: 404 });
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return res.status(415).json({ error: 'Stored image is not readable.', code: 415 });
  const buffer = Buffer.from(match[2], 'base64');
  res.setHeader('Content-Type', match[1] === 'image/jpg' ? 'image/jpeg' : match[1]);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.end(buffer);
}

function loadPerson(database, userId) {
  return database.prepare(`
    SELECT u.id
      FROM users u
     WHERE u.id = ? AND ${householdMemberSql('u')}
  `).get(userId);
}

function loadWallpaper(database, userId) {
  return database.prepare(`
    SELECT b.wallpaper_data
      FROM users u
      LEFT JOIN routine_boards b ON b.user_id = u.id
     WHERE u.id = ? AND ${householdMemberSql('u')}
  `).get(userId);
}

function refuseDisplayEdit(req, res) {
  if (!isDisplayRequest(req)) return false;
  res.status(403).json({ error: 'A display cannot edit routines.', code: 403 });
  return true;
}

function asBool(value) {
  return value === true || value === 1 || value === '1';
}

function stepPublic(row) {
  if (!row) return row;
  const { image_data: _hidden, ...rest } = row;
  return {
    ...rest,
    has_image: Boolean(row.image_data),
    image_rev: row.image_data ? String(row.image_data).length : 0,
    show_title: asBool(row.show_title),
  };
}

function memberPeople(database) {
  return database.prepare(`
    SELECT u.id, u.display_name, u.avatar_color, u.avatar_data,
           CASE WHEN b.wallpaper_data IS NULL THEN 0 ELSE 1 END AS has_wallpaper,
           CASE WHEN b.wallpaper_data IS NULL THEN 0 ELSE length(b.wallpaper_data) END AS wallpaper_rev
      FROM users u
      LEFT JOIN routine_boards b ON b.user_id = u.id
     WHERE ${householdMemberSql('u')}
     ORDER BY u.display_name COLLATE NOCASE, u.id
  `).all().map((row) => ({
    ...row,
    has_wallpaper: Boolean(row.has_wallpaper),
  }));
}

function actingPerson(req, rawId) {
  if (isDisplayRequest(req)) {
    const userId = rawId == null || rawId === '' ? null : Number(rawId);
    if (!Number.isInteger(userId)) {
      return { ok: false, status: 400, error: 'A person must be named.' };
    }
    if (!isHouseholdMember(userId)) {
      return { ok: false, status: 403, error: nonMemberMessage([userId]) };
    }
    return { ok: true, userId };
  }
  const userId = rawId == null || rawId === '' ? Number(req.authUserId) : Number(rawId);
  if (!Number.isInteger(userId) || !isHouseholdMember(userId)) {
    return { ok: false, status: 403, error: Number.isInteger(userId) ? nonMemberMessage([userId]) : 'Invalid user_id.' };
  }
  return { ok: true, userId };
}

function loadStep(database, stepId) {
  return database.prepare(`
    SELECT s.id, s.user_id, s.period, s.title, s.icon, s.image_data, s.show_title, s.sort_order
      FROM routine_steps s
      JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND ${householdMemberSql('u')}
  `).get(stepId);
}

router.get('/', (req, res) => {
  try {
    const database = db.get();
    const dateKey = todayKey(database);
    const people = memberPeople(database);
    const steps = database.prepare(`
      SELECT s.id, s.user_id, s.period, s.title, s.icon, s.sort_order, s.show_title,
             CASE WHEN s.image_data IS NULL THEN 0 ELSE 1 END AS has_image,
             CASE WHEN s.image_data IS NULL THEN 0 ELSE length(s.image_data) END AS image_rev,
             CASE WHEN c.step_id IS NULL THEN 0 ELSE 1 END AS done_today
        FROM routine_steps s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN routine_completions c
          ON c.step_id = s.id AND c.date_key = ?
       WHERE ${householdMemberSql('u')}
       ORDER BY s.user_id, s.period, s.sort_order, s.id
    `).all(dateKey);
    res.json({
      data: {
        date_key: dateKey,
        people,
        steps: steps.map((row) => ({
          ...row,
          has_image: Boolean(row.has_image),
          done_today: Boolean(row.done_today),
          show_title: asBool(row.show_title),
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

router.get('/steps/:id/image', (req, res) => {
  try {
    const stepId = Number(req.params.id);
    if (!Number.isInteger(stepId) || stepId < 1) {
      return res.status(400).json({ error: 'Invalid step id.', code: 400 });
    }
    const row = loadStep(db.get(), stepId);
    if (!row) return res.status(404).json({ error: 'Not found.', code: 404 });
    return sendStoredImage(res, row.image_data);
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

router.get('/people/:id/wallpaper', (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(400).json({ error: 'Invalid user_id.', code: 400 });
    }
    const row = loadWallpaper(db.get(), userId);
    if (!row) return res.status(404).json({ error: 'Not found.', code: 404 });
    return sendStoredImage(res, row.wallpaper_data);
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

router.put('/people/:id', (req, res) => {
  try {
    if (refuseDisplayEdit(req, res)) return;
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(400).json({ error: 'Invalid user_id.', code: 400 });
    }
    if (!loadPerson(db.get(), userId)) {
      return res.status(404).json({ error: 'Not found.', code: 404 });
    }
    const photo = imageData(req.body?.wallpaper_data, { max: MAX_WALLPAPER_LENGTH });
    if (photo.value === undefined) {
      return res.status(400).json({ error: 'wallpaper_data is required.', code: 400 });
    }
    if (photo.error) return res.status(400).json({ error: photo.error, code: 400 });
    const database = db.get();
    database.prepare(`
      INSERT INTO routine_boards (user_id, wallpaper_data)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET wallpaper_data = excluded.wallpaper_data
    `).run(userId, photo.value);
    const people = memberPeople(database);
    res.json({ data: people.find((p) => Number(p.id) === userId) });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

router.post('/steps', (req, res) => {
  try {
    if (refuseDisplayEdit(req, res)) return;
    const userId = idField(req.body?.user_id, 'user_id');
    const period = oneOf(req.body?.period, PERIODS, 'period');
    if (!period.error && !period.value) period.error = 'period is required.';
    const title = str(req.body?.title, 'title', { max: 80 });
    const photo = imageData(req.body?.image_data);
    const icon = iconName(req.body?.icon, { required: !photo.value });
    const showTitle = req.body?.show_title === undefined
      ? { value: false, error: null }
      : bool(req.body.show_title, 'show_title');
    const errors = collectErrors([userId, period, title, icon, photo, showTitle]);
    if (errors.length) return res.status(400).json({ error: errors[0], code: 400 });
    if (!isHouseholdMember(userId.value)) {
      return res.status(403).json({ error: nonMemberMessage([userId.value]), code: 403 });
    }
    const database = db.get();
    const count = database.prepare(
      'SELECT COUNT(*) AS n FROM routine_steps WHERE user_id = ? AND period = ?',
    ).get(userId.value, period.value).n;
    if (count >= MAX_STEPS_PER_PERIOD) {
      return res.status(400).json({ error: `At most ${MAX_STEPS_PER_PERIOD} steps per period.`, code: 400 });
    }
    const nextOrder = database.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM routine_steps WHERE user_id = ? AND period = ?',
    ).get(userId.value, period.value).n;
    const result = database.prepare(`
      INSERT INTO routine_steps (user_id, period, title, icon, image_data, show_title, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId.value,
      period.value,
      title.value,
      icon.value || 'image',
      photo.value ?? null,
      showTitle.value ? 1 : 0,
      nextOrder,
    );
    const row = loadStep(database, result.lastInsertRowid);
    res.status(201).json({ data: { ...stepPublic(row), done_today: false } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

router.patch('/steps/:id', (req, res) => {
  try {
    if (refuseDisplayEdit(req, res)) return;
    const stepId = Number(req.params.id);
    const database = db.get();
    const existing = loadStep(database, stepId);
    if (!existing) return res.status(404).json({ error: 'Not found.', code: 404 });
    const title = req.body?.title === undefined
      ? { value: existing.title, error: null }
      : str(req.body.title, 'title', { max: 80 });
    const photo = req.body?.image_data === undefined
      ? { value: existing.image_data ?? null, error: null }
      : imageData(req.body.image_data);
    const icon = req.body?.icon === undefined
      ? { value: existing.icon, error: null }
      : iconName(req.body.icon, { required: !photo.value });
    const showTitle = req.body?.show_title === undefined
      ? { value: asBool(existing.show_title), error: null }
      : bool(req.body.show_title, 'show_title');
    const errors = collectErrors([title, icon, photo, showTitle]);
    if (errors.length) return res.status(400).json({ error: errors[0], code: 400 });
    database.prepare('UPDATE routine_steps SET title = ?, icon = ?, image_data = ?, show_title = ? WHERE id = ?')
      .run(
        title.value,
        icon.value || existing.icon || 'image',
        photo.value ?? null,
        showTitle.value ? 1 : 0,
        stepId,
      );
    const row = loadStep(database, stepId);
    res.json({ data: stepPublic(row) });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

router.delete('/steps/:id', (req, res) => {
  try {
    if (refuseDisplayEdit(req, res)) return;
    const stepId = Number(req.params.id);
    const existing = loadStep(db.get(), stepId);
    if (!existing) return res.status(404).json({ error: 'Not found.', code: 404 });
    db.get().prepare('DELETE FROM routine_steps WHERE id = ?').run(stepId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

router.put('/steps/order', (req, res) => {
  try {
    if (refuseDisplayEdit(req, res)) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
    if (!ids.length || ids.some((n) => !Number.isInteger(n) || n < 1)) {
      return res.status(400).json({ error: 'ids must be a list of step ids.', code: 400 });
    }
    const database = db.get();
    const tx = database.transaction(() => {
      ids.forEach((stepId, index) => {
        const existing = loadStep(database, stepId);
        if (!existing) return;
        database.prepare('UPDATE routine_steps SET sort_order = ? WHERE id = ?').run(index, stepId);
      });
    });
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

router.post('/steps/:id/done', (req, res) => {
  try {
    const actor = actingPerson(req, req.body?.user_id ?? req.body?.done_by_user_id ?? req.query?.user_id);
    if (!actor.ok) return res.status(actor.status).json({ error: actor.error, code: actor.status });
    const stepId = Number(req.params.id);
    const database = db.get();
    const step = loadStep(database, stepId);
    if (!step) return res.status(404).json({ error: 'Not found.', code: 404 });
    const dateKey = todayKey(database);
    database.prepare(`
      INSERT INTO routine_completions (step_id, date_key, done_by_user_id)
      VALUES (?, ?, ?)
      ON CONFLICT(step_id, date_key) DO UPDATE SET done_by_user_id = excluded.done_by_user_id
    `).run(stepId, dateKey, actor.userId);
    res.json({ data: { ...stepPublic(step), done_today: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

router.delete('/steps/:id/done', (req, res) => {
  try {
    const actor = actingPerson(req, req.body?.user_id ?? req.body?.done_by_user_id ?? req.query?.user_id);
    if (!actor.ok) return res.status(actor.status).json({ error: actor.error, code: actor.status });
    const stepId = Number(req.params.id);
    const database = db.get();
    const step = loadStep(database, stepId);
    if (!step) return res.status(404).json({ error: 'Not found.', code: 404 });
    database.prepare('DELETE FROM routine_completions WHERE step_id = ? AND date_key = ?')
      .run(stepId, todayKey(database));
    res.json({ data: { ...stepPublic(step), done_today: false } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 500 });
  }
});

export default router;
export { MAX_STEPS_PER_PERIOD };
