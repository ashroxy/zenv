#!/usr/bin/env node
/**
 * Post-build secret scan.
 *
 * The Gemini integration shipped a real API key inlined into the client bundle
 * via `define: { 'import.meta.env.VITE_GEMINI_API_KEY': ... }`. Nothing caught
 * it: typecheck, lint and tests were all green. This scan runs against the
 * built output so a credential cannot reach an APK again.
 *
 * It is a backstop, not a substitute for not putting secrets in the client.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');

/** Patterns that indicate a credential was compiled into client output. */
const RULES = [
  // Real Google API keys are exactly 39 chars: the "AIza" prefix plus 35.
  // Character-class-only regexes miss real keys, so the length is asserted.
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Google OAuth client secret', re: /\bGOCSPX-[0-9A-Za-z_-]{20,}\b/g },
  { name: 'private key block', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { name: 'GitHub token', re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/g },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  // A build-time define of a secret env var, even if the value is elided.
  { name: 'inlined secret env reference', re: /VITE_[A-Z_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD)[A-Z_]*/g },
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

if (!existsSync(DIST)) {
  console.error('verify:no-secrets: dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const findings = [];
let scanned = 0;

for await (const file of walk(DIST)) {
  const ext = path.extname(file).toLowerCase();
  // Skip binary assets; a compressed image cannot contain a readable key.
  if (!['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map'].includes(ext)) continue;

  const info = await stat(file);
  if (info.size > 20 * 1024 * 1024) continue; // minified bundles are large but text

  scanned++;
  const text = await readFile(file, 'utf8');

  for (const { name, re } of RULES) {
    const matches = text.match(re);
    if (!matches) continue;
    for (const m of new Set(matches)) {
      findings.push({ file: path.relative(process.cwd(), file), name, sample: m.slice(0, 12) });
    }
  }
}

if (findings.length > 0) {
  console.error('verify:no-secrets: FAILED - possible secrets in build output\n');
  for (const f of findings) {
    console.error(`  [${f.name}] ${f.file} -> ${f.sample}...`);
  }
  console.error('\nA client bundle cannot hold a secret. Remove the integration or proxy it through a server.');
  process.exit(1);
}

console.log(`verify:no-secrets: OK - ${scanned} text assets scanned, no credential patterns found.`);