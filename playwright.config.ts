import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
