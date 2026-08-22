import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  // Parallel workers verified stable (61 tests x3 parallel repeats green after
  // the Task 24 root-cause fixes: canvas graph completeness, hydration-sync
  // helpers, viewport-stable drags). See TODO.md task 24 for the history.
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    // Locally a leftover server is handy; CI must always boot a fresh one.
    reuseExistingServer: !process.env.CI,
  },
});
