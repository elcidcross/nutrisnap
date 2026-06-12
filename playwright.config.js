const { defineConfig } = require('@playwright/test');

// The e2e suite drives the deployed PWA (prod by default; point BASE_URL at the
// local dev server to test it). Tests share one Gemini key and one Supabase
// backend, so they run serially. Traces/screenshots/video are retained on
// failure to feed the HTML report (`npm run e2e:report`).
module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.test.js',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000, // AI calls + logSalmonByText polls up to ~30s
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'https://nutrisnap-lovat.vercel.app',
    headless: process.env.HEADED !== '1',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
