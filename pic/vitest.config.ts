import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 600000,  // 10 minutes for long-running tests
    hookTimeout: 120000,  // 2 minutes for setup/teardown
    isolate: true,
    fileParallelism: false,  // Run tests sequentially
  },
});
