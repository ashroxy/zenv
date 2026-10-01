// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025 ashroxy
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node env is sufficient: the code under test uses `globalThis.crypto`
    // (Web Crypto) and `btoa`/`atob`, all present in Node >= 18. Avoiding jsdom
    // keeps the suite fast and removes a dependency.
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['services/**/*.test.ts', 'hooks/**/*.test.ts'],
    // PBKDF2 at 600k iterations is slow; give the suite room to finish.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
