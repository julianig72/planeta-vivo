import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface RawSeries { id: string; attributes: { values: { value: number; datetime: string }[] } }
interface RawData { included: RawSeries[] }
const format = (value: number) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 1000)} GWh`;
function value(raw: RawData, id: string, date: string): number {
  const point = raw.included.find(series => series.id === id)?.attributes.values.find(point => point.datetime.slice(0, 10) === date);
  if (!point) throw new Error(`No actual source point for ${id} on ${date}`);
  return point.value;
}

test('real changing technology generation, exact daily values, replay and dominant responsive chart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = page.waitForResponse(response => response.url().includes('/generacion/estructura-generacion?') && response.status() === 200);
  await page.goto('/');
  await expect(page.locator('#mix-list .mix-row')).toHaveCount(6, { timeout: 35_000 });
  const source = await response;
  const raw: RawData = await source.json();
  const url = new URL(source.url());
  expect(url.searchParams.get('time_trunc')).toBe('day');
  expect(url.searchParams.get('geo_ids')).toBe('8741');
  expect(url.searchParams.get('geo_limit')).toBe('peninsular');
  await expect(page.locator('#energy-map')).toHaveCount(0);
  await expect(page.locator('#generation-chart path[data-technology="solar"]')).not.toHaveCount(0);
  const samples = raw.included.find(series => series.id === '10296')!.attributes.values;
  const firstDate = samples[0].datetime.slice(0, 10);
  const lastDate = samples[samples.length - 1].datetime.slice(0, 10);
  await expect(page.locator('#app')).toHaveAttribute('data-selected-date', lastDate);
  const lastSolar = format(value(raw, '1458', lastDate) + value(raw, '1459', lastDate));
  await expect(page.locator('[data-technology="solar"] .technology-values strong')).toHaveText(lastSolar);
  await expect(page.locator('#generation-total')).toHaveText(format(value(raw, '10296', lastDate)));
  await expect(page.locator('#data-age')).toContainText('NO ES HOY');
  const captures = process.env.PLANETA_SCREENSHOT_DIR;
  if (captures) { await mkdir(captures, { recursive: true }); await page.screenshot({ path: join(captures, 'espana-generacion-global.png') }); }
  await page.locator('#restart').click();
  await expect(page.locator('#app')).toHaveAttribute('data-selected-date', firstDate);
  const firstSolar = format(value(raw, '1458', firstDate) + value(raw, '1459', firstDate));
  await expect(page.locator('[data-technology="solar"] .technology-values strong')).toHaveText(firstSolar);
  expect(firstSolar).not.toBe(lastSolar);
  await page.locator('#next-day').click();
  const secondDate = samples[1].datetime.slice(0, 10);
  await expect(page.locator('#app')).toHaveAttribute('data-selected-date', secondDate);
  await expect(page.locator('[data-technology="wind"] .technology-values strong')).toHaveText(format(value(raw, '10291', secondDate)));
  const change = value(raw, '10291', secondDate) - value(raw, '10291', firstDate);
  const delta = `${change > 0 ? '+' : change < 0 ? '−' : ''}${format(Math.abs(change))}`;
  await expect(page.locator('[data-technology="wind"] .technology-values small')).toHaveText(delta);
  await page.locator('.mix-list [data-technology="solar"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-focus', 'solar');
  await expect(page.locator('#generation-chart path[data-technology="wind"]').first()).toHaveCSS('opacity', '0.07');
  await page.locator('#reset-focus').click();
  const box = await page.locator('#generation-chart').boundingBox();
  const count = Number(await page.locator('#timeline').getAttribute('max')) + 1;
  await page.mouse.move(box!.x + 44 + (7.5 / count) * (box!.width - 60), box!.y + box!.height * 0.5);
  await expect(page.locator('#app')).toHaveAttribute('data-day-index', '7');
  await page.locator('#generation-chart').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#app')).toHaveAttribute('data-day-index', '8');
  if (captures) await page.screenshot({ path: join(captures, 'espana-generacion-exploracion.png') });
  await page.locator('#play-pause').click();
  await page.waitForTimeout(1400);
  expect(Number(await page.locator('#app').getAttribute('data-day-index'))).toBeGreaterThan(8);
  await page.locator('#play-pause').click();
  const paused = await page.locator('#selected-date').textContent();
  await page.waitForTimeout(600);
  expect(await page.locator('#selected-date').textContent()).toBe(paused);
  await page.locator('#restart').click();
  const started = Date.now();
  await page.locator('#play-pause').click();
  await expect(page.locator('#play-state')).toHaveText('Fin del período · volver a reproducir', { timeout: 36_000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(29_000);
  expect(Date.now() - started).toBeLessThan(36_000);
  await expect(page.locator('#app')).toHaveAttribute('data-selected-date', lastDate);
  await expect(page.locator('[data-technology="solar"] .technology-values strong')).toHaveText(lastSolar);
  await page.locator('#sources-button').click();
  await expect(page.locator('#sources-dialog')).toContainText('time_trunc=day');
  await expect(page.locator('#sources-dialog')).toContainText('Canarias, Baleares, Ceuta y Melilla');
  await expect(page.locator('#source-times')).toContainText('Última descarga válida');
  await expect(page.locator('#technology-table')).toContainText('Solar fotovoltaica');
  await page.keyboard.press('Escape');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    const chart = await page.locator('.chart-panel').boundingBox(), mix = await page.locator('.mix-panel').boundingBox();
    const playback = await page.locator('.playback').boundingBox();
    expect(chart!.y + chart!.height).toBeLessThan(playback!.y);
    expect(mix!.y + mix!.height).toBeLessThan(playback!.y);
    expect(chart!.width).toBeGreaterThan(viewport.width * 0.55);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  if (captures) await page.screenshot({ path: join(captures, 'espana-generacion-compact.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const mix = await page.locator('.mix-panel').boundingBox(), playback = await page.locator('.playback').boundingBox();
  expect(mix!.y + mix!.height).toBeLessThan(playback!.y);
  if (captures) await page.screenshot({ path: join(captures, 'espana-generacion-movil.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('failed refresh visibly retains the real time series and recovers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#mix-list .mix-row')).toHaveCount(6, { timeout: 35_000 });
  const total = await page.locator('#generation-total').textContent();
  await page.route('**/generacion/estructura-generacion?**', route => route.abort('failed'));
  await page.locator('#refresh').click();
  await expect(page.locator('#data-notice')).toContainText('Últimos datos conservados', { timeout: 30_000 });
  expect(await page.locator('#generation-total').textContent()).toBe(total);
  await expect(page.locator('#play-pause')).toBeEnabled();
  await page.unroute('**/generacion/estructura-generacion?**');
  await page.locator('#refresh').click();
  await expect(page.locator('#data-notice')).toBeHidden({ timeout: 30_000 });
});

test('an actual missing calendar day is a gap, not zero generation or an interpolated curve', async ({ page }) => {
  let missing = '';
  await page.route('**/generacion/estructura-generacion?**', async route => {
    const response = await route.fetch();
    const raw: RawData = await response.json();
    missing = raw.included.find(series => series.id === '10296')!.attributes.values[5].datetime.slice(0, 10);
    for (const series of raw.included) series.attributes.values = series.attributes.values.filter(point => point.datetime.slice(0, 10) !== missing);
    await route.fulfill({ response, json: raw });
  });
  await page.goto('/');
  await expect(page.locator('#mix-list .mix-row')).toHaveCount(6, { timeout: 35_000 });
  await expect(page.locator('#data-notice')).toContainText('huecos');
  await expect(page.locator(`#generation-chart [data-missing="${missing}"]`)).toHaveCount(1);
  await page.locator('#timeline').evaluate((input: HTMLInputElement) => { input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#app')).toHaveAttribute('data-selected-date', missing);
  await expect(page.locator('#generation-total')).toHaveText('—');
  await expect(page.locator('[data-technology="solar"] .technology-values strong')).toHaveText('—');
  await page.locator('#next-day').click();
  await expect(page.locator('[data-technology="solar"] .technology-values small')).toHaveText('Sin comparación');
});

test('initial source failure is explicit and never substituted with demo measurements', async ({ page }) => {
  await page.route('**/generacion/estructura-generacion?**', route => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('#data-notice')).toContainText('No se puede mostrar evolución real');
  await expect(page.locator('#play-pause')).toBeDisabled();
  await expect(page.locator('#generation-total')).toHaveText('—');
  await expect(page.locator('#generation-chart path[data-technology]')).toHaveCount(0);
});

test('signed group contributions remain negative and are plotted below zero', async ({ page }) => {
  // Controlled signed-source case for rendering only; never shipped as replacement data.
  await page.route('**/generacion/estructura-generacion?**', async route => {
    const response = await route.fetch(), raw: RawData = await response.json();
    const pv = raw.included.find(series => series.id === '1458')!.attributes.values[5];
    const thermal = value(raw, '1459', pv.datetime.slice(0, 10));
    const replacement = -thermal - 10_000;
    const total = raw.included.find(series => series.id === '10296')!.attributes.values[5];
    total.value += replacement - pv.value; pv.value = replacement;
    await route.fulfill({ response, json: raw });
  });
  await page.goto('/');
  await expect(page.locator('#mix-list .mix-row')).toHaveCount(6, { timeout: 35_000 });
  await page.locator('#timeline').evaluate((input: HTMLInputElement) => { input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('.mix-list [data-technology="solar"] strong')).toHaveText(format(-10_000));
  await expect(page.locator('#generation-chart [data-net-total]')).toHaveCount(1);
  const belowZero = await page.evaluate(() => {
    const zero = [...document.querySelectorAll<SVGTextElement>('#generation-chart .chart-label')].find(label => label.textContent === '0')!;
    const dot = document.querySelector<SVGCircleElement>('#generation-chart circle[data-technology="solar"]')!;
    return Number(dot.getAttribute('cy')) > Number(zero.getAttribute('y')) - 3;
  });
  expect(belowZero).toBe(true);
});
