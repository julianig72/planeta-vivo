import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { csv } from './gtfs-csv.mjs';

const source = 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip';
let bytes;
if (process.argv[2]) bytes = await readFile(process.argv[2]);
else {
  const response = await fetch(source, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`GTFS AV/LD HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const needed = ['routes.txt', 'trips.txt', 'stops.txt'];
const files = [];
const zip = unzipSync(bytes, { filter: file => { files.push(file.name); return needed.includes(file.name); } });
if (files.includes('shapes.txt')) throw new Error('El GTFS AV/LD ahora incluye shapes.txt: revisar la preparación antes de afirmar que no hay trazados.');
const table = name => {
  if (!zip[name]) throw new Error(`GTFS AV/LD sin ${name}`);
  return csv(new TextDecoder().decode(zip[name]));
};
const routes = {}, trips = {}, stops = {}, networks = {};
const palette = { AVE: '#ffce86', AVLO: '#c49fff', AVANT: '#7cddd2', 'AVE INT': '#ffce86', 'AVANT EXP': '#7cddd2' };
for (const row of table('routes.txt')) {
  const brand = row.route_short_name;
  const network = `av-${brand}`;
  if (Object.hasOwn(palette, brand)) networks[network] = { id: network, name: brand };
  // Keep the entire index so the client can distinguish a non-AV service from an unknown trip.
  routes[row.route_id] = { id: row.route_id, line: brand, name: row.route_long_name || `${brand} · Renfe`,
    color: palette[brand] ?? '#a0b9c8', network, mode: Number(row.route_type) };
}
for (const row of table('trips.txt')) {
  if (!routes[row.route_id]) throw new Error(`Ruta AV/LD desconocida: ${row.route_id}`);
  if (Object.hasOwn(trips, row.trip_id)) throw new Error('trip_id AV/LD duplicado.');
  trips[row.trip_id] = [row.route_id, ''];
}
for (const row of table('stops.txt')) {
  const lat = Number(row.stop_lat), lon = Number(row.stop_lon);
  if (![lat, lon].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Estación AV/LD inválida.');
  stops[row.stop_id] = { id: row.stop_id, name: row.stop_name, coordinates: [lon, lat] };
}
const metadata = { source, preparedAt: new Date().toISOString(), license: 'CC-BY-4.0',
  catalog: 'https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  geometry: 'No shapes.txt in verified source; no inferred tracks.', palette: 'Application palette by product, not official route colors.' };
await mkdir(join('public', 'rail'), { recursive: true }); await mkdir('data', { recursive: true });
await writeFile(join('public', 'rail', 'high-speed.json'), JSON.stringify({ metadata, networks, routes, stops, shapes: {}, lines: [] }));
await writeFile(join('data', 'renfe-high-speed-trips.json'), JSON.stringify(trips));
console.log({ trips: Object.keys(trips).length, routes: Object.keys(routes).length, brands: Object.values(networks), stops: Object.keys(stops).length, metadata });
