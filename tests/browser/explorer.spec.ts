import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
const fixture = 'public/synthetic-logbook.xlsx';
async function openFixture(page: Page) {
  await page.goto('/');
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await expect(page.getByRole('heading', { name: 'Review your import' })).toBeVisible();
  await expect(page.getByTestId('preview-count')).toHaveText('9 logged procedures');
  await page.getByRole('button', { name: 'Explore procedures' }).click();
}

test('welcome copy starts at its heading without the decorative eyebrow', async ({ page }) => {
  await page.goto('/');
  const welcome = page.locator('.welcome-copy');
  await expect(welcome.getByRole('heading', { name: 'Explore your eLogbook export' })).toBeVisible();
  await expect(welcome.locator('.eyebrow')).toHaveCount(0);
  await expect(page.getByText('Your experience, made inspectable', { exact: true })).toHaveCount(0);
  await expect(welcome.getByRole('button', { name: 'Choose a workbook' })).toBeVisible();
});

test('welcome explains the workflow without a separate instruction card or eyebrow', async ({ page }) => {
  await page.goto('/');
  const note = page.locator('.welcome-copy');
  await expect(page.locator('.welcome-note')).toHaveCount(0);
  await expect(note.locator('.eyebrow')).toHaveCount(0);
  await expect(note).not.toContainText('The first slice');
  await expect(note).not.toContainText('Understand the count.');
  await expect(note).toContainText('Open a workbook, filter by date, procedure or hospital, then inspect the entries behind each chart.');
});

test('header and browser tab use the chosen Casebook name', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Casebook');
  await expect(page.locator('.topbar .identity strong')).toHaveText('Casebook');
  await expect(page.locator('.topbar .brand-mark')).toHaveText('CB');
  await expect(page.getByRole('banner')).not.toContainText('Operation Logbook Explorer');
  await expect(page.locator('.topbar').getByRole('button', { name: 'Open .xlsx' })).toBeVisible();
});

test('footer omits the authority sentence but keeps the privacy information', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer).not.toContainText('The official eLogbook remains authoritative.');
  await expect(footer).toContainText('Read-only companion · no uploads or saved workbook data');
  await expect(footer).toContainText('Only your light/dark preference is saved.');
});

test('explorer heading keeps sheet and count without repeated guidance', async ({ page }) => {
  await openFixture(page);
  const heading = page.locator('.section-heading');
  await expect(heading.locator('.muted')).toHaveText('OperationList · 9 imported entries');
  await expect(heading.locator('.eyebrow')).toHaveCount(0);
  await expect(heading).not.toContainText('02 / Filter & inspect');
  await expect(heading.getByRole('heading', { name: 'Recorded procedures' })).toBeVisible();
  await expect(heading.getByRole('button', { name: 'Review import' })).toBeVisible();
});

test('selection card keeps live counts and quality flags without redundant copy', async ({ page }) => {
  await openFixture(page);
  const selection = page.locator('.selection');
  await expect(selection).not.toContainText('Across all supervision categories in this view.');
  await expect(selection).not.toContainText('Participation, not a competence score.');
  await expect(selection).not.toContainText('inferred independence rating');
  await expect(selection.locator('.eyebrow')).toHaveCount(0);
  await expect(selection).toHaveAttribute('aria-label', 'Current selection');
  await expect(selection.getByTestId('match-count')).toHaveText('9');
  await expect(selection.getByTestId('match-count')).toHaveAttribute('aria-live', 'polite');
  await page.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  await expect(selection.getByTestId('match-count')).toHaveText('2');
  await expect(selection).not.toContainText('Within the selected supervision category.');
  await expect(page.getByLabel('Active filters')).toContainText('Supervision: Performed');
  await selection.locator('summary').click();
  await expect(selection.getByLabel('Whole-file data quality')).toContainText('2 possible duplicate rows');
});

test('header tagline describes exploring the operative logbook', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('.topbar');
  await expect(header.getByText('Explore your operative logbook', { exact: true })).toBeVisible();
  await expect(header).not.toContainText('A clearer view of recorded experience');
  await expect(header.locator('.eyebrow')).toHaveCount(0);
  await expect(header.locator('.identity strong')).toHaveText('Casebook');
  await expect(header.getByRole('button', { name: 'Open .xlsx' })).toBeVisible();
});

test('all screens omit eyebrows while source table controls remain usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.eyebrow')).toHaveCount(0);
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await expect(page.getByRole('heading', { name: 'Review your import' })).toBeVisible();
  await expect(page.locator('.eyebrow')).toHaveCount(0);
  await expect(page.getByText('01 / Open & review', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  await expect(page.locator('.eyebrow')).toHaveCount(0);
  const table = page.locator('.table-panel');
  await expect(table).not.toContainText('03 / Trace the count');
  await expect(table.getByRole('heading', { name: 'Included source rows' })).toBeVisible();
  await expect(table).toContainText('9 matching rows · sheet OperationList');
  await page.getByLabel('Search all views').fill('17/02/2026');
  await expect(table.locator('tbody th')).toHaveText(['5', '6']);
  await page.getByRole('button', { name: 'Clear file', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Explore your eLogbook export' })).toBeVisible();
  await expect(page.locator('.eyebrow')).toHaveCount(0);
});

test('supervision chart keeps original labels without the participation eyebrow', async ({ page }) => {
  await openFixture(page);
  const chart = page.locator('.chart');
  await expect(chart.getByText('Recorded participation', { exact: true })).toHaveCount(0);
  await expect(chart.locator('.eyebrow')).toHaveCount(0);
  await expect(chart.getByRole('heading', { name: 'Supervision breakdown' })).toBeVisible();
  await expect(chart.getByTestId('chart-total')).toHaveText('9');
  await expect(chart.getByRole('button', { name: 'Assisting: 3 procedures', exact: true })).toBeVisible();
  await expect(chart.getByRole('button', { name: 'Supervised-trainer scrubbed: 1 procedures', exact: true })).toBeVisible();
  await expect(chart.getByRole('button', { name: 'Supervised-trainer unscrubbed but in theatre: 1 procedures', exact: true })).toBeVisible();
  await chart.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await expect(chart.getByTestId('chart-total')).toHaveText('9');
});

test('real XLSX import → filter → aggregate → source rows → reset, without upload or persistence', async ({ page }) => {
  const requests: { url: string; method: string; body: string | null; kind: string }[] = [];
  const errors: string[] = [];
  page.on('request', r => requests.push({ url: r.url(), method: r.method(), body: r.postData(), kind: r.resourceType() }));
  page.on('pageerror', e => errors.push(e.message));
  await openFixture(page);
  await expect(page.getByTestId('match-count')).toHaveText('9');
  await expect(page.getByLabel('From date')).toHaveAttribute('placeholder', 'DD/MM/YYYY');
  await page.getByLabel('From date').fill('01/02/2026');
  await page.getByLabel('To date').fill('28/02/2026');
  await page.getByLabel('Procedure', { exact: true }).selectOption(JSON.stringify('Synthetic procedure A'));
  await expect(page.getByTestId('match-count')).toHaveText('6');
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Performed: 2 procedures', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  await expect(page.getByTestId('match-count')).toHaveText('2');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await expect(page.locator('tbody').getByText('Possible duplicate')).toHaveCount(2);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await page.getByLabel('Search all views').fill('Synthetic unknown role');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByTestId('chart-total')).toHaveText('1');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByLabel('From date').fill('01/03/2026');
  await page.getByLabel('To date').fill('01/02/2026');
  await expect(page.getByRole('alert')).toContainText('From date must not be after');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByLabel('From date').fill('31/02/2026');
  await expect(page.getByRole('alert')).toContainText('Enter a valid date in DD/MM/YYYY');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }));
  expect(storage).toEqual({ local: 0, session: 0, databases: 0 });
  expect(requests.every(r => new URL(r.url).origin === 'http://127.0.0.1:4173' && r.method === 'GET' && r.body === null)).toBe(true);
  expect(requests.filter(r => ['fetch', 'xhr'].includes(r.kind))).toEqual([]);
  expect(errors).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Explore your eLogbook export' })).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
});

test('failed replacement import removes stale results; clearing drops the file', async ({ page }) => {
  await openFixture(page);
  await page.getByLabel('Choose .xlsx file').setInputFiles({ name: 'broken.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not a workbook') });
  await expect(page.getByRole('alert')).toContainText('Could not read');
  await expect(page.locator('table')).toHaveCount(0);
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  await page.getByRole('button', { name: 'Clear file', exact: true }).click();
  await expect(page.locator('table')).toHaveCount(0);
  expect(await page.getByLabel('Choose .xlsx file').inputValue()).toBe('');
});

test('untrusted labels render as text, not HTML', async ({ page }) => {
  const files = unzipSync(readFileSync(fixture));
  const value = '&lt;img src=x onerror=alert(1)&gt;';
  files['xl/sharedStrings.xml'] = strToU8(strFromU8(files['xl/sharedStrings.xml']).replace('Synthetic unknown role', value));
  await page.goto('/');
  await page.getByLabel('Choose .xlsx file').setInputFiles({ name: 'synthetic.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(zipSync(files)) });
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  await expect(page.locator('tbody').getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
});

test('mobile layout keeps controls in the viewport and table scroll contained', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('From date')).toBeVisible();
  await expect(page.getByText('Scroll horizontally to see all source columns.')).toBeVisible();
  const region = page.getByRole('region', { name: 'Source rows, scroll horizontally if needed' });
  await region.focus();
  await page.keyboard.press('End');
  expect(await region.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/explorer-mobile.png', fullPage: true });
});

test('clearing while file reading is pending prevents stale import resurrection', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      const blob = this;
      return new Promise<ArrayBuffer>((resolve, reject) => {
        (window as unknown as { releaseRead: () => Promise<void> }).releaseRead = async () => {
          try { resolve(await original.call(blob)); } catch (error) { reject(error); }
        };
      });
    };
  });
  await page.goto('/');
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await expect(page.getByRole('status')).toContainText('Reading workbook locally');
  await page.getByRole('button', { name: 'Clear file', exact: true }).click();
  await page.evaluate(async () => {
    await (window as unknown as { releaseRead: () => Promise<void> }).releaseRead();
    await new Promise(requestAnimationFrame);
  });
  await expect(page.getByRole('heading', { name: 'Explore your eLogbook export' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review your import' })).toHaveCount(0);
  await expect(page.locator('table')).toHaveCount(0);
});
