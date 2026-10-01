#!/usr/bin/env node
/**
 * Verify the built Android manifest, not the source one.
 *
 * `src/main/AndroidManifest.xml` is only half the story: the manifest merger
 * also merges in library manifests (androidx.core, Capacitor, any plugin), and
 * a library can add a permission. Only the merged output is what the OS reads.
 *
 * Requires a prior Gradle run:
 *   npx cap sync android
 *   cd android && gradlew :app:processDebugMainManifest :app:processReleaseMainManifest
 *
 * When the merged output is absent this skips rather than fails, so a web-only
 * checkout is not blocked; `npm run verify:android` runs the Gradle step.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = path.join(ROOT, 'android/app/build/intermediates/merged_manifest');

const VARIANTS = [
  { name: 'debug', dir: 'processDebugMainManifest', expectsInternet: true },
  { name: 'release', dir: 'processReleaseMainManifest', expectsInternet: false },
];

const findings = [];
const stripComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '');
const grantedPermissions = (xml) =>
  [...stripComments(xml).matchAll(/<uses-permission[^>]*android:name\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);

let checked = 0;

for (const { name, dir, expectsInternet } of VARIANTS) {
  const file = path.join(BASE, name, dir, 'AndroidManifest.xml');
  if (!existsSync(file)) {
    console.log(`  skip  ${name}: no merged manifest (run \`npm run verify:android\`)`);
    continue;
  }
  checked++;

  const xml = readFileSync(file, 'utf8');
  const permissions = grantedPermissions(xml);
  const hasInternet = permissions.includes('android.permission.INTERNET');
  const granted = new Set(permissions);

  if (hasInternet !== expectsInternet) {
    findings.push({
      file: path.relative(ROOT, file),
      rule: `${name} INTERNET permission`,
      detail: expectsInternet
        ? 'missing; debug builds need it for Capacitor live reload'
        : 'granted; a release build can still open a socket, so the offline claim is not enforced by the OS',
    });
  }

  if (/com\.google\.gms/.test(stripComments(xml))) {
    findings.push({
      file: path.relative(ROOT, file),
      rule: `${name} Google Services reference`,
      detail: 'the merged manifest still references com.google.gms',
    });
  }

  // Capacitor's filesystem plugin needs storage access for export/import.
  // Removing it silently would break backup restore, so assert it is present.
  for (const required of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE']) {
    if (!granted.has(`android.permission.${required}`)) {
      findings.push({
        file: path.relative(ROOT, file),
        rule: `${name} missing ${required}`,
        detail: 'backup export/import would break; storage perms are intentionally kept',
      });
    }
  }

  console.log(`  ok    ${name.padEnd(7)} INTERNET=${hasInternet ? 'granted' : 'absent '} (expected ${expectsInternet})`);
  console.log(`        permissions: ${permissions.join(', ')}`);
}

if (findings.length > 0) {
  console.error('\nverify:android-manifests: FAILED\n');
  for (const f of findings) console.error(`  [${f.rule}] ${f.file} -> ${f.detail}`);
  process.exit(1);
}

console.log(
  checked === 0
    ? '\nverify:android-manifests: SKIPPED (no merged manifests; run `npm run verify:android`)'
    : `\nverify:android-manifests: OK - ${checked} variant(s) checked.`,
);