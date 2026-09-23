import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: process.platform === 'win32' ? 'msedge' : 'chromium',
    viewport: { width: 1440, height: 1100 },
    headless: true,
  },
  reporter: 'list',
  outputDir: 'artifacts/test-results',
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});
