import { test, expect, type Page } from '@playwright/test';

const fixture = 'public/synthetic-logbook.xlsx';
async function explore(page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/app/');
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
}
const mix = (page: Page) => page.getByRole('region', { name: 'Procedure mix', exact: true });
const role = (page: Page) => page.getByRole('region', { name: 'Supervision breakdown', exact: true });

// Inspect actual browser-created animations, rather than sleeping through them.
async function finishMotion(page: Page) {
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
}

type GatedMotion = typeof window & { motionProbe: {
  transitions: { transition: ViewTransition; release: () => void; entered: boolean; skipped: boolean }[];
  fades: string[];
} };

// Gate only callback timing: Chromium still owns snapshots, skipping and promises.
async function gateNativeMotion(page: Page) {
  await page.addInitScript(() => {
    const probe: GatedMotion['motionProbe'] = { transitions: [], fades: [] };
    (window as GatedMotion).motionProbe = probe;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((update: () => void) => {
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const entry = { transition: null as unknown as ViewTransition, release, entered: false, skipped: false };
      entry.transition = start(async () => { entry.entered = true; await gate; update(); });
      void entry.transition.ready.catch(() => { entry.skipped = true; });
      probe.transitions.push(entry);
      return entry.transition;
    }) as typeof document.startViewTransition;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.matches('.chart-body')) probe.fades.push(this.closest('section')!.getAttribute('aria-label')!);
      return animate.apply(this, args);
    };
  });
}

for (const change of ['groups', 'selection'] as const) {
  test(`cancelled deferred switch still shows Pie without restarting a fade after ${change} change`, async ({ page }) => {
    await gateNativeMotion(page);
    await explore(page);
    await finishMotion(page);
    const chart = mix(page);
    const pie = chart.getByRole('radio', { name: 'Pie', exact: true });
    await pie.check();
    await expect(pie).toBeChecked();
    await expect.poll(() => page.evaluate(() => (window as GatedMotion).motionProbe.transitions[0]?.entered)).toBe(true);
    await expect(chart.locator('.pie-chart')).toHaveCount(0);
    if (change === 'groups') {
      await page.getByLabel('Hospital', { exact: true }).selectOption(JSON.stringify('Synthetic hospital North'));
    } else {
      await chart.getByRole('button', { name: 'Synthetic procedure A: 8 procedures', exact: true }).evaluate(el => (el as HTMLButtonElement).click());
    }
    await expect(page.locator('tbody th')).toHaveText(change === 'groups' ? ['2', '3', '5', '6', '10'] : ['2', '3', '4', '5', '6', '7', '8', '10']);
    await expect.poll(() => page.evaluate(() => (window as GatedMotion).motionProbe.transitions[0].skipped)).toBe(true);
    await page.evaluate(async () => {
      const entry = (window as GatedMotion).motionProbe.transitions[0];
      entry.release();
      await entry.transition.finished;
    });
    await expect(chart.locator('.pie-chart')).toHaveCount(1);
    await expect(pie).toBeChecked();
    expect(await page.evaluate(() => (window as GatedMotion).motionProbe.fades)).toEqual([]);
  });
}

for (const first of ['Procedure mix', 'Supervision breakdown']) {
  test(`overlapping chart switches cancel the deferred ${first} fade, not its view update`, async ({ page }) => {
    await gateNativeMotion(page);
    await explore(page);
    await finishMotion(page);
    const second = first === 'Procedure mix' ? 'Supervision breakdown' : 'Procedure mix';
    const firstChart = page.getByRole('region', { name: first, exact: true });
    const secondChart = page.getByRole('region', { name: second, exact: true });
    await firstChart.getByRole('radio', { name: 'Pie', exact: true }).check();
    await expect.poll(() => page.evaluate(() => (window as GatedMotion).motionProbe.transitions[0]?.entered)).toBe(true);
    await secondChart.getByRole('radio', { name: 'Pie', exact: true }).evaluate(el => (el as HTMLInputElement).click());
    await expect(secondChart.getByRole('radio', { name: 'Pie', exact: true })).toBeChecked();
    await expect.poll(() => page.evaluate(() => (window as GatedMotion).motionProbe.transitions[0].skipped)).toBe(true);
    await page.evaluate(async () => {
      const entry = (window as GatedMotion).motionProbe.transitions[0];
      entry.release();
      await entry.transition.finished;
    });
    await expect(firstChart.locator('.pie-chart')).toHaveCount(1);
    expect(await page.evaluate(() => (window as GatedMotion).motionProbe.fades)).toEqual([]);
    await expect.poll(() => page.evaluate(() => (window as GatedMotion).motionProbe.transitions[1]?.entered)).toBe(true);
    await page.evaluate(async () => {
      const entry = (window as GatedMotion).motionProbe.transitions[1];
      entry.release();
      await entry.transition.ready;
      await entry.transition.finished;
    });
    await expect(secondChart.locator('.pie-chart')).toHaveCount(1);
    expect(await page.evaluate(() => (window as GatedMotion).motionProbe.fades)).toEqual([second]);
    await expect(page.locator('tbody tr')).toHaveCount(9);
  });
}

test('controls have short feedback without animating keyboard focus or layout', async ({ page }) => {
  await explore(page);
  const button = page.getByRole('button', { name: 'Reset filters', exact: true });
  const properties = await button.evaluate(el => {
    const style = getComputedStyle(el);
    return { properties: style.transitionProperty.split(', '), durations: style.transitionDuration.split(', ').map(parseFloat) };
  });
  expect(properties.properties).toContain('border-color');
  expect(properties.properties).not.toContain('background-color'); // Theme backgrounds and text must switch together.
  expect(properties.properties).not.toContain('all');
  expect(properties.properties).not.toContain('outline');
  expect(properties.durations.every(value => value > 0 && value <= .2)).toBe(true);
  await button.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  expect(await button.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  const radio = mix(page).getByRole('radio', { name: 'Pie', exact: true });
  await radio.focus();
  await page.keyboard.press('Space');
  await expect(radio).toBeChecked();
  await expect(radio).toBeFocused();
});

test('bar geometry eases while exact counts and source rows update immediately', async ({ page }) => {
  await explore(page);
  await finishMotion(page);
  const performed = role(page).getByRole('button', { name: 'Performed: 2 procedures', exact: true });
  await page.getByLabel('Hospital', { exact: true }).selectOption(JSON.stringify('Synthetic hospital North'));
  const frame = await performed.evaluate(el => {
    const bar = el.querySelector('.bar-track > span')!;
    const animation = bar.getAnimations().find(a => a instanceof CSSTransition && a.transitionProperty === 'transform');
    if (!animation) return null;
    animation.pause();
    animation.currentTime = 80;
    const result = { duration: animation.effect!.getTiming().duration, scale: new DOMMatrixReadOnly(getComputedStyle(bar).transform).a,
      count: document.querySelector('[data-testid=match-count]')!.textContent,
      rows: [...document.querySelectorAll('tbody th')].map(row => row.textContent),
      tableAnimation: getComputedStyle(document.querySelector('tbody')!).animationName };
    animation.finish();
    return result;
  });
  expect(frame).not.toBeNull();
  expect(frame!.duration).toBeLessThanOrEqual(200);
  expect(frame!.scale).toBeGreaterThan(2 / 3);
  expect(frame!.scale).toBeLessThan(1);
  expect(frame!.count).toBe('5');
  expect(frame!.rows).toEqual(['2', '3', '5', '6', '10']);
  expect(frame!.tableAnimation).toBe('none');
});

test('selection softens only alternative graphics, not labels or counts', async ({ page }) => {
  await explore(page);
  await role(page).getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  const alternative = role(page).getByRole('button', { name: 'Assisting: 3 procedures', exact: true });
  await finishMotion(page);
  expect(await alternative.locator('.bar-track > span').evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
  expect(await alternative.locator('.bar-label').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  await role(page).getByRole('radio', { name: 'Pie', exact: true }).check();
  await finishMotion(page);
  const slice = role(page).getByRole('button', { name: 'Assisting: 3 procedures · pie slice', exact: true });
  expect(await slice.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
  expect(await role(page).locator('.pie-legend').getByText('Assisting', { exact: true }).evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  await slice.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  expect(await slice.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.keyboard.press('Space');
  await expect(page.locator('tbody th')).toHaveText(['2', '9', '10']);
});

test('Bars/Pie crossfade is scoped, nonblocking and preserves the live legend', async ({ page }) => {
  await explore(page);
  await finishMotion(page);
  const legend = await mix(page).getByRole('button', { name: 'Synthetic procedure A: 8 procedures', exact: true }).elementHandle();
  await mix(page).getByRole('radio', { name: 'Pie', exact: true }).check();
  const snapshot = await page.evaluate(async () => {
    // Native snapshots are generated on a render step, not a duplicate DOM tree.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const animations = document.getAnimations().filter(a => (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition-'));
    const incoming = document.querySelector('.procedure-chart .chart-body')!.getAnimations();
    [...animations, ...incoming].forEach(a => { a.pause(); a.currentTime = 80; });
    const result = { pseudos: animations.map(a => (a.effect as KeyframeEffect).pseudoElement),
      liveIncomingFade: incoming.some(a => (a.effect as KeyframeEffect).getKeyframes().some(frame => frame.opacity === '0')),
      rootName: getComputedStyle(document.documentElement).viewTransitionName,
      pointerEvents: getComputedStyle(document.documentElement, '::view-transition').pointerEvents,
      rows: document.querySelectorAll('tbody tr').length };
    return result;
  });
  expect(snapshot.pseudos.some(pseudo => pseudo?.startsWith('::view-transition-old('))).toBe(true);
  expect(snapshot.liveIncomingFade).toBe(true);
  expect(snapshot.rootName).toBe('none');
  expect(snapshot.pointerEvents).toBe('none');
  expect(snapshot.rows).toBe(9);
  expect(await legend!.evaluate(el => el.isConnected)).toBe(true);
  await expect(mix(page).locator('.pie-legend button')).toHaveCount(2);
  await expect(mix(page).getByRole('radio', { name: 'Pie', exact: true })).toBeFocused();
  await legend!.click();
  await expect(page.getByTestId('match-count')).toHaveText('8');
  // The click works even with snapshots paused; filtering cancels stale snapshots.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(a => (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition-')).length)).toBe(0);
});

test('overview enters once; chips respond without replaying on each search character', async ({ page }) => {
  await explore(page);
  expect(await page.locator('.explorer').evaluate(el => getComputedStyle(el).animationName)).not.toBe('none');
  await finishMotion(page);
  const search = page.getByLabel('Search all views');
  await search.fill('Synthetic');
  const chip = page.getByRole('button', { name: 'Remove query filter', exact: true });
  expect(await chip.evaluate(el => getComputedStyle(el).animationName)).not.toBe('none');
  await finishMotion(page);
  await search.press('End');
  await search.press('Space');
  expect(await page.locator('.explorer').evaluate(el => el.getAnimations().length)).toBe(0);
  expect(await chip.evaluate(el => el.getAnimations().filter(a => a instanceof CSSAnimation).length)).toBe(0);
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Reset filters', exact: true })).toBeFocused();
  await expect(page.locator('tbody tr')).toHaveCount(9);
});

test('reduced motion disables transitions including a live preference change', async ({ page }) => {
  await explore(page);
  expect(await page.getByRole('button', { name: 'Reset filters', exact: true }).evaluate(el => getComputedStyle(el).transitionDuration)).not.toBe('0s');
  await mix(page).getByRole('radio', { name: 'Pie', exact: true }).check();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await finishMotion(page);
  await role(page).getByRole('radio', { name: 'Pie', exact: true }).check();
  await role(page).locator('.pie-legend').getByRole('button', { name: 'Performed: 2 procedures', exact: true }).click();
  const styles = await page.locator('button, .chart-view label, .pie-slice, .bar-track > span, .month-track > span, .explorer').evaluateAll(elements => elements.map(el => ({ animation: getComputedStyle(el).animationName, transition: getComputedStyle(el).transitionDuration })));
  // The shared contract uses an effectively immediate 0.01ms reduced-motion duration.
  expect(styles.every(style => style.animation === 'none' && style.transition.split(', ').every(time => parseFloat(time) <= .00001))).toBe(true);
  expect(await page.evaluate(() => document.getAnimations().filter(a => Number(a.effect?.getTiming().duration) > .01).length)).toBe(0);
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator('tbody th')).toHaveText(['5', '6']);
  await page.getByRole('button', { name: 'Remove supervision filter' }).click();
  expect(await page.evaluate(() => document.getAnimations().filter(a => Number(a.effect?.getTiming().duration) > .01).length)).toBe(0);
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('without native view transitions switching remains immediate and keyboard usable', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(document, 'startViewTransition', { value: undefined }); });
  await explore(page);
  const radio = mix(page).getByRole('radio', { name: 'Pie', exact: true });
  await radio.focus();
  await page.keyboard.press('Space');
  await expect(radio).toBeChecked();
  await expect(radio).toBeFocused();
  await mix(page).locator('.pie-legend button').first().click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
});

test('rapid switches, clear and same-page replacement cannot revive old chart state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 844 });
  await explore(page);
  await mix(page).getByRole('radio', { name: 'Pie', exact: true }).check();
  await mix(page).getByRole('radio', { name: 'Bars', exact: true }).check();
  await mix(page).getByRole('radio', { name: 'Pie', exact: true }).check();
  // Dispatch together before a deferred transition callback can run.
  await page.evaluate(() => {
    document.querySelector<HTMLInputElement>('.chart input[value=pie]')!.click();
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === 'Clear file')!.click();
  });
  await expect(page.locator('table, .count-chart')).toHaveCount(0);
  await finishMotion(page);
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  await expect(mix(page).getByRole('radio', { name: 'Bars', exact: true })).toBeChecked();
  await expect(role(page).getByRole('radio', { name: 'Bars', exact: true })).toBeChecked();
  await role(page).getByRole('radio', { name: 'Pie', exact: true }).check();
  await page.getByLabel('Choose .xlsx file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Explore procedures' }).click();
  await expect(role(page).getByRole('radio', { name: 'Bars', exact: true })).toBeChecked();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
