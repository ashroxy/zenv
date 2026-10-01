import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Content Security Policy for the shipped bundle.
 *
 * Injected at build time rather than written into `index.html` on purpose: a
 * static `<meta http-equiv>` applies in development too, where `script-src
 * 'self'` blocks the inline HMR preamble and the WebSocket connection, so the
 * dev server would break while the production policy stayed untested by anyone
 * actually running the app.
 *
 * The app is offline-only: it makes no network requests, so `connect-src` is
 * `'none'` rather than `'self'`. A `fetch` to anywhere is a bug, and this makes
 * that bug fail loudly instead of silently exfiltrating a vault.
 *
 * `style-src` allows `'unsafe-inline'` because React components set style
 * attributes and the shell ships a small inline stylesheet; inline CSS cannot
 * execute script, so this is the low-risk half of the policy. `script-src` is
 * strict: no `'unsafe-inline'`, no `'unsafe-eval'`, so injected markup has no
 * path to execution.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // `frame-ancestors` is deliberately absent. It is ignored when delivered via
  // <meta> and logs a console error, so including it here would look like
  // protection while providing none. Clickjacking defence belongs in the HTTP
  // header, which a static bundle cannot set; see `X-Frame-Options` in
  // capacitor.config.ts and the deployment notes in README.md.
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'zenv-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return {
      html,
      tags: [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy },
          injectTo: 'head-prepend',
        },
      ],
    };
  },
});

/**
 * Ensures all third-party licenses (OFL font licenses, NOTICE, and LICENSE)
 * accompany the binary distribution in `dist/` and the native APK assets.
 * SIL OFL 1.1 requires the license text to travel with the font software.
 */
const legalAssetsPlugin = (): Plugin => ({
  name: 'zenv-legal-assets',
  apply: 'build',
  generateBundle() {
    const filesToEmit = [
      { src: path.resolve(__dirname, 'assets/fonts/LICENSE-Inter.txt'), fileName: 'assets/fonts/LICENSE-Inter.txt' },
      { src: path.resolve(__dirname, 'assets/fonts/LICENSE-JetBrains-Mono.txt'), fileName: 'assets/fonts/LICENSE-JetBrains-Mono.txt' },
      { src: path.resolve(__dirname, 'NOTICE'), fileName: 'NOTICE' },
      { src: path.resolve(__dirname, 'LICENSE'), fileName: 'LICENSE' },
    ];
    for (const f of filesToEmit) {
      if (fs.existsSync(f.src)) {
        this.emitFile({
          type: 'asset',
          fileName: f.fileName,
          source: fs.readFileSync(f.src, 'utf8'),
        });
      }
    }
  },
});

export default defineConfig(() => ({
  server: {
    port: 3000,
    // Loopback only. The previous config bound the dev server to 0.0.0.0,
    // exposing a hot-reload server with full source access to anything on the
    // local network.
    host: '127.0.0.1',
  },
  plugins: [react(), tailwindcss(), cspPlugin(), legalAssetsPlugin()],
  // NOTE: the previous config defined `import.meta.env.VITE_GEMINI_API_KEY` from
  // the non-public `GEMINI_API_KEY` variable, inlining the API key into the
  // client bundle. The Gemini integration has been removed; any secret in
  // `define` is a bundle leak. Secrets belong on a server, never here.
  // `scripts/assert-no-bundled-secrets.mjs` fails the build if a credential
  // pattern still reaches `dist/`.
  build: {
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));