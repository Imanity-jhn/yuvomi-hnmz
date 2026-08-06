/**
 * Modul: Test-Infrastruktur - Suite-Registry-Guard
 * Zweck: Jede Suite läuft wirklich. Beim Docs-Audit 2026-08-05 lagen fünf
 *        Suiten mit test:-Script vor, hingen aber nicht in der npm-test-Kette
 *        und liefen damit monatelang weder lokal (npm test) noch in CI - eine
 *        davon war still verrottet. Dieser Guard schließt genau dieses Loch:
 *        (1) jedes test:*-Script hängt in der test-Kette, (2) jede
 *        test/test-*.js-Datei wird von einem Script referenziert.
 * Ausführen: node --test test/test-suite-chain.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const chain = pkg.scripts.test;
const suiteScripts = Object.keys(pkg.scripts).filter((k) => k.startsWith('test:'));

test('jedes test:*-Script hängt in der npm-test-Kette', () => {
  // Die Kette ruft Suiten entweder als `npm run test:x` oder inlined sie als
  // direktes node-Kommando - dann genügt der Testdatei-Pfad als Nachweis.
  const missing = suiteScripts.filter((name) => {
    if (chain.includes(`npm run ${name}`)) return false;
    const file = pkg.scripts[name].match(/test\/[\w.-]+\.js/)?.[0];
    return !(file && chain.includes(file));
  });
  assert.deepEqual(
    missing,
    [],
    `Suiten mit test:-Script, die npm test nie ausführt - in die test-Kette einhängen (Schritt 3 in docs/test-suites.md): ${missing.join(', ')}`,
  );
});

test('jede test/test-*.js-Datei hat ein npm-Script', () => {
  const referenced = new Set(
    Object.values(pkg.scripts).flatMap((v) => [...v.matchAll(/test\/[\w.-]+\.js/g)].map((m) => m[0])),
  );
  const orphans = readdirSync(new URL('../test', import.meta.url))
    .filter((f) => f.startsWith('test-') && f.endsWith('.js'))
    .filter((f) => !referenced.has(`test/${f}`));
  assert.deepEqual(
    orphans,
    [],
    `Testdateien ohne test:-Script - anlegen und in die Kette einhängen: ${orphans.join(', ')}`,
  );
});
