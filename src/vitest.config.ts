import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '#db': fileURLToPath(new URL('./server/database', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.mjs'],
    environment: 'node',
  },
});
