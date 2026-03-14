import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/shared',
      'packages/workers/*',
      'infra/cloud-function/generate-upload-url',
      'frontend',
    ],
  },
});
