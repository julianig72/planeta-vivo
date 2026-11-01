export type Coordinate = [number, number];
export interface Route { id: string; line: string; name: string; color: string; network: string; mode: number }
export interface RailData {
  metadata: { preparedAt: string; source: string; license: string };
  networks: Record<string, { id: string; name: string }>;
  routes: Record<string, Route>;
  shapes: Record<string, Coordinate[]>;
  stops: Record<string, { id: string; name: string; coordinates: Coordinate }>;
  lines: { shapeId: string; network: string; line: string; color: string }[];
}
export interface Train {
  key: string; id: string; label: string; tripId: string; coordinates: Coordinate;
  observed: number | null; status: string; stopId: string; platform: string | null;
  route: Route | null; shapeId: string | null; network: string;
}
export interface Snapshot { timestamp: number; receivedAt: number; trains: Train[]; excluded: number }
export const POLL = 20_000, FEED_OLD = 90_000, TRAIN_OLD = 120_000;
export function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function unix(value: unknown): number | null {
  if (!(typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number * 1000 : null;
}
export function coordinates(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n)) &&
    value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}
export function isRailData(value: unknown): value is RailData {
  return record(value) && record(value.metadata) && typeof value.metadata.preparedAt === 'string' &&
    Number.isFinite(Date.parse(value.metadata.preparedAt)) && typeof value.metadata.source === 'string' && typeof value.metadata.license === 'string' &&
    record(value.networks) && Object.values(value.networks).every(n => record(n) && typeof n.id === 'string' && typeof n.name === 'string') &&
    record(value.routes) && Object.values(value.routes).every(r => record(r) && ['id', 'line', 'name', 'color', 'network'].every(k => typeof r[k] === 'string') && typeof r.mode === 'number') &&
    record(value.shapes) && Object.values(value.shapes).every(s => Array.isArray(s) && s.every(coordinates)) &&
    record(value.stops) && Object.values(value.stops).every(s => record(s) && typeof s.id === 'string' && typeof s.name === 'string' && coordinates(s.coordinates)) &&
    Array.isArray(value.lines) && value.lines.every(l => record(l) && ['shapeId', 'network', 'line', 'color'].every(k => typeof l[k] === 'string'));
}
export function parseSnapshot(raw: unknown, rail: RailData | null, now = Date.now()): Snapshot {
  if (!record(raw) || !record(raw.feed) || !record(raw.feed.header) || typeof raw.receivedAt !== 'number' ||
      !Number.isFinite(raw.receivedAt) || raw.receivedAt <= 0 || raw.receivedAt > now + 60_000) throw new Error('Respuesta del servidor incompleta.');
  const feed = raw.feed, header = raw.feed.header;
  const timestamp = unix(header.timestamp);
  if (!timestamp || timestamp > now + 60_000) throw new Error('Renfe no aporta una fecha válida del feed.');
  if (header.gtfsRealtimeVersion !== '2.0') throw new Error('Versión GTFS-RT no compatible.');
  if (header.incrementality !== undefined && header.incrementality !== 0 && header.incrementality !== '0' && header.incrementality !== 'FULL_DATASET') {
    throw new Error('Feed diferencial no compatible: no se puede interpretar como lista completa.');
  }
  const entities = feed.entity ?? [];
  if (!Array.isArray(entities)) throw new Error('Lista de vehículos GTFS-RT inválida.');
  const matches = record(raw.matches) ? raw.matches : {};
  const seen = new Set<string>(), trains: Train[] = [];
  let excluded = 0;
  for (const entity of entities) {
    if (record(entity) && entity.isDeleted === true) continue;
    if (!record(entity) || typeof entity.id !== 'string' || !record(entity.vehicle) || seen.has(entity.id)) { excluded++; continue; }
    seen.add(entity.id);
    const vehicle = entity.vehicle, p = vehicle.position;
    if (!record(p) || typeof p.longitude !== 'number' || typeof p.latitude !== 'number' ||
      !coordinates([p.longitude, p.latitude]) || p.longitude < -10 || p.longitude > 5 || p.latitude < 35 || p.latitude > 44.5) { excluded++; continue; }
    const tripId = record(vehicle.trip) && typeof vehicle.trip.tripId === 'string' ? vehicle.trip.tripId : '';
    const match = Object.hasOwn(matches, tripId) ? matches[tripId] : null;
    const routeId = Array.isArray(match) && typeof match[0] === 'string' ? match[0] : null;
    const route = routeId && rail && Object.hasOwn(rail.routes, routeId) ? rail.routes[routeId] : null;
    if (route && route.mode === 3) { excluded++; continue; }
    const shapeId = Array.isArray(match) && typeof match[1] === 'string' && rail && Object.hasOwn(rail.shapes, match[1]) ? match[1] : null;
    const descriptor = record(vehicle.vehicle) ? vehicle.vehicle : {};
    const label = typeof descriptor.label === 'string' ? descriptor.label : entity.id;
    const observed = unix(vehicle.timestamp);
    if (observed && observed > now + 60_000) { excluded++; continue; }
    const rawStatus = vehicle.currentStatus;
    const status = rawStatus === 1 || rawStatus === 'STOPPED_AT' ? 'STOPPED_AT' :
      rawStatus === 0 || rawStatus === 'INCOMING_AT' ? 'INCOMING_AT' :
      rawStatus === 2 || rawStatus === 'IN_TRANSIT_TO' ? 'IN_TRANSIT_TO' : 'UNKNOWN';
    trains.push({ key: entity.id, id: typeof descriptor.id === 'string' ? descriptor.id : entity.id,
      label, tripId, coordinates: [p.longitude, p.latitude], observed, status,
      stopId: typeof vehicle.stopId === 'string' ? vehicle.stopId : '',
      platform: label.match(/-PLATF\.\(([^)]+)\)/)?.[1] ?? null,
      route, shapeId, network: route?.network ?? 'unlinked' });
  }
  return { timestamp, receivedAt: raw.receivedAt, trains, excluded };
}
export function fresh(train: Train, snapshot: Snapshot, now = Date.now()): boolean {
  return now - snapshot.timestamp < FEED_OLD && train.observed !== null && now - train.observed < TRAIN_OLD;
}
export function lineName(train: Train): string { return train.route?.line ?? 'GPS'; }
export function statusName(train: Train): string {
  return train.status === 'STOPPED_AT' ? 'Parado en estación' : train.status === 'INCOMING_AT' ? 'Aproximándose a estación' :
    train.status === 'IN_TRANSIT_TO' ? 'En tránsito hacia estación' : 'Estado no publicado';
}
export function distance(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180, lat = (b[1] - a[1]) * rad, lon = (b[0] - a[0]) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function canBlend(previous: Train, next: Train): boolean {
  return previous.key === next.key && previous.tripId === next.tripId && previous.observed !== null && next.observed !== null &&
    next.observed > previous.observed && next.observed - previous.observed <= TRAIN_OLD &&
    distance(previous.coordinates, next.coordinates) < 5000;
}
export function blend(a: Coordinate, b: Coordinate, progress: number): Coordinate {
  const t = Math.min(1, Math.max(0, progress));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
