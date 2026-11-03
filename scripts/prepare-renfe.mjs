import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { csv } from './gtfs-csv.mjs';

export const SOURCE = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';
const names = { '10': 'Madrid', '20': 'Asturias', '30': 'Sevilla', '31': 'Cádiz', '32': 'Málaga',
  '40': 'Valencia', '41': 'Murcia / Alicante', '45': 'Cartagena', '46': 'Ferrol',
  '47': 'León', '51': 'Rodalies de Catalunya', '60': 'Bilbao', '61': 'San Sebastián', '62': 'Cantabria', '70': 'Zaragoza' };

const file = process.argv[2];
let bytes;
if (file) bytes = await readFile(file);
else {
  const response = await fetch(SOURCE, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`Descarga GTFS HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const needed = ['routes.txt', 'trips.txt', 'stops.txt', 'shapes.txt'];
const zip = unzipSync(bytes, { filter: file => needed.includes(file.name) });
const table = name => { if (!zip[name]) throw new Error(`GTFS sin ${name}`); return csv(new TextDecoder().decode(zip[name])); };
const routes = {}, trips = {}, shapes = {}, stops = {}, networks = {};
for (const row of table('routes.txt')) {
  const prefix = row.route_id.split('T')[0], network = `n${prefix}`;
  networks[network] = { id: network, name: names[prefix] ?? `Red GTFS ${prefix}` };
  routes[row.route_id] = { id: row.route_id, line: row.route_short_name, name: row.route_long_name.replace(/\s+/g, ' '),
    color: /^[\da-f]{6}$/i.test(row.route_color) ? `#${row.route_color}` : '#a0b9c8', network, mode: Number(row.route_type) };
}
for (const row of table('shapes.txt')) {
  const lat = Number(row.shape_pt_lat), lon = Number(row.shape_pt_lon), sequence = Number(row.shape_pt_sequence);
  if (![lat, lon, sequence].every(Number.isFinite) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error('Shape GTFS inválido.');
  (shapes[row.shape_id] ??= []).push([lon, lat, sequence]);
}
for (const [id, points] of Object.entries(shapes)) shapes[id] = points.sort((a, b) => a[2] - b[2]).map(([lon, lat]) => [lon, lat]);
for (const row of table('trips.txt')) {
  if (!routes[row.route_id]) throw new Error(`Ruta desconocida: ${row.route_id}`);
  if (Object.hasOwn(trips, row.trip_id)) throw new Error('trip_id duplicado.');
  trips[row.trip_id] = [row.route_id, row.shape_id];
}
for (const row of table('stops.txt')) {
  const lat = Number(row.stop_lat), lon = Number(row.stop_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Estación sin coordenadas.');
  stops[row.stop_id] = { id: row.stop_id, name: row.stop_name, coordinates: [lon, lat] };
}
const lines = [], seen = new Set();
for (const [routeId, shapeId] of Object.values(trips)) {
  const route = routes[routeId], key = `${route.network}:${route.line}:${shapeId}`;
  if (route.mode === 3 || !shapes[shapeId] || shapes[shapeId].length < 2 || seen.has(key)) continue;
  seen.add(key); lines.push({ shapeId, network: route.network, line: route.line, color: route.color });
}
const metadata = { source: SOURCE, preparedAt: new Date().toISOString(), sha256: createHash('sha256').update(bytes).digest('hex'),
  license: 'CC-BY-4.0', catalog: 'https://data.renfe.com/dataset/horarios-cercanias' };
await mkdir(join('public', 'rail'), { recursive: true }); await mkdir('data', { recursive: true });
await writeFile(join('public', 'rail', 'network.json'), JSON.stringify({ metadata, networks, routes, shapes, stops, lines }));
await writeFile(join('data', 'renfe-trips.json'), JSON.stringify(trips));
console.log({ trips: Object.keys(trips).length, routes: Object.keys(routes).length, shapes: Object.keys(shapes).length,
  stops: Object.keys(stops).length, lines: lines.length, metadata });
