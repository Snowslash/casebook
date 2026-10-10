import { defineConfig } from '@playwright/test';
const port = Number(process.env.CASEBOOK_TEST_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({ testDir: './tests/browser', workers: 1, use: { baseURL, headless: true, trace: 'off', screenshot: 'only-on-failure' }, webServer: { command: `npm run preview -- --port ${port}`, url: baseURL, reuseExistingServer: false }, reporter: 'list' });
