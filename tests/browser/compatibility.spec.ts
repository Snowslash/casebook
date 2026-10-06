import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const fixture = 'public/synthetic-logbook.xlsx';
const sheet = 'xl/worksheets/sheet1.xml';
const payload = (buffer: Uint8Array, name = 'synthetic-compatibility.xlsx') => ({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(buffer) });
function variant(transform: (xml: string) => string) {
  const files = unzipSync(readFileSync(fixture));
  // XLSX cells must remain in coordinate order after insertion/reordering.
  const xml = transform(strFromU8(files[sheet])).replace(/(<row\b[^>]*>)(.*?)(<\/row>)/g, (_, start, body: string, end) => {
    const cells = body.match(/<c\b[^>]*(?:\/>|>.*?<\/c>)/g) ?? [];
    const column = (cell: string) => [.../r="([A-Z]+)/.exec(cell)![1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    return start + cells.sort((a, b) => column(a) - column(b)).join('') + end;
  });
  files[sheet] = strToU8(xml);
  return zipSync(files);
}
// Authored synthetic categories: these are not asserted eLogbook code meanings.
function cepodRows(xml: string) {
  const values: (string | number | null)[] = ['Synthetic category A', 'Synthetic category B', 'Synthetic category A', 7, 7, null, 'Synthetic unfamiliar category', '7', 'Synthetic category A'];
  return xml.replace(/<row r="(\d+)">(.*?)<\/row>/g, (row, raw: string, cells: string) => {
    const n = Number(raw);
    if (n < 2 || n > 10) return row;
    const value = values[n - 2];
    const clean = cells.replace(new RegExp(`<c r="H${n}".*?<\\/c>`), '');
    const cell = value === null ? '' : typeof value === 'number' ? `<c r="H${n}"><v>${value}</v></c>` : `<c r="H${n}" t="inlineStr"><is><t>${value}</t></is></c>`;
    return `<row r="${n}">${clean}${cell}</row>`;
  });
}

test('opening guidance explains encrypted downloads and ZIP refusal is actionable', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.locator('.welcome-copy')).toContainText('remove its opening password');
  await expect(page.locator('.welcome-copy')).toContainText('Keep the unencrypted copy secure.');
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  await page.getByLabel('Choose .xlsx file').setInputFiles(payload(zipSync({}), 'synthetic.zip'));
  await expect(page.getByRole('alert')).toContainText('Extract');
  await expect(page.locator('table')).toHaveCount(0);
});

test('reordered columns, extra excluded fields and date-times reach the correct source rows', async ({ page }) => {
  const bytes = variant(xml => cepodRows(xml)
    .replace(/r="([BV])(\d+)"/g, (_, col: string, row: string) => `r="${col === 'B' ? 'V' : 'B'}${row}"`)
    .replace(/(<c r="A2"[^>]*><v>)([\d.]+)(<\/v>)/, (_, start, value, end) => `${start}${Number(value) + 0.5}${end}`)
    .replace(/(<row r="1">.*?)(<\/row>)/, '$1<c r="W1" t="inlineStr"><is><t>EXCLUDED_HEADER_SENTINEL</t></is></c>$2')
    .replace(/(<row r="2">.*?)(<\/row>)/, '$1<c r="W2" t="inlineStr"><is><t>EXCLUDED_VALUE_SENTINEL</t></is></c>$2'));
  await page.goto('/app/');
  await page.getByLabel('Choose .xlsx file').setInputFiles(payload(bytes));
  await expect(page.getByTestId('preview-count')).toHaveText('9 logged procedures');
  await expect(page.locator('.preview')).toContainText('1 additional column ignored');
  await expect(page.locator('.preview')).toContainText('1 date-time value');
  await page.locator('.columns summary').click();
  await expect(page.locator('.columns')).toContainText('CEPOD');
  await expect(page.locator('body')).not.toContainText('EXCLUDED_HEADER_SENTINEL');
  await expect(page.locator('body')).not.toContainText('EXCLUDED_VALUE_SENTINEL');
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  await page.getByLabel('From date').fill('05/01/2026');
  await page.getByLabel('To date').fill('05/01/2026');
  await expect(page.locator('tbody th')).toHaveText(['2']);
  await expect(page.locator('tbody')).toContainText('05/01/2026');
  await expect(page.locator('tbody')).toContainText('Synthetic procedure A');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
});

test('schema diagnostics show known missing and duplicate headings without leaking unexpected cells', async ({ page }) => {
  const bytes = variant(xml => xml.replace(/<c r="B1".*?<\/c>/, '<c r="B1" t="inlineStr"><is><t>PRIVATE_HEADER_SENTINEL</t></is></c>')
    .replace(/<c r="V1".*?<\/c>/, '<c r="V1" t="inlineStr"><is><t>Supervision</t></is></c>'));
  await page.goto('/app/');
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  await page.getByLabel('Choose .xlsx file').setInputFiles(payload(bytes));
  await expect(page.getByRole('alert')).toContainText('Missing');
  await expect(page.getByRole('alert')).toContainText('Operation');
  await expect(page.getByRole('alert')).toContainText('Duplicate');
  await expect(page.getByRole('alert')).toContainText('Supervision');
  await expect(page.locator('body')).not.toContainText('PRIVATE_HEADER_SENTINEL');
  await expect(page.locator('table')).toHaveCount(0);
});

for (const value of ['2026-01-05T23:30:00-05:00', '01/05/2026 12:30']) {
  test(`textual date cells refuse replacement without date guessing: ${value}`, async ({ page }) => {
    await page.goto('/app/');
    await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
    await page.getByRole('button', { name: 'Explore procedures' }).click();
    const bytes = variant(xml => xml.replace(/<c r="A2".*?<\/c>/, `<c r="A2" t="d"><v>${value}</v></c>`));
    await page.getByLabel('Choose .xlsx file').setInputFiles(payload(bytes));
    await expect(page.getByRole('alert')).toContainText('Textual date cells');
    await expect(page.getByRole('alert')).not.toContainText(value);
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Review your import' })).toHaveCount(0);
  });
}

test('colliding CEPOD text and number labels remain distinguishable and select different rows', async ({ page }) => {
  const bytes = variant(xml => cepodRows(xml).replace(/<c r="H9".*?<\/c>/, '<c r="H9" t="inlineStr"><is><t>7 (number)</t></is></c>'));
  await page.goto('/app/');
  await page.getByLabel('Choose .xlsx file').setInputFiles(payload(bytes));
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  const cepod = page.getByRole('combobox', { name: 'CEPOD', exact: true });
  await expect(cepod.getByRole('option', { name: '7 (number)', exact: true })).toHaveCount(1);
  await expect(cepod.getByRole('option', { name: '7 (number) (text)', exact: true })).toHaveCount(1);
  await cepod.selectOption({ value: '7' });
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await expect(page.locator('tbody td:nth-child(6)')).toHaveText(['7 (number)', '7 (number)']);
  await cepod.selectOption({ value: JSON.stringify('7 (number)') });
  await expect(page.locator('tbody th')).toHaveText(['9']);
  await expect(page.locator('tbody td:nth-child(6)')).toHaveText('7 (number) (text)');
});

for (const theme of ['light', 'dark'] as const) {
  test(`CEPOD preserves typed categories and exact drill-down, reset and privacy in ${theme} mode`, async ({ page }) => {
    const errors: string[] = [];
    const traffic: { method: string; type: string; url: string }[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/app/');
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
    page.on('request', r => traffic.push({ method: r.method(), type: r.resourceType(), url: r.url() }));
    await page.getByLabel('Choose .xlsx file').setInputFiles(payload(variant(cepodRows)));
    await page.getByRole('button', { name: 'Explore procedures' }).click();
    const cepod = page.getByRole('combobox', { name: 'CEPOD', exact: true });
    await expect(cepod).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'CEPOD', exact: true })).toBeVisible();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await cepod.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      if (width <= 390) expect((await cepod.boundingBox())!.width).toBeCloseTo((await page.getByLabel('Search all views').boundingBox())!.width, 0);
      await expect(page.getByLabel('Search all views')).toHaveAttribute('placeholder', 'Search retained fields…');
      await cepod.focus();
      await expect(cepod).toBeFocused();
      await cepod.selectOption({ value: '7' });
      await expect(page.locator('tbody th')).toHaveText(['5', '6']);
      await expect(page.locator('tbody').getByText('Possible duplicate')).toHaveCount(2);
      await expect(page.getByLabel('Active filters')).toContainText('CEPOD: 7 (number)');
      await expect(page.getByTestId('chart-total')).toHaveText('2');
      await page.getByRole('button', { name: 'Feb 2026: 2 procedures', exact: true }).click();
      await page.getByLabel('Hospital', { exact: true }).selectOption(JSON.stringify('Synthetic hospital North'));
      await page.getByRole('button', { name: 'Synthetic procedure A: 2 procedures', exact: true }).click();
      await page.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
      await page.getByLabel('Search all views').fill('17/02/2026');
      await expect(page.locator('tbody th')).toHaveText(['5', '6']);
      await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
      await expect(page.locator('tbody tr')).toHaveCount(9);
      await expect(cepod).toHaveValue('');
      await page.screenshot({ path: `test-results/compatibility-${theme}-${width}.png`, fullPage: true });
    }
    await cepod.selectOption(JSON.stringify('7'));
    await expect(page.locator('tbody th')).toHaveText(['9']);
    await cepod.selectOption('null');
    await expect(page.locator('tbody th')).toHaveText(['7']);
    await expect(page.getByLabel('Active filters')).toContainText('CEPOD: Missing CEPOD');
    await cepod.selectOption(JSON.stringify('Synthetic unfamiliar category'));
    await expect(page.locator('tbody th')).toHaveText(['8']);
    await page.getByRole('button', { name: 'Remove cepod filter' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(9);
    await page.getByLabel('Search all views').fill('Synthetic category B');
    await expect(page.locator('tbody th')).toHaveText(['3']);
    await page.getByRole('button', { name: 'Clear file', exact: true }).click();
    await expect(page.locator('table')).toHaveCount(0);
    await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
    await page.getByRole('button', { name: 'Explore procedures' }).click();
    await expect(cepod).toHaveValue('');
    await page.reload();
    await expect(page.locator('.welcome-copy')).toBeVisible();
    expect(await page.evaluate(async () => ({ local: Object.fromEntries(Object.entries(localStorage)), session: sessionStorage.length, db: (await indexedDB.databases()).length, workers: (await navigator.serviceWorker.getRegistrations()).length }))).toEqual({ local: theme === 'light' ? { sangeevSiteTheme: 'light' } : {}, session: 0, db: 0, workers: 0 });
    expect(traffic.every(r => r.method === 'GET' && new URL(r.url).origin === 'http://127.0.0.1:4173' && !['fetch', 'xhr'].includes(r.type))).toBe(true);
    expect(errors).toEqual([]);
  });
}
