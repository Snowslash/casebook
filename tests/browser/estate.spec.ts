import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = 'public/synthetic-logbook.xlsx';
const key = 'sangeevSiteTheme';
async function explore(page: Page) {
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
}

// Measure rendered colours, including CSS Color 4 and transparent ancestor layers.
async function contrast(page: Page, selector: string, focus = false) {
  return page.locator(selector).evaluateAll((elements, focus) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const rgba = (value: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v);
    };
    const blend = (a: number[], b: number[]) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])).concat(1);
    const background = (element: Element | null): number[] => {
      if (!element) return [255, 255, 255, 1];
      return blend(rgba(getComputedStyle(element).backgroundColor), background(element.parentElement));
    };
    const lum = (c: number[]) => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
    return elements.filter(el => el.getBoundingClientRect().width > 0).map(el => {
      const style = getComputedStyle(el), bg = background(focus ? el.parentElement : el);
      const fg = blend(rgba(focus ? style.outlineColor : style.color), bg);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return { selector: el.tagName + '.' + el.className, ratio: (a + .05) / (b + .05) };
    });
  }, focus);
}

test('estate chrome and self-hosted type replace local styling without changing the task', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url()));
  await page.goto('/app/');
  const header = page.getByRole('banner');
  await expect(header.locator('.estate-wordmark')).toHaveText('Sangeev.me');
  await expect(header.locator('.estate-wordmark')).toHaveAttribute('href', 'https://sangeev.me');
  await expect(header.locator('[aria-current=page]')).toHaveCount(0); // No invented hosted destination.
  await expect(page.locator('.estate-shell')).toHaveAttribute('data-estate-layout', 'wide-app');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore your eLogbook export');
  await expect(page.locator('.identity strong')).toHaveText('Casebook');
  await expect(page.getByRole('button', { name: 'Choose a workbook' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Atkinson');
  expect(await page.locator('h1').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Literata');
  expect(await page.evaluate(() => document.fonts.check('16px Atkinson') && document.fonts.check('36px Literata'))).toBe(true);
  expect(requests.some(url => url.endsWith('.ttf'))).toBe(true);
  expect(requests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(readFileSync('README.md', 'utf8')).not.toContain('The official eLogbook remains authoritative.');
});

test('only the theme persists through import, exact drill-down, reset, clear and reload', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/app/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const traffic: { method: string; kind: string; origin: string }[] = [];
  page.on('request', r => traffic.push({ method: r.method(), kind: r.resourceType(), origin: new URL(r.url()).origin }));
  await explore(page);
  await page.getByLabel('Procedure', { exact: true }).selectOption(JSON.stringify('Synthetic procedure A'));
  await page.getByRole('button', { name: 'Feb 2026: 6 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['3', '4', '5', '6', '7', '8']);
  await page.getByRole('region', { name: 'Supervision breakdown', exact: true }).getByRole('radio', { name: 'Pie' }).check();
  await page.getByRole('button', { name: 'Performed: 2 procedures · pie slice', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await page.getByRole('button', { name: 'Clear file', exact: true }).click();
  await expect(page.locator('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await explore(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('table')).toHaveCount(0);
  const state = await page.evaluate(async () => ({ local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)), databases: await indexedDB.databases(), workers: (await navigator.serviceWorker.getRegistrations()).length }));
  expect(state).toEqual({ local: { [key]: 'light' }, session: {}, databases: [], workers: 0 });
  expect((await context.cookies()).map(c => ({ name: c.name, value: c.value, sameSite: c.sameSite }))).toEqual([{ name: key, value: 'light', sameSite: 'Lax' }]);
  expect(traffic.every(r => r.method === 'GET' && r.origin === new URL(page.url()).origin && !['fetch', 'xhr'].includes(r.kind))).toBe(true);
  expect(errors).toEqual([]);
});

for (const malformed of [false, true]) {
  test(`theme bootstrap uses ${malformed ? 'storage after a malformed cookie' : 'the estate cookie ahead of stale storage'}`, async ({ page, context }) => {
    await context.addCookies([{ name: key, value: malformed ? '%E0%A4%A' : 'light', url: 'http://127.0.0.1:4173' }]);
    await page.addInitScript(() => localStorage.setItem('sangeevSiteTheme', 'dark'));
    await page.goto('/app/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', malformed ? 'dark' : 'light');
  });
}

test('unavailable preference storage never blocks import or the theme control', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    Object.defineProperty(document, 'cookie', { get() { throw new Error('Cookies blocked'); }, set() { throw new Error('Cookies blocked'); } });
  });
  await page.goto('/app/');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await explore(page);
  await expect(page.locator('tbody tr')).toHaveCount(9);
});

for (const width of [1536, 390, 320]) {
  test(`estate geometry, focus and rendered text remain usable at ${width}px in both themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    await page.goto('/app/');
    await explore(page);
    await expect(page.locator('.estate-site-header')).toBeVisible();
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, width: r.width }; };
        return { header: rect('.estate-site-header'), inner: rect('.estate-site-header__inner'), shell: rect('.estate-shell'), client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
      });
      expect(geometry.scroll).toBe(geometry.client);
      expect(geometry.header).toEqual({ x: 0, width: geometry.client });
      expect(geometry.inner.width).toBeCloseTo(width > 760 ? 1180 : width - 28, 0);
      expect(geometry.shell.width).toBeCloseTo(width > 760 ? 1480 : width - 28, 0);
      await page.locator('.quality-details summary').click();
      for (const measurement of await contrast(page, 'h1, h2, .tagline, .local-status, .chart-context, .bar-label, .bar-label small, .bar-row > strong, .chart-denominator, .month-label, .summary-date strong, .quality > span, .flag, thead th, tbody td, .quiet, .estate-primary-action, .estate-theme-toggle, .estate-site-header nav a, .estate-wordmark, .estate-wordmark__suffix')) {
        expect(measurement.ratio, `${theme}: ${measurement.selector}`).toBeGreaterThanOrEqual(4.5);
      }
      await page.locator('.quality-details summary').click();
      for (const selector of ['.estate-theme-toggle', '.filter-reset', '.month-column', '.bar-row']) {
        const target = page.locator(selector).first();
        await target.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        await expect(target).toBeFocused();
        expect(await target.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
        const focused = await contrast(page, `${selector}:focus-visible`, true);
        expect(focused).toHaveLength(1);
        expect(focused[0].ratio).toBeGreaterThanOrEqual(3);
      }
      const reset = page.getByRole('button', { name: 'Reset filters', exact: true });
      await reset.hover();
      expect((await contrast(page, '.filter-reset'))[0].ratio).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: `test-results/estate-${width}-${theme}.png`, fullPage: true });
    }
  });
}

test('theme switches do not tween control backgrounds beneath already-switched text', async ({ page }) => {
  await page.goto('/app/');
  await explore(page);
  for (const next of ['light', 'dark']) {
    await page.getByRole('button', { name: `Switch to ${next} mode` }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', next);
    const tweened = await page.locator('.quiet, .chart-view label, .chip').evaluateAll(elements => elements.flatMap(el => el.getAnimations().filter(a => a instanceof CSSTransition && a.transitionProperty === 'background-color').map(a => { a.pause(); a.currentTime = 0; return el.className; })));
    expect(tweened).toEqual([]);
    for (const measured of await contrast(page, '.quiet')) expect(measured.ratio).toBeGreaterThanOrEqual(4.5);
  }
});

test('font licences are shipped unchanged alongside the production assets', async ({ request }) => {
  for (const name of ['OFL-Literata.txt', 'OFL-Atkinson-Hyperlegible-Next.txt']) {
    const response = await request.get(`/licenses/${name}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect(await response.text()).toBe(readFileSync(`node_modules/@sangeev/estate-ui/LICENSES/${name}`, 'utf8'));
  }
});
