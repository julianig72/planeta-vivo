export const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
export const NOAA_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
export const DAY = 86_400_000;
export const EARTHQUAKE_STALE = 15 * 60_000;
export const AURORA_STALE = 45 * 60_000;

export interface Earthquake {
  id: string;
  magnitude: number | null;
  place: string;
  time: number;
  updated: number;
  longitude: number;
  latitude: number;
  depth: number;
  url: string | null;
}

export interface QuakeFeed {
  generated: number;
  events: Earthquake[];
  skipped: number;
}

export interface AuroraFeed {
  observation: number;
  forecast: number;
  cells: [number, number, number][];
  maximum: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeUSGSLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'earthquake.usgs.gov' ? url.href : null;
  } catch {
    return null;
  }
}

export function parseQuakes(raw: unknown): QuakeFeed {
  if (!record(raw) || !record(raw.metadata) || !finite(raw.metadata.generated) || !Array.isArray(raw.features)) {
    throw new Error('USGS ha devuelto un formato no válido.');
  }
  const events: Earthquake[] = [];
  for (const feature of raw.features) {
    if (!record(feature) || !record(feature.properties) || !record(feature.geometry)) continue;
    const p = feature.properties;
    const c = feature.geometry.coordinates;
    if (p.type !== 'earthquake' || !Array.isArray(c) || !finite(c[0]) || !finite(c[1]) || !finite(c[2]) ||
        c[0] < -180 || c[0] > 180 || c[1] < -90 || c[1] > 90 ||
        !finite(p.time) || !finite(p.updated) || typeof feature.id !== 'string') continue;
    events.push({
      id: feature.id,
      magnitude: finite(p.mag) ? p.mag : null,
      place: typeof p.place === 'string' ? p.place : 'Ubicación no facilitada por USGS',
      time: p.time,
      updated: p.updated,
      longitude: c[0],
      latitude: c[1],
      depth: c[2],
      url: safeUSGSLink(p.url),
    });
  }
  events.sort((a, b) => a.time - b.time);
  return { generated: raw.metadata.generated, events, skipped: raw.features.length - events.length };
}

function utcTime(value: unknown): number {
  if (typeof value !== 'string') throw new Error('NOAA no ha facilitado la hora de su previsión.');
  const normalized = value.trim().replace(' ', 'T');
  const time = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
  if (!Number.isFinite(time)) throw new Error('La hora de NOAA no es válida.');
  return time;
}

export function parseAurora(raw: unknown): AuroraFeed {
  if (!record(raw) || !Array.isArray(raw.coordinates)) throw new Error('NOAA ha devuelto un formato no válido.');
  const observation = utcTime(raw['Observation Time']);
  const forecast = utcTime(raw['Forecast Time']);
  if (forecast < observation) throw new Error('Las horas de la previsión NOAA no son coherentes.');
  const cells: [number, number, number][] = [];
  let maximum = 0;
  for (const cell of raw.coordinates) {
    if (!Array.isArray(cell) || !finite(cell[0]) || !finite(cell[1]) || !finite(cell[2]) ||
        cell[0] < 0 || cell[0] > 360 || cell[1] < -90 || cell[1] > 90 || cell[2] < 0 || cell[2] > 100) {
      throw new Error('La cuadrícula de NOAA contiene una celda no válida.');
    }
    cells.push([cell[0], cell[1], cell[2]]);
    maximum = Math.max(maximum, cell[2]);
  }
  if (!cells.length) throw new Error('La cuadrícula de NOAA está vacía.');
  return { observation, forecast, cells, maximum };
}

export async function fetchJSON(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (!response.ok) throw new Error(`El servidor ha respondido HTTP ${response.status}.`);
  return response.json() as Promise<unknown>;
}

export function recentEvents(feed: QuakeFeed, now: number): Earthquake[] {
  return feed.events.filter(event => event.time >= now - DAY && event.time <= now);
}

export function replayTime(start: number, end: number, progress: number): number {
  return start + (end - start) * Math.min(1, Math.max(0, progress));
}

export function eventProgress(event: Earthquake, start: number, end: number): number {
  return Math.min(1, Math.max(0, (event.time - start) / (end - start)));
}

export function solarDirection(time: number): [number, number, number] {
  const date = new Date(time);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (time - yearStart) / DAY;
  const declination = -23.44 * Math.cos(2 * Math.PI * (dayOfYear + 10) / 365.25) * Math.PI / 180;
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const longitude = (180 - 15 * utcHours) * Math.PI / 180;
  return [Math.cos(declination) * Math.cos(longitude), Math.sin(declination), -Math.cos(declination) * Math.sin(longitude)];
}
