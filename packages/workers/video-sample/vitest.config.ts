import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@flowstudio/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
      '@flowstudio/worker-shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
