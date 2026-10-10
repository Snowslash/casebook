import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const fixture = 'public/synthetic-logbook.xlsx';
async function explore(page: Page, buffer?: Buffer) {
  await page.goto('/app/');
  await page.getByLabel('Choose .xlsx file').setInputFiles(buffer ? { name: 'synthetic-pies.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer } : fixture);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
}

function changeProcedures(value: (row: number) => string | null) {
  const files = unzipSync(readFileSync(fixture));
  const sheet = 'xl/worksheets/sheet1.xml';
  files[sheet] = strToU8(strFromU8(files[sheet]).replace(/<c r="B(\d+)".*?<\/c>/g, (cell, raw: string) => {
    const row = Number(raw);
    if (row === 1) return cell;
    const text = value(row);
    return text === null ? '' : `<c r="B${row}" t="inlineStr"><is><t>${text}</t></is></c>`;
  }));
  return Buffer.from(zipSync(files));
}

test('reversed date ranges expose invalid state on both controls and clear it on recovery', async ({ page }) => {
  await explore(page);
  await page.getByLabel('From date').fill('01/03/2026');
  await page.getByLabel('To date').fill('01/02/2026');
  for (const name of ['From date', 'To date']) {
    await expect(page.getByLabel(name)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(name)).toHaveAttribute('aria-describedby', 'date-feedback');
  }
  await expect(page.locator('table')).toHaveCount(0);
  await page.getByLabel('To date').fill('01/04/2026');
  for (const name of ['From date', 'To date']) await expect(page.getByLabel(name)).toHaveAttribute('aria-invalid', 'false');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(9);
});

test('procedure overflow hint follows filtering and genuine viewport resize transitions', async ({ page }) => {
  const buffer = changeProcedures(row => `Synthetic label ${row}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await explore(page, buffer);
  const mix = page.getByRole('region', { name: 'Procedure mix', exact: true });
  await expect(mix.locator('.chart-scroll-hint')).toBeVisible();
  await page.getByLabel('Search all views').fill('Synthetic label 10');
  await expect(mix.locator('.chart-scroll-hint')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(mix.locator('.chart-scroll-hint')).toBeVisible();
  // Seven short labels fit the 400px desktop list, but wrap on a truly narrow viewport.
  const seven = changeProcedures(row => `Synthetic procedure label ${Math.min(row, 8)}`);
  await page.setViewportSize({ width: 1440, height: 844 });
  await explore(page, seven);
  await expect(mix.locator('.chart-scroll-hint')).toHaveCount(0);
  await page.setViewportSize({ width: 280, height: 844 });
  await expect(mix.locator('.chart-scroll-hint')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 844 });
  await expect(mix.locator('.chart-scroll-hint')).toHaveCount(0);
});

test('pie views are optional per chart and preserve the filtered source rows and view state', async ({ page }) => {
  await explore(page);
  const mix = page.getByRole('region', { name: 'Procedure mix', exact: true });
  const role = page.getByRole('region', { name: 'Supervision breakdown', exact: true });
  await expect(mix.getByRole('radio', { name: 'Bars', exact: true })).toBeChecked();
  await expect(role.getByRole('radio', { name: 'Bars', exact: true })).toBeChecked();
  await expect(page.getByRole('region', { name: 'Monthly activity', exact: true }).getByRole('radio')).toHaveCount(0);
  await mix.getByRole('radio', { name: 'Pie', exact: true }).check();
  await expect(mix.locator('.pie-slice')).toHaveCount(2);
  await expect(mix.locator('.pie-legend button')).toHaveCount(2);
  await expect(role.getByRole('radio', { name: 'Bars', exact: true })).toBeChecked();
  await mix.locator('.pie-legend').getByRole('button', { name: 'Synthetic procedure A: 8 procedures', exact: true }).click();
  await page.getByRole('button', { name: 'Feb 2026: 6 procedures', exact: true }).click();
  await role.getByRole('radio', { name: 'Pie', exact: true }).check();
  await expect(role.locator('.pie-slice')).toHaveCount(5);
  // Pointer click inside Performed's two-of-six sector (first, and largest, category).
  const box = (await role.locator('svg').boundingBox())!;
  const angle = -Math.PI / 2 + Math.PI * 2 / 6;
  await page.mouse.click(box.x + box.width * (110 + 60 * Math.cos(angle)) / 220, box.y + box.height * (110 + 60 * Math.sin(angle)) / 220);
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await expect(page.locator('tbody').getByText('Possible duplicate')).toHaveCount(2);
  await expect(role.locator('.chart-denominator')).toHaveText('6 available');
  await expect(role).toContainText('Supervision selection excluded');
  await role.getByRole('radio', { name: 'Bars', exact: true }).check();
  await expect(role.getByRole('button', { name: 'Performed: 2 procedures', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await role.getByRole('radio', { name: 'Pie', exact: true }).check();
  const slice = role.getByRole('button', { name: 'Performed: 2 procedures · pie slice', exact: true });
  await slice.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('tbody th')).toHaveText(['3', '4', '5', '6', '7', '8']);
  await page.keyboard.press('Enter');
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await page.getByLabel('From date').fill('01/');
  await expect(page.locator('.pie-chart')).toHaveCount(0); // Estate navigation icons are unrelated to result charts.
  await page.getByLabel('From date').fill('');
  await expect(role.getByRole('radio', { name: 'Pie', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await expect(role.locator('.pie-slice')).toHaveCount(6);
  await page.getByRole('button', { name: 'Clear file', exact: true }).click();
  await explore(page);
  await expect(role.getByRole('radio', { name: 'Bars', exact: true })).toBeChecked();
});

test('pie legends keep exact missing/literal and unfamiliar labels; empty and single-category charts stay honest', async ({ page }) => {
  await explore(page, changeProcedures(row => row === 9 ? null : row === 8 ? 'Missing procedure' : 'Synthetic procedure A'));
  const mix = page.getByRole('region', { name: 'Procedure mix', exact: true });
  const role = page.getByRole('region', { name: 'Supervision breakdown', exact: true });
  await mix.getByRole('radio', { name: 'Pie', exact: true }).check();
  const legend = mix.locator('.pie-legend');
  await legend.getByRole('button', { name: 'Missing procedure: 1 procedures · blank source value', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['9']);
  await legend.getByRole('button', { name: 'Missing procedure: 1 procedures · recorded label', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['8']);
  await role.getByRole('radio', { name: 'Pie', exact: true }).check();
  await expect(role.locator('.pie-slice')).toHaveCount(1);
  await expect(role.locator('.pie-slice')).toHaveAttribute('d', / A .* A /);
  await expect(role.locator('.pie-legend')).toContainText('Unfamiliar label · kept as recorded');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await role.locator('.pie-legend').getByRole('button', { name: 'Missing supervision: 1 procedures', exact: true }).click();
  await expect(page.locator('tbody th')).toHaveText(['7']);
  await page.getByLabel('Search all views').fill('no-synthetic-match');
  await expect(page.locator('.pie-slice')).toHaveCount(0);
  await expect(mix).toContainText('No procedures match these filters.');
  await expect(role.locator('.chart-denominator')).toHaveText('0 available');
});

test('pie mode keeps long-tail categories reachable, stable colours and local-only state on phone', async ({ page, baseURL }) => {
  const requests: { url: string; method: string; kind: string; body: string | null }[] = [];
  const errors: string[] = [];
  page.on('request', r => requests.push({ url: r.url(), method: r.method(), kind: r.resourceType(), body: r.postData() }));
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await explore(page, changeProcedures(row => `Synthetic procedure ${row} with a deliberately long unchanged description`));
  const mix = page.getByRole('region', { name: 'Procedure mix', exact: true });
  await mix.getByRole('radio', { name: 'Pie', exact: true }).check();
  await expect(mix.locator('.pie-slice')).toHaveCount(9);
  await expect(mix.locator('.pie-legend button')).toHaveCount(9);
  const label = 'Synthetic procedure 10 with a deliberately long unchanged description: 1 procedures';
  const colour = await mix.getByRole('button', { name: `${label} · pie slice`, exact: true }).getAttribute('fill');
  const last = mix.locator('.pie-legend').getByRole('button', { name: label, exact: true });
  await last.click();
  await expect(page.locator('tbody th')).toHaveText(['10']);
  await page.getByLabel('Search all views').fill('procedure 10');
  await expect(mix.locator('.pie-slice')).toHaveCount(1);
  await expect(mix.getByRole('button', { name: `${label} · pie slice`, exact: true })).toHaveAttribute('fill', colour!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await last.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, db: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, db: 0 });
  expect(requests.every(r => new URL(r.url).origin === new URL(baseURL!).origin && r.method === 'GET' && r.body === null && !['fetch', 'xhr'].includes(r.kind))).toBe(true);
  expect(errors).toEqual([]);
});
