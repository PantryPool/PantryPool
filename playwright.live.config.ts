import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-live',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: [
    {
      command: 'npx tsx scripts/test_live_server.ts',
      port: 3099,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'VITE_API_PROXY=http://localhost:3099 npx vite --port 5173',
      port: 5173,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        VITE_API_PROXY: 'http://localhost:3099',
      },
    },
  ],
});
