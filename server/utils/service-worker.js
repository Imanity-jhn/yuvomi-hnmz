/**
 * Modul: Service-Worker-Antwort erzeugen
 * Zweck: Eine deployment-spezifische, scriptsichere Cache-Revision in sw.js einsetzen.
 */

import { readFileSync, statSync } from 'node:fs';

const BUILD_REVISION_TOKEN = '__YUVOMI_BUILD_REVISION__';
const SAFE_BUILD_REVISION = /^[A-Za-z0-9._-]{1,80}$/;

export function renderServiceWorkerSource(source, buildRevision) {
  const revision = String(buildRevision || '').trim();
  if (!SAFE_BUILD_REVISION.test(revision)) {
    throw new Error(
      `[SW] APP_BUILD_REVISION must match /^[A-Za-z0-9._-]{1,80}$/ (got ${JSON.stringify(revision)}).`,
    );
  }
  return String(source).replaceAll(BUILD_REVISION_TOKEN, revision);
}

export function buildServiceWorkerResponse(source, { appVersion, buildRevision } = {}) {
  const revision = String(buildRevision || '').trim() || appVersion;
  return {
    body: renderServiceWorkerSource(source, revision),
    contentType: 'text/javascript; charset=utf-8',
    cacheControl: 'no-store, max-age=0',
    cdnCacheControl: 'no-store',
    cloudflareCdnCacheControl: 'no-store',
  };
}

export function createServiceWorkerResponseLoader(sourcePath, options) {
  let cachedMtimeMs;
  let cachedResponse;

  return function loadServiceWorkerResponse() {
    const mtimeMs = statSync(sourcePath).mtimeMs;
    if (cachedMtimeMs !== mtimeMs) {
      const source = readFileSync(sourcePath, 'utf8');
      const envRev = String(options.buildRevision || '').trim();
      // Ohne Deploy-SHA (Bind-Mount) wuerde die Revision auf der App-Version
      // kleben: der Worker aendert sich, CACHE_RELEASE nicht, das Tablett
      // behielt die alte Shell. Die Dateizeit dreht sie mit jeder sw.js-Aenderung.
      const stamp = String(Math.floor(mtimeMs / 1000));
      const mixed = envRev ? `${envRev}-${stamp}` : `${options.appVersion}-${stamp}`;
      cachedResponse = buildServiceWorkerResponse(source, {
        ...options,
        buildRevision: mixed.length <= 80 ? mixed : (envRev || String(options.appVersion)),
      });
      cachedMtimeMs = mtimeMs;
    }
    return cachedResponse;
  };
}
