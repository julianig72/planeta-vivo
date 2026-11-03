import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSnapshot, isRailData } from '../src/trains-data';

interface Entity {
  id: string;
  vehicle: { timestamp?: string; position: { latitude: number; longitude: number }; trip?: { tripId?: string } };
}
interface Envelope {
  feed: { header: { gtfsRealtimeVersion: string; timestamp: string }; entity: Entity[] };
  receivedAt: number; matches: Record<string, string[]>;
}
let baseline: Envelope, example: Entity;
const captures = process.env.PLANETA_SCREENSHOT_DIR;
async function capture(page: Page, name: string) {
  if (!captures) return;
  await mkdir(captures, { recursive: true });
  await page.screenshot({ path: join(captures, name), fullPage: true });
}
function controlled(time = Date.now(), empty = false): Envelope {
  // Controlled test cases only; never shipped or captured as a live deliverable.
  const entity = structuredClone(example); entity.vehicle.timestamp = String(Math.floor(time / 1000));
  return { feed: { header: { gtfsRealtimeVersion: '2.0', timestamp: String(Math.floor(time / 1000)) }, entity: empty ? [] : [entity] },
    receivedAt: time, matches: baseline.matches };
}
test.beforeAll(async ({ request }) => {
  let response = await request.get('/api/positions');
  for (let attempt = 0; !response.ok() && attempt < 2; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20_000));
    response = await request.get('/api/positions');
  }
  expect(response.ok()).toBe(true); baseline = await response.json();
  const rail = JSON.parse(await readFile(join('public', 'rail', 'network.json'), 'utf8'));
  expect(isRailData(rail)).toBe(true);
  const snapshot = parseSnapshot(baseline, rail);
  expect(snapshot.trains.length).toBeGreaterThan(0);
  const linked = snapshot.trains.find(t => t.route && t.shapeId);
  expect(linked).toBeTruthy();
  example = baseline.feed.entity.find(e => e.id === linked!.key)!;
});

test('fuente real: render, dos snapshots, selección de mapa, seguimiento y pausa', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const received: Envelope[] = [];
  let failures = 0;
  page.on('response', async response => {
    if (response.url().endsWith('/api/positions') && response.status() === 200) received.push(await response.json());
    if (response.url().endsWith('/api/positions') && response.status() === 503) failures++;
  });
  await page.goto('/');
  await expect(page.locator('#train-count')).not.toHaveText('—', { timeout: 75_000 });
  await expect(page.locator('.train-row:not(.old)').first()).toBeVisible();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await page.waitForTimeout(9000);
  await expect(page.locator('#notice')).not.toContainText('Cartografía');
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  await capture(page, 'espana-movimiento-global.png');
  test.skip(await page.locator('.train-row:not(.old)').count() === 0,
    'La fuente dejó de publicar GPS recientes durante esta comprobación; no se sustituye la actividad nocturna por datos ficticios.');
  await page.locator('.train-row:not(.old)').first().click();
  await expect(page.locator('#train-detail')).toBeVisible();
  await expect(page.locator('#follow')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1800);
  await capture(page, 'espana-movimiento-seguimiento.png');
  await page.mouse.move(740, 465); await page.mouse.down(); await page.mouse.move(810, 485, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('#follow')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#follow').click(); await page.waitForTimeout(1500);
  await page.locator('#pause').click();
  await expect(page.locator('#view-state')).toContainText('VISTA CONGELADA');
  await page.locator('#close-detail').click();
  await page.mouse.click(740, 465);
  await expect(page.locator('#train-detail')).toBeVisible();
  await expect(page.locator('#follow')).toBeDisabled();
  const frozen = await page.locator('#view-state').textContent();
  await expect.poll(() => received.length, { timeout: 45_000 }).toBeGreaterThan(1);
  await expect(page.locator('#view-state')).toHaveText(frozen!);
  const first = received[0], next = received[received.length - 1];
  expect(Number(next.feed.header.timestamp)).toBeGreaterThan(Number(first.feed.header.timestamp));
  expect(next.receivedAt - first.receivedAt).toBeGreaterThanOrEqual(20_000);
  const originals = new Map(first.feed.entity.filter(e => e.vehicle?.position).map(e => [e.id, e.vehicle.position]));
  const changed = next.feed.entity.filter(e => {
    const old = originals.get(e.id), point = e.vehicle?.position;
    return old && point && (point.latitude !== old.latitude || point.longitude !== old.longitude);
  });
  expect(changed.length).toBeGreaterThan(0);
  await page.locator('#pause').click(); await page.locator('#clean').click(); await page.locator('#fit').click();
  await page.waitForTimeout(1600);
  await expect(page.locator('#view-state')).not.toContainText('CONGELADA');
  await capture(page, 'espana-movimiento-limpia.png');
  await page.locator('#sources').click();
  await expect(page.locator('#sources-dialog')).toBeVisible();
  await expect(page.locator('#source-times')).toContainText('Última descarga');
  await expect(page.locator('#static-times')).toContainText('Enlaces exactos');
  const unexpected = errors.filter(message => !message.includes('status of 503') &&
    !(message.includes('Renfe · posiciones') && message.includes('HTTP 503')));
  expect(unexpected).toEqual([]);
  console.log(`Renfe real: ${first.feed.entity.length} → ${next.feed.entity.length} entidades, ${changed.length} GPS cambiaron entre snapshots; ${failures} respuestas HTTP 503 reales.`);
});

test('pausa controlada conserva snapshot; al reanudar elimina un tren desaparecido', async ({ page }) => {
  let payload = controlled();
  await page.route('**/api/positions', route => route.fulfill({ json: payload }));
  await page.goto('/'); await expect(page.locator('#train-count')).toHaveText('1');
  await page.clock.install();
  await page.locator('.train-row').first().click(); await page.locator('#pause').click();
  await expect(page.locator('#view-state')).toContainText('CONGELADA');
  const time = await page.evaluate(() => Date.now()); payload = controlled(time + 1000, true);
  await page.clock.fastForward(21_000);
  await expect(page.locator('#source-excluded')).toContainText('0 posiciones válidas');
  await expect(page.locator('#train-count')).toHaveText('1');
  await page.locator('#pause').click();
  await expect(page.locator('#train-count')).toHaveText('0');
  await expect(page.locator('#train-detail')).toBeHidden();
  await expect(page.locator('#empty-state')).toContainText('No hay posiciones');
  await expect(page.locator('#notice')).toContainText('ya no aparece');
});

test('error y antigüedad controlados son explícitos y se recuperan sin actividad ficticia', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  let payload = controlled(await page.evaluate(() => Date.now())), failure = false;
  await page.route('**/api/positions', route => failure ?
    route.fulfill({ status: 503, json: { error: 'Fallo de prueba controlado' } }) : route.fulfill({ json: payload }));
  await page.goto('/'); await expect(page.locator('#train-count')).toHaveText('1');
  await page.locator('.train-row').first().click();
  failure = true; await page.clock.fastForward(21_000);
  await expect(page.locator('#connection')).toContainText('INTERRUMPIDA');
  await expect(page.locator('#train-count')).toHaveText('0');
  await expect(page.locator('.train-row')).toHaveClass(/old/);
  await expect(page.locator('#follow')).toBeDisabled();
  failure = false; payload = controlled(await page.evaluate(() => Date.now()));
  await page.clock.fastForward(21_000);
  await expect(page.locator('#connection')).toContainText('RECIENTES');
  await expect(page.locator('#train-count')).toHaveText('1');
  await page.clock.fastForward(100_000);
  await expect(page.locator('#connection')).toContainText('FEED ANTIGUO');
  await expect(page.locator('#train-count')).toHaveText('0');
  payload = controlled(await page.evaluate(() => Date.now()));
  await page.clock.fastForward(21_000);
  await expect(page.locator('#train-count')).toHaveText('1');
});

test('GTFS indisponible mantiene GPS pero no inventa redes ni trazados', async ({ page }) => {
  const payload = controlled();
  await page.route('**/rail/network.json', route => route.fulfill({ status: 503, body: 'GTFS unavailable in controlled test' }));
  await page.route('**/api/positions', route => route.fulfill({ json: payload }));
  await page.goto('/'); await expect(page.locator('#train-count')).toHaveText('1');
  await expect(page.locator('#network')).toHaveValue('unlinked');
  await expect(page.locator('#notice')).toContainText('GTFS no disponible');
  await expect(page.locator('.train-row .line-badge').first()).toHaveText('GPS');
});

test('sin WebGL la lista sigue accesible también en móvil, sin fingir seguimiento', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (String(args[0]).includes('webgl')) return null;
      return original.apply(this, args);
    };
  });
  await page.route('**/api/positions', route => route.fulfill({ json: controlled() }));
  await page.goto('/'); await expect(page.locator('#train-count')).toHaveText('1');
  await expect(page.locator('#notice')).toContainText('WebGL');
  await expect(page.locator('.train-row')).toBeVisible();
  await page.locator('.train-row').click();
  await expect(page.locator('#train-detail')).toBeVisible();
  await expect(page.locator('#follow')).toBeDisabled();
});

test('fuente real: móvil, cambio de núcleo y composición compacta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await expect(page.locator('#train-count')).not.toHaveText('—', { timeout: 75_000 });
  await page.waitForTimeout(7000);
  await expect(page.locator('#notice')).not.toContainText('Cartografía');
  await capture(page, 'espana-movimiento-movil.png');
  await page.locator('#network').selectOption('n51');
  await expect(page.locator('#network-name')).toHaveText('Rodalies de Catalunya');
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.locator('#fit').click(); await page.waitForTimeout(2000);
  await capture(page, 'espana-movimiento-compact.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
