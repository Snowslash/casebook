import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('production build emits separate landing and explorer documents', async ({ request }) => {
  const landing = readFileSync('dist/index.html', 'utf8');
  const app = readFileSync('dist/app/index.html', 'utf8');
  expect(app).not.toBe(landing);
  expect(landing).toContain('Open Casebook');
  for (const path of ['/', '/app/']) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('text/html');
  }
});

for (const route of ['/', '/app/']) {
  test(`simplified estate navigation on ${route} has exactly Projects and GitHub`, async ({ page }) => {
    await page.goto(route);
    const header = page.getByRole('banner');
    const links = header.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAccessibleName('Projects');
    await expect(links.nth(0)).toHaveAttribute('href', 'https://sangeev.me/#projects');
    await expect(links.nth(1)).toHaveAccessibleName('GitHub');
    await expect(links.nth(1)).toHaveAttribute('href', 'https://github.com/Snowslash');
    await expect(header.locator('[aria-current]')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-estate-ui', '2.0.0-alpha.7');
    await expect(header.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
  });
}

for (const width of [1440, 390, 320]) {
  test(`landing links to the preserved explorer at ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Casebook', exact: true })).toBeVisible();
    await expect(page.locator('[data-estate-layout="landing"]')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('data-estate-ui', '2.0.0-alpha.7');
    await expect(page.locator('h1')).toHaveCount(1);
    const open = page.getByRole('link', { name: 'Open Casebook', exact: true });
    const source = page.getByRole('link', { name: 'Source on GitHub' });
    await expect(open).toHaveAttribute('href', './app/');
    await expect(source).toHaveAttribute('href', 'https://github.com/Snowslash/casebook');
    await expect(page.getByRole('link', { name: 'Projects', exact: true }).first()).toHaveAttribute('href', 'https://sangeev.me/#projects');
    await expect(page.getByLabel('Workbook privacy')).toContainText('browser memory');
    await expect(page.locator('.eyebrow, .local-status, footer')).toHaveCount(0);
    const image = page.getByRole('img', { name: /synthetic example/i });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const heights = await Promise.all([open, source].map(link => link.evaluate(node => node.getBoundingClientRect().height)));
      expect(heights[0]).toBe(48);
      expect(heights[1]).toBe(48);
    }
    await open.click();
    await expect(page).toHaveURL(/\/app\/$/);
    await expect(page.getByRole('heading', { name: 'Explore your eLogbook export' })).toBeVisible();
    await expect(page.locator('[data-estate-layout="wide-app"]')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download the wholly synthetic example' }).click()]);
    expect(readFileSync((await download.path())!)).toEqual(readFileSync('public/synthetic-logbook.xlsx'));
    await page.getByLabel('Choose .xlsx file').setInputFiles('public/synthetic-logbook.xlsx');
    await expect(page.getByTestId('preview-count')).toHaveText('9 logged procedures');
    await page.getByRole('button', { name: 'Explore procedures' }).click();
    await page.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
    await expect(page.locator('tbody th')).toHaveText(['5', '6']);
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(9);
    await page.getByRole('button', { name: 'Clear file', exact: true }).click();
    await expect(page.locator('table')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
