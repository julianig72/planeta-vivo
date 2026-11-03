import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFeedCache, FEED, HIGH_SPEED_FEED } from '../server.mjs';
import { csv } from '../scripts/gtfs-csv.mjs';

const response = () => new Response(JSON.stringify({ header: { gtfsRealtimeVersion: '2.0', timestamp: '1793570000' }, entity: [] }));
test('una sola petición pública por 20 segundos y resultado compartido', async () => {
  let time = 100_000, calls = 0;
  const get = createFeedCache(async url => { assert.equal(url, FEED); calls++; return response(); }, () => time);
  const first = await get();
  time += 19_999; assert.strictEqual(await get(), first); assert.equal(calls, 1);
  time++; assert.notStrictEqual(await get(), first); assert.equal(calls, 2);
});
test('clientes simultáneos comparten la misma consulta en curso', async () => {
  let release, calls = 0;
  const transport = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const get = createFeedCache(transport);
  const requests = Array.from({ length: 12 }, () => get());
  assert.equal(calls, 1); release(response());
  const results = await Promise.all(requests);
  assert.ok(results.every(result => result === results[0]));
});
test('un fallo se comparte sin éxito ficticio con caché vieja y luego se recupera', async () => {
  let time = 100_000, calls = 0;
  const get = createFeedCache(async () => { calls++; return calls === 2 ? new Response('Unavailable', { status: 503 }) : response(); }, () => time);
  await get(); time += 20_000;
  await assert.rejects(get(), /Renfe HTTP 503/);
  time += 19_999; await assert.rejects(get(), /Renfe HTTP 503/); assert.equal(calls, 2);
  time++; assert.ok((await get()).feed); assert.equal(calls, 3);
});
test('se valida el formato y un conjunto realmente vacío sigue siendo vacío', async () => {
  const empty = createFeedCache(async () => new Response(JSON.stringify({ header: { timestamp: '1' } })));
  assert.deepEqual((await empty()).feed.entity, []);
  const invalid = createFeedCache(async () => new Response(JSON.stringify({ header: {}, entity: {} })));
  await assert.rejects(invalid(), /Formato GTFS-RT/);
});
test('geometría oficial incluida e índice exacto coherentes, sin shapes de autobús', async () => {
  const data = JSON.parse(await readFile('public\\rail\\network.json', 'utf8'));
  const trips = JSON.parse(await readFile('data\\renfe-trips.json', 'utf8'));
  assert.ok(Object.keys(trips).length > 100_000);
  assert.ok(Object.values(trips).every(([route]) => Boolean(data.routes[route])));
  assert.ok(data.lines.every(line => data.shapes[line.shapeId]?.length >= 2));
  assert.ok(Object.values(data.shapes).every(points => points.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90)));
  assert.ok(data.metadata.source.includes('ssl.renfe.com')); assert.equal(data.metadata.license, 'CC-BY-4.0');
  const expected = new Set(Object.values(trips).filter(([route, shape]) => data.routes[route].mode !== 3 && data.shapes[shape]?.length >= 2)
    .map(([route, shape]) => `${data.routes[route].network}:${data.routes[route].line}:${shape}`));
  assert.deepEqual(new Set(data.lines.map(line => `${line.network}:${line.line}:${line.shapeId}`)), expected);
});
test('AV/LD tiene URL y caché de 15 segundos independientes de los 20 segundos de Cercanías', async () => {
  let time = 100_000; const calls = [];
  const transport = async url => { calls.push(url); return response(); };
  const cercanias = createFeedCache(transport, () => time);
  const av = createFeedCache(transport, () => time, HIGH_SPEED_FEED, 15_000);
  await Promise.all([cercanias(), av()]);
  time += 14_999; await Promise.all([cercanias(), av()]);
  assert.deepEqual(calls, [FEED, HIGH_SPEED_FEED]);
  time++; await Promise.all([cercanias(), av()]);
  assert.deepEqual(calls, [FEED, HIGH_SPEED_FEED, HIGH_SPEED_FEED]);
  time += 5000; await Promise.all([cercanias(), av()]);
  assert.deepEqual(calls, [FEED, HIGH_SPEED_FEED, HIGH_SPEED_FEED, FEED]);
});
test('GTFS AV/LD conserva índice y marcas reales, sin geometrías fabricadas', async () => {
  const data = JSON.parse(await readFile('public\\rail\\high-speed.json', 'utf8'));
  const trips = JSON.parse(await readFile('data\\renfe-high-speed-trips.json', 'utf8'));
  assert.ok(Object.keys(trips).length > 1000);
  assert.ok(Object.values(trips).every(([route, shape]) => data.routes[route] && shape === ''));
  assert.deepEqual(data.shapes, {}); assert.deepEqual(data.lines, []);
  assert.equal(data.metadata.license, 'CC-BY-4.0');
  assert.deepEqual(Object.values(data.networks).map(n => n.name).sort(), ['AVANT', 'AVANT EXP', 'AVE', 'AVE INT', 'AVLO'].sort());
  assert.ok(Object.values(data.routes).some(route => route.line === 'MD'));
});
test('lector CSV compartido respeta comas entrecomilladas, escapes y padding GTFS', () => {
  assert.deepEqual(csv(' id , name \\r\\n" 01 ","Estación, ""Central"""\\r\\n'.replaceAll('\\r', '\r').replaceAll('\\n', '\n')),
    [{ id: '01', name: 'Estación, "Central"' }]);
  assert.throws(() => csv('id,name\n1,"incomplete'), /incompleto/);
});
