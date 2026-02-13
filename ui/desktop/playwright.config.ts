import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 30000,
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.2,
    },
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['html'],
    ['list']
  ],
  use: {
    actionTimeout: 30000,
    navigationTimeout: 30000,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  outputDir: 'test-results',
  preserveOutput: 'always',

  // Global setup: kills zombie processes, sets env vars
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),

  // Single project — no grep filtering.
  // Tests that require a running backend should check GOOSE_BACKEND env var
  // and skip themselves if it's not set.
  projects: [
    {
      name: 'default',
      use: {},
    },
  ],
};

export default config;