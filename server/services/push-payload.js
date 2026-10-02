/**
 * Modul: Web-Push-Darstellung
 * Zweck: Gemeinsames Aussehen der Systembenachrichtigung (Icon, Vibration, Aktion).
 * Abhaengigkeiten: server/utils/i18n.js
 */
import { translate } from '../utils/i18n.js';

/**
 * Chrome fuer Web Push: Vibration, Zeitstempel, Aktion "Oeffnen".
 * ntfy/Gotify lesen nur title/body/url - die Extrafelder bleiben folgenlos.
 */
export function decoratePushPayload(payload, locale, { timestamp } = {}) {
  return {
    ...payload,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    lang: locale,
    timestamp: timestamp || Date.now(),
    vibrate: payload.vibrate || [200, 80, 200],
    renotify: payload.renotify !== false,
    actions: payload.actions || [
      { action: 'open', title: translate(locale, 'reminders.pushOpenAction') },
    ],
  };
}
