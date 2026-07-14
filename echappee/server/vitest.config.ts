import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // PGlite's WASM startup can exceed the default 5s on cold caches.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
