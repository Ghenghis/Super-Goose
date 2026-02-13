import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 30000
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

  // Projects for different backend configurations
  projects: [
    {
      name: 'without-backend',
      // Default: tests that don't require backend
      grep: /^((?!backend).)*$/i, // Exclude tests with 'backend' in name
      use: {
        // No GOOSE_BACKEND flag set
      },
    },
    {
      name: 'with-backend',
      // Tests that require backend to be running
      // Run with: GOOSE_BACKEND=1 npm run test:e2e
      grep: /backend/i, // Only tests with 'backend' in name
      use: {
        // GOOSE_BACKEND=1 should be set via environment
      },
    },
  ],
};

export default config;