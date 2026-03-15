import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // Mock the SpacetimeDB SDK modules that can't be imported in Node test env
      'spacetimedb/server': path.resolve(__dirname, '__tests__/__mocks__/spacetimedb.ts'),
      'spacetimedb/sdk': path.resolve(__dirname, '__tests__/__mocks__/spacetimedb.ts'),
      'spacetimedb': path.resolve(__dirname, '__tests__/__mocks__/spacetimedb.ts'),
    },
  },
});
