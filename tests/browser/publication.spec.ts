import { test, expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

function pagesHeaderRules() {
  return readFileSync('dist/_headers', 'utf8').trim().split(/\n\s*\n/).map(block => {
    const [path, ...lines] = block.split('\n');
    const headers = Object.fromEntries(lines.map(line => {
      const colon = line.indexOf(':');
      expect(colon).toBeGreaterThan(0);
      return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
    }));
    return { path, headers };
  });
}

function pagesHeadersFor(pathname: string): Record<string, string> {
  // This fixture deliberately supports only the global and exact-path rules
  // used here. Live Pages verification remains a separate release gate.
  return Object.assign({}, ...pagesHeaderRules().filter(rule => rule.path === '/*' || rule.path === pathname).map(rule => rule.headers));
}

// Vite preview does not interpret _headers. Apply the exact built policy to
// real browser responses to test enforcement, not to claim a Pages deployment.
async function applyPagesHeaders(page: Page) {
  await page.route('**/*', async route => {
    const response = await route.fetch();
    const headers = pagesHeadersFor(new URL(route.request().url()).pathname);
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
  });
  return pagesHeadersFor('/app/');
}

test.afterEach(async ({ page }) => {
  // Finish in-flight fetch/fulfill handlers before Playwright disposes their responses.
  await page.unrouteAll({ behavior: 'wait' });
});

test('no-transform is restricted to the two HTML entrypoints without weakening the security policy', () => {
  expect(pagesHeaderRules().map(rule => rule.path)).toEqual(['/*', '/', '/app/']);
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  for (const path of ['/', '/app/']) {
    expect(pagesHeadersFor(path)['cache-control']).toBe('public, max-age=0, must-revalidate, no-transform');
    expect(pagesHeadersFor(path)['content-security-policy']).toBe(csp);
  }
  const assets = readdirSync('dist/assets').map(name => `/assets/${name}`);
  expect(assets.length).toBeGreaterThan(0);
  for (const path of [...assets, '/synthetic-logbook.xlsx', '/licenses/MIT-Casebook.txt']) {
    expect(pagesHeadersFor(path)['cache-control']).toBeUndefined();
    expect(pagesHeadersFor(path)['content-security-policy']).toBe(csp);
  }
});

for (const path of ['/', '/app/']) {
  test(`the scoped no-transform response header reaches the browser on ${path}`, async ({ page }) => {
    await applyPagesHeaders(page);
    const response = await page.goto(path);
    expect(response!.headers()['cache-control']).toBe('public, max-age=0, must-revalidate, no-transform');
    expect(response!.headers()['x-frame-options']).toBe('DENY');
    await expect(page.getByRole('heading', { name: path === '/' ? 'Casebook' : 'Explore your eLogbook export', exact: true })).toBeVisible();
  });
}

test('the build carries the Pages header file and all first-party and font notices', async ({ request }) => {
  expect(readFileSync('dist/_headers', 'utf8')).toBe(readFileSync('public/_headers', 'utf8'));
  for (const name of ['MIT-Casebook.txt', 'MIT-estate-ui.txt', 'OFL-Literata.txt', 'OFL-Atkinson-Hyperlegible-Next.txt', 'THIRD-PARTY-NOTICES.txt']) {
    const response = await request.get(`/licenses/${name}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect(await response.text()).toBe(readFileSync(`public/licenses/${name}`, 'utf8'));
  }
});

test('the HTTP-header policy preserves the synthetic import and exact chart drill-down loop', async ({ page }) => {
  const headers = await applyPagesHeaders(page);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto('/app/');
  for (const [name, value] of Object.entries(headers)) expect(response!.headers()[name]).toBe(value);
  await page.getByLabel('Choose .xlsx file').setInputFiles('public/synthetic-logbook.xlsx');
  await expect(page.getByTestId('preview-count')).toHaveText('9 logged procedures');
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  await page.getByLabel('Procedure', { exact: true }).selectOption(JSON.stringify('Synthetic procedure A'));
  await page.getByRole('button', { name: 'Feb 2026: 6 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['3', '4', '5', '6', '7', '8']);
  const supervision = page.getByRole('region', { name: 'Supervision breakdown', exact: true });
  await supervision.getByRole('radio', { name: 'Pie' }).check();
  await supervision.getByRole('button', { name: 'Performed: 2 procedures · pie slice', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await page.getByRole('button', { name: 'Clear file', exact: true }).click();
  await expect(page.locator('table')).toHaveCount(0);
  expect(await page.evaluate(() => ({ local: Object.fromEntries(Object.entries(localStorage)), session: sessionStorage.length }))).toEqual({ local: { sangeevSiteTheme: 'light' }, session: 0 });
  expect(errors).toEqual([]);
});

test('the response policy prevents framing even by the same origin', async ({ page }) => {
  await applyPagesHeaders(page);
  const blocked: string[] = [];
  page.on('console', message => { if (message.type() === 'error' && /frame-ancestors|X-Frame-Options/i.test(message.text())) blocked.push(message.text()); });
  await page.goto('/app/');
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.title = 'Synthetic framing probe';
    frame.src = '/app/';
    document.body.append(frame);
  });
  await expect.poll(() => blocked.length).toBeGreaterThan(0);
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Explore your eLogbook export' })).toHaveCount(0);
});
