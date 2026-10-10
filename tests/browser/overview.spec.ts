import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const fixture = 'public/synthetic-logbook.xlsx';
const encoded = (value: string | null) => JSON.stringify(value);
async function explore(page: Page) {
  await page.goto('/app/');
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await expect(page.getByTestId('preview-count')).toHaveText('9 logged procedures');
  await page.getByRole('button', { name: 'Explore procedures' }).click();
}

test('overview presents all monthly and procedure counts with missing dates visible', async ({ page }) => {
  await explore(page);
  const activity = page.getByRole('region', { name: 'Monthly activity', exact: true });
  const mix = page.getByRole('region', { name: 'Procedure mix', exact: true });
  await expect(activity.getByRole('button', { name: 'Jan 2026: 1 procedures', exact: true })).toBeVisible();
  await expect(activity.getByRole('button', { name: 'Feb 2026: 7 procedures', exact: true })).toBeVisible();
  await expect(activity.getByRole('button', { name: 'Missing / invalid date: 1 procedures', exact: true })).toBeVisible();
  await expect(mix.getByRole('button', { name: 'Synthetic procedure A: 8 procedures', exact: true })).toBeVisible();
  await expect(mix.getByRole('button', { name: 'Synthetic procedure B: 1 procedures', exact: true })).toBeVisible();
  await expect(page.getByTestId('match-count')).toHaveText('9');
  await expect(page.getByTestId('procedure-count')).toHaveText('2');
  await expect(page.getByTestId('hospital-count')).toHaveText('2');
  await expect(page.locator('.eyebrow')).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const lastRole = page.locator('.chart .bars').getByRole('button', { name: 'Synthetic unknown role: 1 procedures', exact: true });
    const listBounds = (await page.locator('.chart .bars').boundingBox())!;
    const lastBounds = (await lastRole.boundingBox())!;
    expect(lastBounds.y + lastBounds.height).toBeLessThanOrEqual(listBounds.y + listBounds.height);
  }
});

test('hospital, month and supervision selections compose without uploads or persistence', async ({ page, baseURL }) => {
  const requests: { url: string; method: string; body: string | null; type: string }[] = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData(), type: request.resourceType() }));
  await explore(page);
  await page.getByLabel('Hospital', { exact: true }).selectOption(encoded('Synthetic hospital North'));
  await expect(page.locator('tbody th')).toHaveText(['2', '3', '5', '6', '10']);
  await expect(page.getByTestId('match-count')).toHaveText('5');
  await expect(page.getByLabel('Active filters')).toContainText('Hospital: Synthetic hospital North');
  await page.getByRole('region', { name: 'Monthly activity', exact: true }).getByRole('button', { name: 'Feb 2026: 3 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['3', '5', '6']);
  await page.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await expect(page.getByTestId('match-count')).toHaveText('2');
  await expect(page.locator('tbody').getByText('Possible duplicate')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove supervision filter' }).click();
  await expect(page.locator('tbody th')).toHaveText(['3', '5', '6']);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await expect(page.getByLabel('Hospital', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Active filters')).toContainText('No active filters');
  await page.getByRole('button', { name: 'Clear file', exact: true }).click();
  await expect(page.locator('table')).toHaveCount(0);
  expect(requests.every(r => new URL(r.url).origin === new URL(baseURL!).origin && r.method === 'GET' && r.body === null)).toBe(true);
  expect(requests.filter(r => ['fetch', 'xhr'].includes(r.type))).toEqual([]);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length, workers: (await navigator.serviceWorker.getRegistrations()).length }))).toEqual({ local: 0, session: 0, databases: 0, workers: 0 });
});

test('missing hospital and missing month are selectable and reset restores them', async ({ page }) => {
  await explore(page);
  await page.getByLabel('Hospital', { exact: true }).selectOption(encoded(null));
  await expect(page.locator('tbody th')).toHaveText(['8']);
  await expect(page.getByLabel('Active filters')).toContainText('Hospital: Missing hospital');
  await expect(page.getByTestId('hospital-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('button', { name: 'Missing / invalid date: 1 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['10']);
  await expect(page.getByLabel('Active filters')).toContainText('Month: Missing / invalid date');
  await page.getByRole('button', { name: 'Remove month filter' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await page.getByLabel('From date').fill('01/02/2026');
  await expect(page.getByRole('button', { name: 'Missing / invalid date: 1 procedures', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByRole('button', { name: 'Missing / invalid date: 1 procedures', exact: true })).toBeVisible();
});

test('procedure and month chart clicks link exact source rows and preserve search context', async ({ page }) => {
  await explore(page);
  await page.getByRole('button', { name: 'Synthetic procedure A: 8 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['2', '3', '4', '5', '6', '7', '8', '10']);
  await expect(page.getByLabel('Procedure', { exact: true })).toHaveValue(encoded('Synthetic procedure A'));
  await page.getByRole('button', { name: 'Feb 2026: 6 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['3', '4', '5', '6', '7', '8']);
  await page.getByLabel('Search all views').fill('17/02/2026');
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await expect(page.getByRole('button', { name: 'Feb 2026: 2 procedures', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Synthetic procedure A: 2 procedures', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('chart-total')).toHaveText('2');
  await page.getByRole('button', { name: 'Feb 2026: 2 procedures', exact: true }).click();
  await page.getByLabel('Search all views').fill('');
  await expect(page.locator('tbody tr')).toHaveCount(8);
});

test('missing procedure stays distinct from a literal placeholder and all charts handle no matches', async ({ page }) => {
  const files = unzipSync(readFileSync(fixture));
  const sheet = 'xl/worksheets/sheet1.xml';
  files[sheet] = strToU8(strFromU8(files[sheet])
    .replace(/<c r="B9".*?<\/c>/, '')
    .replace(/<c r="B8".*?<\/c>/, '<c r="B8" t="inlineStr"><is><t>Missing procedure</t></is></c>'));
  await page.goto('/app/');
  await page.getByLabel('Choose .xlsx file').setInputFiles({ name: 'synthetic-missing.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(zipSync(files)) });
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  const mix = page.getByRole('region', { name: 'Procedure mix', exact: true });
  await mix.getByRole('button', { name: 'Missing procedure: 1 procedures · blank source value', exact: true }).click({ timeout: 5000 });
  await expect(page.locator('tbody th')).toHaveText(['9']);
  await mix.getByRole('button', { name: 'Missing procedure: 1 procedures · recorded label', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['8']);
  await page.getByLabel('Procedure', { exact: true }).selectOption(encoded(null));
  await expect(page.locator('tbody th')).toHaveText(['9']);
  await expect(page.getByLabel('Active filters')).toContainText('Procedure: Missing procedure');
  await page.getByLabel('Procedure', { exact: true }).selectOption(encoded('Missing procedure'));
  await expect(page.locator('tbody th')).toHaveText(['8']);
  await page.getByLabel('Search all views').fill('no synthetic match');
  await expect(page.getByTestId('match-count')).toHaveText('0');
  await expect(page.getByTestId('procedure-count')).toHaveText('0');
  await expect(page.getByTestId('hospital-count')).toHaveText('0');
  await expect(page.getByRole('region', { name: 'Monthly activity', exact: true }).getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Procedure mix', exact: true }).getByRole('button')).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(0);
});

test('long procedure lists keep every exact label reachable in a contained scroller', async ({ page }) => {
  const files = unzipSync(readFileSync(fixture));
  const sheet = 'xl/worksheets/sheet1.xml';
  const label = (n: number) => `Synthetic procedure ${String(n).padStart(2, '0')} with a deliberately long unmerged description`;
  files[sheet] = strToU8(strFromU8(files[sheet]).replace(/<c r="B(\d+)".*?<\/c>/g, (cell, rawRow: string) => {
    const row = Number(rawRow);
    return row === 1 ? cell : `<c r="B${row}" t="inlineStr"><is><t>${label(row - 1)}</t></is></c>`;
  }));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/app/');
  await page.getByLabel('Choose .xlsx file').setInputFiles({ name: 'synthetic-long-labels.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(zipSync(files)) });
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  const mix = page.getByRole('region', { name: 'Procedure mix', exact: true });
  await expect(mix).toContainText('Scroll for more.');
  await expect(mix.getByRole('button')).toHaveCount(9);
  expect(await mix.locator('.bars').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mix.getByRole('button', { name: `${label(9)}: 1 procedures`, exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['10']);
});

test('overview remains compact, keyboard-operable and contained at desktop and mobile widths', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await explore(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByTestId('match-count').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(48);
    const hospital = page.getByLabel('Hospital', { exact: true });
    expect((await hospital.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const month = page.getByRole('button', { name: 'Feb 2026: 7 procedures', exact: true });
    expect((await month.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await month.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('tbody tr')).toHaveCount(7);
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    const sources = page.getByRole('link', { name: 'View source rows' });
    await sources.click();
    // The estate enables native smooth anchor scrolling; assert the destination, not its first frame.
    await expect.poll(() => page.locator('.table-panel').evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(300);
    const tableTop = await page.locator('.table-panel').evaluate(el => el.getBoundingClientRect().top);
    expect(tableTop).toBeGreaterThanOrEqual(0);
    expect(tableTop).toBeLessThan(300);
  }
});
