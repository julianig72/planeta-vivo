import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test('real feeds, globe, selection, 30-second replay and responsive layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('#quake-status')).toContainText('Feed:', { timeout: 45_000 });
  await expect(page.locator('#aurora-status')).toContainText('Observación:', { timeout: 45_000 });
  await expect(page.locator('#graphics-error')).toBeHidden();
  await expect(page.locator('#globe canvas')).toBeVisible();
  const count = Number(await page.locator('#quake-count').textContent());
  expect(count).toBeGreaterThan(0);
  await expect(page.locator('.event-row')).toHaveCount(count);
  const screenshotDirectory = process.env.PLANETA_SCREENSHOT_DIR;
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: join(screenshotDirectory, 'planeta-vivo-global.png') });
  }
  await page.locator('.event-row').first().click();
  await expect(page.locator('#detail-card')).toBeVisible();
  await expect(page.locator('#detail-label')).toHaveText('EVENTO RECIENTE · USGS');
  await expect(page.locator('#detail-link')).toHaveAttribute('href', /^https:\/\/earthquake\.usgs\.gov\//);
  await page.locator('#detail-close').click();
  await page.locator('#view-aurora').click();
  await page.waitForTimeout(2200);
  if (screenshotDirectory) await page.screenshot({ path: join(screenshotDirectory, 'planeta-vivo-auroras.png') });
  await page.locator('#replay-mode').click();
  await expect(page.locator('#clock-label')).toContainText('HISTÓRICA');
  await expect(page.locator('#aurora-toggle')).toBeDisabled();
  await expect(page.locator('#globe-caption')).toContainText('AURORAS OCULTAS');
  const start = await page.locator('#scene-clock').textContent();
  await page.waitForTimeout(1500);
  expect(await page.locator('#scene-clock').textContent()).not.toBe(start);
  await page.locator('#play-pause').click();
  await expect(page.locator('#playback-description')).toHaveText('REPRODUCCIÓN EN PAUSA');
  const paused = await page.locator('#scene-clock').textContent();
  await page.waitForTimeout(700);
  expect(await page.locator('#scene-clock').textContent()).toBe(paused);
  await page.locator('#timeline').evaluate((input: HTMLInputElement) => {
    input.value = '500';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#timeline')).toHaveValue('500');
  expect(Number(await page.locator('#quake-count').textContent())).toBeLessThan(count);
  if (screenshotDirectory) await page.screenshot({ path: join(screenshotDirectory, 'planeta-vivo-reproduccion.png') });
  await page.locator('#timeline').evaluate((input: HTMLInputElement) => {
    input.value = '990';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#play-pause').click();
  await expect(page.locator('#playback-description')).toHaveText('FIN DE LA REPRODUCCIÓN', { timeout: 5000 });
  const replayStarted = Date.now();
  await page.locator('#replay-mode').click();
  await expect(page.locator('#playback-description')).toHaveText('FIN DE LA REPRODUCCIÓN', { timeout: 36_000 });
  const duration = Date.now() - replayStarted;
  expect(duration).toBeGreaterThanOrEqual(29_000);
  expect(duration).toBeLessThan(36_000);
  await page.locator('#live-mode').click();
  await expect(page.locator('#aurora-toggle')).toBeEnabled();
  await expect(page.locator('#clock-label')).toContainText('HORA ACTUAL');
  await page.locator('#quakes-toggle').click();
  await expect(page.locator('#quakes-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#quakes-toggle').click();
  await page.locator('#sources-button').click();
  await expect(page.locator('#sources-dialog')).toBeVisible();
  await expect(page.locator('#quake-source-time')).toContainText('Generación:');
  await expect(page.locator('#aurora-source-time')).toContainText('Previsión:');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#globe canvas')).toBeVisible();
  if (screenshotDirectory) await page.screenshot({ path: join(screenshotDirectory, 'planeta-vivo-movil.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('independent network failures are visible and retry recovers real data', async ({ page }) => {
  await page.clock.install();
  await page.route('**/ovation_aurora_latest.json', route => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('#quake-status')).toContainText('Feed:', { timeout: 45_000 });
  await expect(page.locator('#aurora-status')).toContainText('NOAA no disponible.');
  await expect(page.locator('#retry-aurora')).toBeVisible();
  expect(Number(await page.locator('#quake-count').textContent())).toBeGreaterThan(0);
  await page.unroute('**/ovation_aurora_latest.json');
  await page.locator('#retry-aurora').click();
  await expect(page.locator('#aurora-status')).toContainText('Observación:', { timeout: 45_000 });
  await expect(page.locator('#retry-aurora')).toBeHidden();
  await page.route('**/all_day.geojson', route => route.abort('failed'));
  await page.clock.fastForward(61_000);
  await expect(page.locator('#quake-status')).toContainText('Conservamos la última descarga.');
  expect(Number(await page.locator('#quake-count').textContent())).toBeGreaterThan(0);
  await expect(page.locator('#aurora-status')).toContainText('Observación:');
  await page.reload();
  await expect(page.locator('#quake-status')).toContainText('USGS no disponible.');
  await expect(page.locator('#replay-mode')).toBeDisabled();
  await expect(page.locator('#aurora-status')).toContainText('Observación:', { timeout: 45_000 });
  await page.unroute('**/all_day.geojson');
  await page.locator('#retry-quakes').click();
  await expect(page.locator('#quake-status')).toContainText('Feed:', { timeout: 45_000 });
});

test('empty and stale feeds are explicitly identified, without replacement events', async ({ page }) => {
  // Controlled test responses only; the shipped application has no sample-data path.
  await page.route('**/all_day.geojson', route => route.fulfill({
    json: { metadata: { generated: Date.now() - 60 * 60_000 }, features: [] },
  }));
  await page.route('**/ovation_aurora_latest.json', route => route.fulfill({
    json: {
      'Observation Time': new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      'Forecast Time': new Date(Date.now() - 60 * 60_000).toISOString(),
      coordinates: [[0, 65, 0]],
    },
  }));
  await page.goto('/');
  await expect(page.locator('#quake-count')).toHaveText('0');
  await expect(page.locator('.empty')).toContainText('No hay terremotos publicados');
  await expect(page.locator('#quake-status')).toContainText('Datos antiguos');
  await expect(page.locator('#aurora-status')).toContainText('Previsión vencida o datos antiguos');
  await expect(page.locator('.event-row')).toHaveCount(0);
});
