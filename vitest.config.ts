import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    env: {
      JWT_SECRET: 'test-secret-key-minimum-32-chars-long-for-testing',
    },
  },
});
