import { defineConfig } from '@playwright/test'
import { OWNER_STATE_FILE } from './tests/e2e/helpers/constants'

const ADMIN_BASE_URL = process.env.E2E_ADMIN_BASE_URL ?? 'http://127.0.0.1:5174'
process.env.E2E_PUBLIC_BASE_URL ??= 'http://127.0.0.1:3002'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: '.tmp/playwright-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '.tmp/playwright-report' }],
  ],
  use: {
    baseURL: ADMIN_BASE_URL,
    screenshot: 'only-on-failure',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    video: 'retain-on-failure',
  },
  // The disposable DB is set up once per run, so first-run setup runs in its own
  // `setup` project. Every spec depends on it and reuses the owner's auth state;
  // specs that need a clean/anonymous session opt out with `test.use({ storageState })`.
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
    },
    {
      name: 'e2e',
      testMatch: '**/*.e2e.ts',
      dependencies: ['setup'],
      use: { storageState: OWNER_STATE_FILE },
    },
  ],
  webServer: {
    command: 'bun run e2e:dev',
    url: ADMIN_BASE_URL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 500 },
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
