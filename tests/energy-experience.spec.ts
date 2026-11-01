import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test('real REData, peninsular map, daily technologies, hourly replay and responsive layout', async ({ page }) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text()); });
  page.on('request', request => { if (request.url().startsWith('https://apidatos.ree.es/')) apiRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('#demand-value')).not.toHaveText('—', { timeout: 75_000 });
  await expect(page.locator('#mix-list .mix-row')).toHaveCount(6);
  await expect(page.locator('#clean-value')).not.toHaveText('—');
  await expect(page.locator('#balance-status')).toContainText('Producto:');
  await expect(page.locator('#graphics-error')).toBeHidden();
  await expect(page.locator('#energy-map canvas')).toBeVisible();
  await expect(page.locator('#data-age')).toContainText('no son datos de hoy');
  for (const request of apiRequests) {
    const url = new URL(request);
    expect(url.searchParams.get('geo_ids')).toBe('8741');
    expect(url.searchParams.get('geo_limit')).toBe('peninsular');
  }
  const captures = process.env.PLANETA_SCREENSHOT_DIR;
  if (captures) { await mkdir(captures, { recursive: true }); await page.screenshot({ path: join(captures, 'espana-energia-global.png') }); }
  const mixBefore = await page.locator('#mix-list').textContent();
  const solarArc = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('#energy-map canvas')!;
    const gl = canvas.getContext('webgl2')!;
    let view: Float32Array | null = null, projection: Float32Array | null = null;
    const original = gl.useProgram.bind(gl);
    gl.useProgram = program => {
      original(program);
      if (program && gl.getUniformLocation(program, 'daylight')) {
        const v = gl.getUniform(program, gl.getUniformLocation(program, 'modelViewMatrix'));
        const p = gl.getUniform(program, gl.getUniformLocation(program, 'projectionMatrix'));
        if (v instanceof Float32Array && p instanceof Float32Array) { view = v; projection = p; }
      }
    };
    await new Promise(resolve => setTimeout(resolve, 250));
    gl.useProgram = original;
    if (!view || !projection) throw new Error('Map shader matrices unavailable');
    const v: Float32Array = view, p: Float32Array = projection;
    const share = Number(document.querySelector('[data-technology="solar"] strong')!.textContent!.replace('%', '').replace(',', '.')) / 100;
    const angle = 0.38 + share * Math.PI;
    const position = [1.615 * Math.cos(angle), 1.615 * Math.sin(angle), 0.018];
    const t = [v[0] * position[0] + v[4] * position[1] + v[8] * position[2] + v[12], v[1] * position[0] + v[5] * position[1] + v[9] * position[2] + v[13], v[2] * position[0] + v[6] * position[1] + v[10] * position[2] + v[14]];
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (p[0] * t[0] / -t[2] + 1) * rect.width / 2, y: rect.top + (1 - p[5] * t[1] / -t[2]) * rect.height / 2 };
  });
  await page.mouse.click(solarArc.x, solarArc.y);
  await expect(page.locator('#detail-title')).toHaveText('Solar');
  await expect(page.locator('#technology-detail')).toBeVisible();
  await page.locator('#close-detail').click();
  await page.locator('[data-technology="solar"]').click();
  await expect(page.locator('#technology-detail')).toBeVisible();
  await expect(page.locator('#detail-title')).toHaveText('Solar');
  await expect(page.locator('#detail-technologies')).toContainText('Solar fotovoltaica');
  await expect(page.locator('#detail-technologies')).toContainText('Solar térmica');
  await page.locator('#close-detail').click();
  await page.locator('#sunrise').click();
  await expect(page.locator('#play-state')).toHaveText('Reproducción en pausa');
  const sunrise = await page.locator('#scene-clock').textContent();
  expect(sunrise).toMatch(/^0[7-9]:/);
  if (captures) await page.screenshot({ path: join(captures, 'espana-energia-amanecer.png') });
  await page.locator('#play-pause').click();
  await page.waitForTimeout(1500);
  expect(await page.locator('#scene-clock').textContent()).not.toBe(sunrise);
  await page.locator('#play-pause').click();
  const paused = await page.locator('#scene-clock').textContent();
  await page.waitForTimeout(500);
  expect(await page.locator('#scene-clock').textContent()).toBe(paused);
  await page.locator('#timeline').evaluate((input: HTMLInputElement) => { input.value = '750'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#timeline')).toHaveValue('750');
  const hours = Number((await page.locator('#play-date').textContent())?.match(/(\d+) HORAS/)?.[1]);
  await expect(page.locator('#app')).toHaveAttribute('data-hour-index', String(Math.floor(hours * 0.75)));
  expect(await page.locator('#mix-list').textContent()).toBe(mixBefore);
  await page.locator('#overview').click();
  const started = Date.now();
  await page.locator('#play-pause').click();
  await expect(page.locator('#play-state')).toHaveText('Fin del día · volver a reproducir', { timeout: 36_000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(29_000);
  expect(Date.now() - started).toBeLessThan(36_000);
  await expect(page.locator('#scene-clock')).toHaveText('24:00');
  await expect(page.locator('#interval-label')).toContainText('23:00–00:00');
  expect(await page.locator('#mix-list').textContent()).toBe(mixBefore);
  await page.locator('#balance-button').click();
  await expect(page.locator('#sources-dialog')).toBeVisible();
  await expect(page.locator('#balance-table')).toContainText('Consumo de bombeo');
  await expect(page.locator('#source-times')).toContainText('última descarga válida');
  await expect(page.locator('#sources-dialog')).toContainText('Canarias, Baleares, Ceuta y Melilla');
  await page.keyboard.press('Escape');
  await page.locator('#overview').click();
  for (const viewport of [{ width: 1100, height: 700 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    for (const selector of ['.intro', '.side-panel', '.map-controls']) {
      const box = await page.locator(selector).boundingBox();
      const playback = await page.locator('.playback').boundingBox();
      expect(box!.y + box!.height).toBeLessThan(playback!.y);
    }
    const controls = await page.locator('.map-controls').boundingBox();
    const intro = await page.locator('.intro').boundingBox();
    const side = await page.locator('.side-panel').boundingBox();
    expect(controls!.x).toBeGreaterThan(intro!.x + intro!.width);
    expect(controls!.x + controls!.width).toBeLessThan(side!.x);
  }
  if (captures) await page.screenshot({ path: join(captures, 'espana-energia-compact.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (captures) await page.screenshot({ path: join(captures, 'espana-energia-movil.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('a failed mix update retains identified data without disabling the real hourly demand', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#demand-value')).not.toHaveText('—', { timeout: 75_000 });
  await expect(page.locator('#mix-list .mix-row')).toHaveCount(6);
  const mix = await page.locator('#mix-list').textContent();
  await page.route('**/generacion/estructura-generacion?**', route => route.abort('failed'));
  await page.locator('#refresh').click();
  await expect(page.locator('#mix-status')).toContainText('últimos datos conservados', { timeout: 45_000 });
  expect(await page.locator('#mix-list').textContent()).toBe(mix);
  await expect(page.locator('#play-pause')).toBeEnabled();
  await page.unroute('**/generacion/estructura-generacion?**');
  await page.locator('#refresh').click();
  await expect(page.locator('#mix-status')).toContainText('Producto:', { timeout: 45_000 });
});

test('missing hourly observations remain visible as unavailable, never filled in', async ({ page }) => {
  await page.route('**/demanda/evolucion?**', route => route.fulfill({
    // Controlled test envelope only; the application never ships replacement energy data.
    json: { data: { attributes: { 'last-update': '2026-10-31T07:20:00+01:00' } }, included: [{ id: '10297', attributes: { title: 'Demanda', values: [] } }] },
  }));
  await page.goto('/');
  await expect(page.locator('#demand-status')).toContainText('no tiene todas', { timeout: 75_000 });
  await expect(page.locator('#demand-value')).toHaveText('—');
  await expect(page.locator('#play-pause')).toBeDisabled();
  await expect(page.locator('#mix-list .mix-row')).toHaveCount(6);
  await expect(page.locator('#sources-dialog')).toBeHidden();
});
