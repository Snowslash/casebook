import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const fixture = 'public/synthetic-logbook.xlsx';
async function explore(page: Page) {
  await page.goto('/app/');
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
}

test('welcome leads with the workbook task and nearby privacy, without an instruction card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/');
  const welcome = page.locator('.welcome');
  await expect(welcome.getByRole('heading', { name: 'Explore your eLogbook export', exact: true })).toBeVisible();
  await expect(page.getByText('Open a window into your experience.')).toHaveCount(0);
  await expect(page.locator('.welcome-note')).toHaveCount(0);
  const choose = welcome.getByRole('button', { name: 'Choose a workbook' });
  const privacy = welcome.getByText('No uploads. No saved working data.', { exact: true });
  await expect(privacy).toBeVisible();
  const buttonBox = (await choose.boundingBox())!;
  const privacyBox = (await privacy.boundingBox())!;
  expect(Math.abs(privacyBox.y - buttonBox.y)).toBeLessThan(130);
  expect(privacyBox.y + privacyBox.height).toBeLessThan(844);
  await expect(welcome.getByRole('link', { name: 'Download the wholly synthetic example' })).toBeVisible();
});

test('global search owns all views and empty-source recovery preserves other selections', async ({ page }) => {
  await explore(page);
  const search = page.getByRole('region', { name: 'Filters', exact: true }).getByLabel('Search all views');
  await expect(search).toBeVisible();
  await expect(page.locator('.table-panel input[type=search]')).toHaveCount(0);
  await page.getByLabel('Hospital', { exact: true }).selectOption(JSON.stringify('Synthetic hospital North'));
  await search.fill('nothing-matches-synthetic');
  await expect(page.getByTestId('match-count')).toHaveText('0');
  await expect(page.locator('.count-chart button')).toHaveCount(0);
  await page.locator('.table-panel').getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.getByLabel('Hospital', { exact: true })).toHaveValue(JSON.stringify('Synthetic hospital North'));
  await expect(page.locator('tbody th')).toHaveText(['2', '3', '5', '6', '10']);
  await search.fill('17/02/2026');
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await expect(page.getByTestId('chart-total')).toHaveText('2');
});

test('chart scope distinguishes available alternatives from the selected result', async ({ page }) => {
  await explore(page);
  await page.getByLabel('Procedure', { exact: true }).selectOption(JSON.stringify('Synthetic procedure A'));
  await page.getByRole('button', { name: 'Feb 2026: 6 procedures', exact: true }).click();
  await page.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  await expect(page.getByTestId('match-count')).toHaveText('2');
  await expect(page.locator('.selection-count')).toContainText('selected procedures');
  const chart = page.getByRole('region', { name: 'Supervision breakdown', exact: true });
  await expect(chart.locator('.chart-denominator')).toHaveText('6 available');
  await expect(chart).toContainText('Supervision selection excluded');
  await expect(page.getByRole('region', { name: 'Monthly activity', exact: true })).toContainText('Month selection excluded');
  await expect(page.getByRole('region', { name: 'Procedure mix', exact: true })).toContainText('Procedure selection excluded');
  await expect(chart.getByRole('button')).toHaveCount(5);
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await chart.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  await expect(chart).not.toContainText('Supervision selection excluded');
  await expect(page.getByTestId('match-count')).toHaveText('6');
});

test('incomplete and invalid dates suspend results rather than reporting false zero matches', async ({ page }) => {
  await explore(page);
  await page.getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  await page.getByLabel('From date').fill('01/');
  await expect(page.getByRole('status')).toContainText('Complete or clear the date filters');
  await expect(page.getByTestId('match-count')).toHaveCount(0);
  await expect(page.locator('.count-chart')).toHaveCount(0);
  await expect(page.locator('table')).toHaveCount(0);
  await expect(page.getByText('No procedures match these filters.', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Active filters')).not.toContainText('From 01/');
  await page.getByLabel('From date').fill('31/02/2026');
  await expect(page.getByRole('alert')).toContainText('Enter a valid date in DD/MM/YYYY');
  await expect(page.getByTestId('match-count')).toHaveCount(0);
  await page.getByLabel('From date').fill('01/02/2026');
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await page.getByLabel('To date').fill('01/01/2026');
  await expect(page.getByRole('alert')).toContainText('From date must not be after');
  await expect(page.locator('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await page.getByLabel('From date').fill('01/01/2027');
  await expect(page.getByTestId('match-count')).toHaveText('0');
  await expect(page.locator('.table-panel')).toContainText('No included rows');
  await page.locator('.table-panel').getByRole('button', { name: 'Reset all filters', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(9);
});

test('overview brings charts and source evidence closer at actual desktop and phone viewports', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await explore(page);
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      return { activityTop: box('.activity').top + scrollY, activityHeight: box('.activity').height,
        procedureTop: box('.procedure-chart').top + scrollY, supervisionTop: box('.chart').top + scrollY,
        sourceTop: box('.table-panel').top + scrollY, estateChrome: box('.estate-site-header').height,
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.activityHeight).toBeLessThan(300);
    // Shared chrome is additional to the tool; retain content-relative density with estate title sizes.
    expect(geometry.sourceTop - geometry.activityTop).toBeLessThan(width === 390 ? 1200 : 750);
    if (width === 390) expect(geometry.activityTop - geometry.estateChrome).toBeLessThan(844 + 44);
    else {
      expect(geometry.activityTop).toBe(geometry.procedureTop);
      expect(geometry.activityTop).toBe(geometry.supervisionTop);
    }
    for (const control of await page.locator('.filters input, .filters select, .filters button').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test('detail text is readable and rendered placeholders meet normal-text contrast', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await explore(page);
  const measurements = await page.evaluate(() => {
    const font = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
    const input = document.querySelector<HTMLInputElement>('input[placeholder="DD/MM/YYYY"]')!;
    const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const lum = (channels: number[]) => channels.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const fg = lum(rgb(getComputedStyle(input, '::placeholder').color));
    const bg = lum(rgb(getComputedStyle(input).backgroundColor));
    return { flag: font('.flag'), hint: font('.bar-label small'), label: font('.filters label'), table: font('tbody td'),
      placeholderContrast: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
  });
  expect(measurements.placeholderContrast).toBeGreaterThanOrEqual(4.5);
  expect(measurements.flag).toBeGreaterThanOrEqual(13);
  expect(measurements.hint).toBeGreaterThanOrEqual(13);
  expect(measurements.label).toBeGreaterThanOrEqual(13);
  expect(measurements.table).toBeGreaterThanOrEqual(14);
});

test('chart and table keyboard focus stays inside clipping boundaries', async ({ page }) => {
  await explore(page);
  const month = page.getByRole('button', { name: 'Jan 2026: 1 procedures', exact: true });
  await month.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const clearance = await month.evaluate(el => {
    const style = getComputedStyle(el);
    const list = el.parentElement!;
    const r = el.getBoundingClientRect(), p = list.getBoundingClientRect();
    const extent = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
    return { focus: el.matches(':focus-visible'), extent, top: r.top - p.top, bottom: p.bottom - r.bottom };
  });
  expect(clearance.focus).toBe(true);
  expect(clearance.top).toBeGreaterThanOrEqual(clearance.extent);
  expect(clearance.bottom).toBeGreaterThanOrEqual(clearance.extent);
  const table = page.getByRole('region', { name: 'Source rows, scroll horizontally if needed' });
  await table.focus();
  expect(await table.evaluate(el => parseFloat(getComputedStyle(el).outlineOffset))).toBeLessThanOrEqual(-3);
});

test('larger synthetic month and procedure lists preserve every category and exact drill-down', async ({ page }) => {
  const files = unzipSync(readFileSync(fixture));
  const sheet = 'xl/worksheets/sheet1.xml';
  const original = strFromU8(files[sheet]);
  const heading = original.match(/<row r="1">.*?<\/row>/)![0];
  const label = (n: number) => `Synthetic procedure ${String(n).padStart(2, '0')} with a deliberately long unmerged description`;
  const rows: string[] = [];
  for (let month = 0; month < 24; month++) {
    for (let item = 0; item < 3; item++) {
      const row = month * 3 + item + 2;
      const serial = (Date.UTC(2024, month, 15) - Date.UTC(1899, 11, 30)) / 86400000;
      rows.push(`<row r="${row}"><c r="A${row}" s="1"><v>${serial}</v></c><c r="B${row}" t="inlineStr"><is><t>${label((row - 2) % 9)}</t></is></c><c r="I${row}" t="inlineStr"><is><t>Performed</t></is></c></row>`);
    }
  }
  files[sheet] = strToU8(original.replace(/<sheetData>.*?<\/sheetData>/, `<sheetData>${heading}${rows.join('')}</sheetData>`));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/app/');
    await page.getByLabel('Choose .xlsx file').setInputFiles({ name: 'synthetic-volume.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(zipSync(files)) });
    await expect(page.getByTestId('preview-count')).toHaveText('72 logged procedures');
    await page.getByRole('button', { name: 'Explore procedures' }).click();
    const activity = page.getByRole('region', { name: 'Monthly activity', exact: true });
    const mix = page.getByRole('region', { name: 'Procedure mix', exact: true });
    await expect(activity.getByRole('button')).toHaveCount(24);
    await expect(mix.getByRole('button')).toHaveCount(9);
    await expect(activity).toContainText('Scroll for more.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await activity.getByRole('button', { name: 'Dec 2025: 3 procedures', exact: true }).click();
    await expect(page.locator('tbody th')).toHaveText(['71', '72', '73']);
    await mix.getByRole('button', { name: `${label(8)}: 1 procedures`, exact: true }).click();
    await expect(page.locator('tbody th')).toHaveText(['73']);
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await expect(page.getByTestId('match-count')).toHaveText('72');
    await expect(activity.getByRole('button')).toHaveCount(24);
  }
});
