import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSnapshot, HIGH_SPEED_NETWORKS, type RailData } from '../src/trains-data';

interface Entity { id: string; vehicle: { timestamp?: string; position: { latitude: number; longitude: number }; trip: { tripId: string } } }
interface Envelope { feed: { header: { gtfsRealtimeVersion: string; timestamp: string }; entity: Entity[] }; receivedAt: number; matches: Record<string, string[]> }
let baseline: Envelope, example: Entity, rail: RailData;
async function capture(page: Page, name: string) {
  const dir = process.env.PLANETA_SCREENSHOT_DIR;
  if (dir) { await mkdir(dir, { recursive: true }); await page.screenshot({ path: join(dir, name), fullPage: true }); }
}
function fixture(time = Date.now(), empty = false): Envelope {
  // Only for controlled browser tests, never a production data substitute or a published capture.
  const entity = structuredClone(example); delete entity.vehicle.timestamp;
  return { ...baseline, receivedAt: time,
    feed: { header: { gtfsRealtimeVersion: '2.0', timestamp: String(Math.floor(time / 1000)) }, entity: empty ? [] : [entity] } };
}
const emptyCercanias = () => ({ receivedAt: Date.now(), matches: {},
  feed: { header: { gtfsRealtimeVersion: '2.0', timestamp: String(Math.floor(Date.now() / 1000)) }, entity: [] } });
test.beforeAll(async () => {
  rail = JSON.parse(await readFile(join('public', 'rail', 'high-speed.json'), 'utf8'));
  const trips: Record<string, string[]> = JSON.parse(await readFile(join('data', 'renfe-high-speed-trips.json'), 'utf8'));
  const [tripId, match] = Object.entries(trips).find(([, match]) => HIGH_SPEED_NETWORKS.has(rail.routes[match[0]].network))!;
  const [longitude, latitude] = Object.values(rail.stops).find(({ coordinates: [lon, lat] }) =>
    lon >= -10 && lon <= 5 && lat >= 35 && lat <= 44.5)!.coordinates;
  // Synthetic only inside controlled tests. Real-source tests below use unmodified HTTP responses.
  example = { id: 'TEST_ONLY_AV', vehicle: { trip: { tripId }, position: { latitude, longitude } } };
  baseline = { feed: { header: { gtfsRealtimeVersion: '2.0', timestamp: '1' }, entity: [] },
    receivedAt: 1, matches: { [tripId]: match } };
});

test('AV real: productos enlazados, reloj del feed, selección y actualizaciones separadas 15 s', async ({ page }) => {
  const received: Envelope[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.url().endsWith('/api/high-speed/positions') && response.status() === 200) received.push(await response.json());
  });
  await page.goto('/'); await page.locator('#service').selectOption('avld');
  await expect(page.locator('#train-count')).not.toHaveText('—', { timeout: 75_000 });
  await expect(page.locator('#count-label')).toHaveText('POSICIONES PUBLICADAS EN EL MAPA');
  await expect(page.locator('#view-state')).toContainText('NO ES LA HORA GPS');
  await expect(page.locator('#notice')).toContainText('sin hora GPS individual');
  await expect(page.locator('#live-dot')).not.toHaveClass(/live/);
  await page.waitForTimeout(7000);
  await expect(page.locator('#notice')).not.toContainText('Cartografía');
  const available = await page.locator('.train-row').count();
  await capture(page, available ? 'espana-alta-velocidad-general.png' : 'espana-alta-velocidad-sin-servicio.png');
  await page.locator('#pause').click();
  await expect(page.locator('#view-state')).toContainText('CONGELADA');
  if (available) {
    const product = await page.locator('.train-row .line-badge').first().textContent();
    expect(product).toBeTruthy();
    await page.locator('#network').selectOption(`av-${product}`);
    await expect(page.locator('#network-name')).toHaveText(product!);
    await expect(page.locator('.train-row').first()).toBeVisible();
    expect((await page.locator('.train-row .line-badge').allTextContents()).every(name => name === product)).toBe(true);
    await page.locator('.train-row').first().click();
    await expect(page.locator('#detail-time')).toHaveText('No publicada');
    await expect(page.locator('#detail-age')).toHaveText('Hora propia no publicada');
    await expect(page.locator('#follow')).toBeDisabled();
    await expect(page.locator('#follow-note')).toContainText('sin interpolación');
    await page.waitForTimeout(1500);
    await capture(page, 'espana-alta-velocidad-seleccion.png');
  } else {
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#train-count')).toHaveText('0');
    console.log('AV real: no hay productos AV publicados en esta franja; se verifica el estado vacío sin trenes de sustitución.');
  }
  await expect.poll(() => received.filter(item => item.receivedAt > received[0].receivedAt).length, { timeout: 75_000 }).toBeGreaterThan(0);
  const first = received[0], next = received[received.length - 1];
  expect(next.receivedAt - first.receivedAt).toBeGreaterThanOrEqual(15_000);
  expect(Number(next.feed.header.timestamp)).toBeGreaterThan(Number(first.feed.header.timestamp));
  const parsed = parseSnapshot(next, rail, Date.now(), HIGH_SPEED_NETWORKS);
  expect(parsed.trains.every(train => train.route && HIGH_SPEED_NETWORKS.has(train.route.network))).toBe(true);
  expect(parsed.trains.every(train => train.shapeId === null)).toBe(true);
  const withoutOwnTime = next.feed.entity.filter(entity => !entity.vehicle.timestamp).length;
  console.log(`AV/LD real: ${next.feed.entity.length} registros; ${parsed.trains.length} productos AV únicos; ${withoutOwnTime} sin timestamp individual. Cadencia ${next.receivedAt - first.receivedAt} ms.`);
  await expect(page.locator('#view-state')).toContainText('CONGELADA');
  if (available) await expect(page.locator('#follow')).toBeDisabled();
  await page.locator('#pause').click(); await page.locator('#network').selectOption('all-av');
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#fit').click(); await page.waitForTimeout(2500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, 'espana-alta-velocidad-movil.png');
  await page.locator('#service').selectOption('cercanias');
  await expect(page.locator('#count-label')).toHaveText('POSICIONES GPS RECIENTES');
  await expect(page.locator('#source-times')).toContainText('Cercanías', { timeout: 75_000 });
  expect(errors).toEqual([]);
});

test('AV antigua: posiciones visibles y contadas sin presentarlas como recientes', async ({ page }) => {
  const payload = fixture(Date.now() - 3_600_000);
  payload.receivedAt = Date.now();
  await page.route('**/api/positions', route => route.fulfill({ json: emptyCercanias() }));
  await page.route('**/api/high-speed/positions', route => route.fulfill({ json: payload }));
  await page.goto('/'); await page.locator('#service').selectOption('avld');
  await expect(page.locator('#train-count')).toHaveText('1');
  await expect(page.locator('#count-label')).toHaveText('POSICIONES PUBLICADAS EN EL MAPA');
  await expect(page.locator('#connection')).toContainText('FEED ANTIGUO');
  await expect(page.locator('#notice')).toContainText('0/1 posiciones en un feed reciente');
  await expect(page.locator('#network option:checked')).toContainText('· 1');
  await expect(page.locator('.train-row')).toHaveCount(1);
  await expect(page.locator('.train-row')).toHaveClass(/old/);
  await page.locator('.train-row').click();
  await expect(page.locator('#detail-time')).toHaveText('No publicada');
  await expect(page.locator('#follow')).toBeDisabled();
  await page.locator('#network').selectOption(`av-${rail.routes[baseline.matches[example.vehicle.trip.tripId][0]].line}`);
  await expect(page.locator('#train-count')).toHaveText('1');
  await expect(page.locator('.train-row')).toHaveCount(1);
});

test('AV controlada: error, recuperación y desaparición no se sustituyen por Cercanías', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  let payload = fixture(await page.evaluate(() => Date.now())), failed = false;
  await page.route('**/api/positions', route => route.fulfill({ json: emptyCercanias() }));
  await page.route('**/api/high-speed/positions', route => failed ? route.fulfill({ status: 503, json: { error: 'AV test failure' } }) : route.fulfill({ json: payload }));
  await page.goto('/'); await page.locator('#service').selectOption('avld');
  await expect(page.locator('#train-count')).toHaveText('1', { timeout: 30_000 });
  await page.locator('.train-row').click();
  await expect(page.locator('#detail-time')).toHaveText('No publicada');
  await expect(page.locator('#follow')).toHaveAttribute('aria-pressed', 'true');
  failed = true; await page.clock.fastForward(16_000);
  await expect(page.locator('#connection')).toContainText('INTERRUMPIDA');
  await expect(page.locator('#train-count')).toHaveText('1');
  await expect(page.locator('#notice')).toContainText('0/1 posiciones en un feed reciente');
  await expect(page.locator('#follow')).toBeDisabled();
  failed = false; payload = fixture(await page.evaluate(() => Date.now()));
  await page.clock.fastForward(16_000);
  await expect(page.locator('#connection')).toContainText('RECIENTE');
  await expect(page.locator('#train-count')).toHaveText('1');
  payload = fixture(await page.evaluate(() => Date.now()), true);
  await page.clock.fastForward(16_000);
  await expect(page.locator('#train-count')).toHaveText('0');
  await expect(page.locator('#train-detail')).toBeHidden();
  await expect(page.locator('#notice')).toContainText('ya no aparece');
  await page.locator('#service').selectOption('cercanias');
  await expect(page.locator('#connection')).not.toContainText('INTERRUMPIDA');
  await expect(page.locator('#view-state')).not.toContainText('AV/LD');
});

test('sin GTFS AV no se atribuyen GPS desconocidos a alta velocidad', async ({ page }) => {
  await page.route('**/api/positions', route => route.fulfill({ json: emptyCercanias() }));
  await page.route('**/api/high-speed/positions', route => route.fulfill({ json: fixture() }));
  await page.route('**/rail/high-speed.json', route => route.fulfill({ status: 503, body: 'Controlled static failure' }));
  await page.goto('/'); await page.locator('#service').selectOption('avld');
  await expect(page.locator('#train-count')).toHaveText('0');
  await expect(page.locator('#notice')).toContainText('no se pueden clasificar');
  await expect(page.locator('#empty-state')).toContainText('Sin GTFS');
  await expect(page.locator('.train-row')).toHaveCount(0);
});

test('cambiar de fuente conserva núcleo y descarta la respuesta AV anterior que llega tarde', async ({ page }) => {
  let release: (() => Promise<void>) | undefined;
  await page.route('**/api/positions', route => route.fulfill({ json: emptyCercanias() }));
  await page.route('**/api/high-speed/positions', async route => { release = () => route.fulfill({ json: fixture() }); });
  await page.goto('/'); await expect(page.locator('#train-count')).toHaveText('0', { timeout: 30_000 });
  await page.locator('#network').selectOption('n30');
  await page.locator('#service').selectOption('avld');
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.locator('#service').selectOption('cercanias');
  await expect(page.locator('#network')).toHaveValue('n30');
  await release!();
  await expect(page.locator('#source-times')).toContainText('Cercanías');
  await expect(page.locator('#train-count')).toHaveText('0');
  await expect(page.locator('#network')).toHaveValue('n30');
});
