/**
 * Modul: Sofort-Push bei Termin-Zuweisung
 * Zweck: Wie die Aufgaben-Zuweisung: wer neu auf einem Termin steht, bekommt
 *        eine Systembenachrichtigung sofort - nicht erst beim Erinnerungs-Zeitpunkt.
 * Abhaengigkeiten: push, i18n, Rechte, Sichtbarkeit
 */
import { createLogger } from '../logger.js';
import * as db from '../db.js';
import { resolvePermissions } from '../permissions.js';
import { visibilityWhere } from './visibility.js';
import { pushService } from './push.js';
import { decoratePushPayload } from './push-payload.js';
import { resolveHouseholdFormats, translate } from '../utils/i18n.js';

const log = createLogger('Calendar');

function findVisibleEvent(id, me) {
  return db.get().prepare(`
    SELECT e.id, e.title, e.created_by FROM calendar_events e
    WHERE e.id = ? AND ${visibilityWhere('e', 'event_assignments', 'event_id')}
  `).get(id, me, me);
}

/**
 * Sofort-Push an neu zugewiesene Personen - nach der Antwort, wie bei Aufgaben.
 * Die Erinnerung zum Termin selbst laeuft weiter ueber reminders + Scheduler.
 */
export function notifyNewEventAssignees(event, addedIds, actorId) {
  if (!event || !addedIds?.length) return;
  const { locale } = resolveHouseholdFormats(db.get());
  const actorName = db.get().prepare('SELECT display_name FROM users WHERE id = ?')
    .get(actorId)?.display_name;
  for (const id of addedIds) {
    if (id === actorId) continue;
    if (!findVisibleEvent(event.id, id)) continue;
    const target = db.get().prepare('SELECT id, role, family_role FROM users WHERE id = ?').get(id);
    if (!target) continue;
    const perms = resolvePermissions(db.get(), target);
    if (!perms.admin && perms.modules?.calendar === 'none') continue;
    const body = actorName
      ? translate(locale, 'reminders.pushEventAssignedBody', { name: actorName, title: event.title })
      : translate(locale, 'reminders.pushEventAssignedBodyNoName', { title: event.title });
    pushService.sendPushToUser(id, decoratePushPayload({
      title: translate(locale, 'reminders.pushEventAssignedTitle'),
      body,
      url: `/calendar?open=${event.id}`,
      tag: `event-assigned-${event.id}`,
    }, locale)).catch((err) => log.warn('Termin-Zuweisungs-Push fehlgeschlagen:', err?.message || err));
  }
}
