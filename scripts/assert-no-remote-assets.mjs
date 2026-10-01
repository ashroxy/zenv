#!/usr/bin/env node
/**
 * Independence guard.
 *
 * The product claim is "completely independent from any online or Google
 * content". Nothing enforces that claim on its own: a convenience
 * `import '@fontsource/...'` or a `<link href="https://fonts.googleapis.com">`
 * would pass typecheck, lint, tests and the secret scanner, and would ship.
 *
 * This runs in `npm run verify` and fails the build on:
 *   1. remote asset references (font hosts, remote CSS @import/url())
 *   2. Google-owned or cloud packages in the dependency tree
 *   3. Google Services / Firebase wiring in the native Android build
 *   4. a release INTERNET permission (which would make the offline claim a lie)
 *   5. regression of the vendored fonts themselves
 *
 * Markdown is exempt from the token rules on purpose: README and NOTICE have to
 * be able to *describe* the removed hosts and packages. They are still scanned
 * for live remote asset references.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Text we are willing to scan for live remote references. */
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json', '.xml', '.gradle']);

/** Never recurse into these. */
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'android/.gradle', 'build', 'coverage', 'ios', 'Pods']);

/** Tokens that mean a third-party remote/Google dependency crept back in. */
const FORBIDDEN_TOKENS = [
  { name: 'Google Fonts host', re: /fonts\.(?:googleapis|gstatic)\.com/i },
  { name: 'Google JS SDK import', re: /@google\// },
  { name: 'Gemini API key reference', re: /\bGEMINI_API_KEY\b/ },
  { name: 'Firebase reference', re: /\bfirebase\b/i },
  { name: 'Google Services plugin', re: /com\.google\.gms|google-services\.json/ },
];

/** A remote reference that would make the browser fetch at runtime. */
const REMOTE_ASSET_PATTERNS = [
  { name: 'remote CSS @import', re: /@import\s+(?:url\()?\s*['"]?https?:/i },
  { name: 'remote url()', re: /url\(\s*['"]?https?:/i },
  { name: 'remote <script src>', re: /<script[^>]+src\s*=\s*['"]https?:/i },
  { name: 'remote <link href>', re: /<link[^>]+href\s*=\s*['"]https?:/i },
  { name: 'remote @font-face src', re: /@font-face[\s\S]{0,400}?src\s*:[^;]*https?:/i },
];

/**
 * Files that are allowed to contain the very patterns they search for.
 * A scanner must name what it forbids, and the secret scanner has to embed
 * credential shapes; neither can pass its own rule set.
 */
const SELF_FILES = new Set([
  path.join('scripts', 'assert-no-remote-assets.mjs'),
  path.join('scripts', 'assert-no-bundled-secrets.mjs'),
  // Also checks the merged manifest for Google Services, so it necessarily
  // embeds the token it forbids.
  path.join('scripts', 'assert-android-manifests.mjs'),
]);

/**
 * Strip comments before matching.
 *
 * Removing a Google Services plugin leaves a comment explaining why, and this
 * file's own rules name the forbidden tokens. Matching raw text turned every
 * such explanation into a failure, which is precisely the wrong incentive: it
 * would push someone to delete the record of what was removed.
 */
const stripComments = (text) => {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, ' '); // CSS / JS / XML-Python block
  out = out.replace(/<!--[\s\S]*?-->/g, ' '); // XML and HTML comments
  // Line comments, but keep them from eating the `//` inside a URL.
  out = out.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  return out;
};

const findings = [];
const add = (file, line, rule, detail) => findings.push({ file, line, rule, detail });

const rel = (p) => path.relative(ROOT, p) || path.basename(p);

/** Walk the project, skipping vendored/build directories. */
async function* walk(dir, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      yield* walk(full, depth + 1);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

const scanTextFile = async (file) => {
  const relPath = rel(file);
  if (SELF_FILES.has(relPath)) return;

  const ext = path.extname(file).toLowerCase();
  const isDoc = ext === '.md' || ext === '.mdx';

  const info = await stat(file);
  if (info.size > 4 * 1024 * 1024) return;

  const original = await readFile(file, 'utf8');
  // Comments are excluded from matching: they explain, they do not execute.
  const text = stripComments(original);

  /**
   * Stripping shortens the string, so an index into it no longer lines up with
   * the file's real line numbers. Rather than carry an offset map, locate the
   * matched snippet in the original text, which is both simpler and exact.
   */
  const report = (rule, snippet) => {
    const at = original.indexOf(snippet.trim());
    const line = at === -1 ? 0 : original.slice(0, at).split('\n').length;
    add(relPath, line, rule, snippet.trim().slice(0, 50));
  };

  // Token rules: skip prose files so documentation may name what was removed.
  if (!isDoc) {
    for (const { name, re } of FORBIDDEN_TOKENS) {
      const m = re.exec(text);
      if (m) report(name, m[0]);
    }
  }

  // Live remote references: these are never acceptable, docs included.
  for (const { name, re } of REMOTE_ASSET_PATTERNS) {
    const re2 = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m;
    while ((m = re2.exec(text)) !== null) {
      report(name, m[0]);
      if (findings.length > 50) return; // enough evidence; stop reading
    }
  }
};

/** Package names that would reintroduce a remote/Google/cloud dependency. */
const FORBIDDEN_PACKAGE_PATTERNS = [
  { re: /^@google\//, why: 'Google-owned SDK' },
  { re: /^@gemini/, why: 'Gemini SDK' },
  { re: /^google-/, why: 'Google-owned client package' },
  { re: /^googleapis$/, why: 'Google-owned client package' },
  { re: /^@googleapis\//, why: 'Google-owned client package' },
  { re: /firebase/, why: 'Google-owned backend' },
  // The whole point of the vendoring work: these mirror Google Fonts. Fonts
  // must be committed to the tree, not resolved at build time.
  { re: /^@fontsource\//, why: 'font package mirrors a Google-hosted font' },
];

/** Every font file committed to the tree, as repo-relative paths. */
const listFontFiles = () => {
  const dir = path.join(ROOT, 'assets', 'fonts');
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.woff2'))
      .map((f) => path.posix.join('assets/fonts', f));
  } catch {
    return [];
  }
};

// --- 1 & 2: source tree + dependency tree -------------------------------
const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
for (const [name, version] of Object.entries(allDeps)) {
  for (const { re, why } of FORBIDDEN_PACKAGE_PATTERNS) {
    if (re.test(name)) add('package.json', 0, `forbidden dependency: ${why}`, `${name}@${version}`);
  }
}
if (pkg.scripts?.['verify:no-remote-assets'] === undefined) {
  add('package.json', 0, 'guard not wired into npm run verify', 'missing "verify:no-remote-assets" script');
}

for await (const file of walk(ROOT)) {
  if (!SCAN_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
  await scanTextFile(file);
}

// --- 3 & 4: native Android build ---------------------------------------
// A release build that declares INTERNET can still phone home; the offline
// claim depends on the platform refusing, not on the JavaScript being polite.
const mainManifest = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');
if (existsSync(mainManifest)) {
  const original = await readFile(mainManifest, 'utf8');
  const text = stripComments(original);
  const m = /<uses-permission[^>]*android:name\s*=\s*['"]android\.permission\.INTERNET['"]/.exec(text);
  if (m) {
    const at = original.indexOf(m[0]);
    add(rel(mainManifest), original.slice(0, at).split('\n').length,
      'INTERNET permission in the release manifest',
      'release builds could open a socket; it belongs in src/debug only');
  }
}

const debugManifest = path.join(ROOT, 'android/app/src/debug/AndroidManifest.xml');
if (!existsSync(debugManifest)) {
  add('android/app/src/debug/AndroidManifest.xml', 0, 'debug INTERNET permission missing',
    'required for Capacitor live reload after the release permission was removed');
}

// --- 5: the vendored fonts must still exist and be correctly wired -------
// Substring checks are not good enough here. `unicode-range` once "passed"
// because a comment mentioned it, and a missing `@fontsource` entry in the
// denylist let the dependency back in unnoticed. So parse each declaration.
const REQUIRED_FACES = [
  ['Inter', '400'], ['Inter', '500'], ['Inter', '600'], ['Inter', '700'],
  ['JetBrains Mono', '400'], ['JetBrains Mono', '500'],
];
const REQUIRED_SUBSETS = ['latin', 'latin-ext'];

const cssPath = path.join(ROOT, 'index.css');
if (existsSync(cssPath)) {
  const cssOriginal = await readFile(cssPath, 'utf8');
  const css = stripComments(cssOriginal);
  const faces = [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
  const lineFor = (needle) => {
    const at = cssOriginal.indexOf(needle);
    return at === -1 ? 0 : cssOriginal.slice(0, at).split('\n').length;
  };

  const declared = new Map(); // relative path -> [family:weight]
  for (const body of faces) {
    const family = /font-family\s*:\s*['"]([^'"]+)['"]/.exec(body)?.[1] ?? '?';
    const weight = /font-weight\s*:\s*(\d+)/.exec(body)?.[1] ?? '?';
    const label = `${family} ${weight}`;

    if (!/unicode-range\s*:/i.test(body)) {
      add('index.css', lineFor(`font-weight: ${weight}`), `@font-face ${label} has no unicode-range`,
        'every subset would be downloaded on every page load');
    }
    if (!/font-display\s*:/i.test(body)) {
      add('index.css', lineFor(`font-weight: ${weight}`), `@font-face ${label} has no font-display`,
        'text would be invisible until the font arrives');
    }
    const src = /src\s*:\s*([^;]+);/i.exec(body)?.[1]?.trim();
    if (!src) {
      add('index.css', 0, `@font-face ${label} has no src`, 'the face would never load');
      continue;
    }
    const url = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(src)?.[1];
    if (!url) {
      add('index.css', lineFor(`font-weight: ${weight}`), `@font-face ${label} src is not a url()`, src);
      continue;
    }
    if (/^[a-z]+:/i.test(url) || url.startsWith('//')) {
      add('index.css', lineFor(url), `@font-face ${label} loads from a remote origin`, url);
      continue;
    }
    const relPath = url.replace(/^\.\//, '');
    if (!relPath.startsWith('assets/fonts/')) {
      add('index.css', lineFor(url), `@font-face ${label} points outside assets/fonts/`, relPath);
    }
    if (!existsSync(path.join(ROOT, relPath))) {
      add('index.css', lineFor(url), `@font-face ${label} references a missing file`, relPath);
    }
    declared.set(relPath, [...(declared.get(relPath) ?? []), label]);
  }

  // Coverage: every family/weight/subset combination the UI actually uses.
  for (const [family, weight] of REQUIRED_FACES) {
    for (const subset of REQUIRED_SUBSETS) {
      const slug = family.toLowerCase().replace(/\s+/g, '-');
      const file = `assets/fonts/${slug}-${subset}-${weight}.woff2`;
      if (!existsSync(path.join(ROOT, file))) {
        add(file, 0, 'vendored font missing', `${family} ${weight} ${subset} must be committed to the tree`);
        continue;
      }
      if (!declared.has(file)) {
        add('index.css', 0, `@font-face ${family} ${weight} ${subset} is not declared`,
          'the file ships but is never used');
      }
    }
  }

  // Every shipped font must be referenced, or it is dead weight in the bundle.
  for (const file of listFontFiles()) {
    if (!declared.has(file)) add(file, 0, 'vendored font is never referenced', 'dead weight in the bundle');
  }

  // OFL requires the licence to travel with the fonts.
  for (const licence of ['assets/fonts/LICENSE-Inter.txt', 'assets/fonts/LICENSE-JetBrains-Mono.txt']) {
    if (!existsSync(path.join(ROOT, licence))) {
      add(licence, 0, 'font licence missing', 'SIL OFL requires the licence to ship with the font files');
    }
  }
}

// --- 6: binary distribution compliance (dist/ bundle) -------------------
const distDir = path.join(ROOT, 'dist');
if (existsSync(distDir)) {
  for (const lic of ['assets/fonts/LICENSE-Inter.txt', 'assets/fonts/LICENSE-JetBrains-Mono.txt', 'NOTICE', 'LICENSE']) {
    if (!existsSync(path.join(distDir, lic))) {
      add(`dist/${lic}`, 0, 'licence missing from dist bundle', 'OFL and open-source licenses must accompany binary distributions');
    }
  }
}

// --- report -------------------------------------------------------------
if (findings.length > 0) {
  console.error('verify:no-remote-assets: FAILED - the app is no longer independent\n');
  for (const f of findings) {
    console.error(`  [${f.rule}] ${f.file}${f.line ? `:${f.line}` : ''} -> ${f.detail}`);
  }
  console.error('\nThis app must ship with no remote assets and no Google/cloud dependency.');
  console.error('If a network feature is genuinely required, that is a product decision:');
  console.error('say so out loud rather than reintroducing it silently.');
  process.exit(1);
}

console.log('verify:no-remote-assets: OK - no remote assets, no Google/cloud dependencies.');