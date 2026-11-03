import { describe, expect, it } from 'vitest';
import { parseSnapshot, isRailData, fresh, canBlend, blend, distance, lineName, statusName, HIGH_SPEED_NETWORKS, type RailData } from './trains-data';

const now = Date.now(), second = Math.floor(now / 1000);
const rail: RailData = {
  metadata: { preparedAt: new Date(now).toISOString(), source: 'https://data.renfe.com/', license: 'CC-BY-4.0' },
  networks: { n10: { id: 'n10', name: 'Madrid' }, n30: { id: 'n30', name: 'Sevilla' } },
  routes: {
    madrid: { id: 'madrid', network: 'n10', line: 'C1', name: 'Madrid', color: '#123456', mode: 2 },
    sevilla: { id: 'sevilla', network: 'n30', line: 'C1', name: 'Sevilla', color: '#abcdef', mode: 2 },
    bus: { id: 'bus', network: 'n10', line: 'BUS', name: 'Bus', color: '#ffffff', mode: 3 },
  },
  shapes: { madrid: [[-3.7, 40.4], [-3.71, 40.41]], sevilla: [[-5.9, 37.3], [-5.91, 37.31]] },
  stops: { '001': { id: '001', name: 'Estación de prueba', coordinates: [-3.7, 40.4] } },
  lines: [{ shapeId: 'madrid', network: 'n10', line: 'C1', color: '#123456' }],
};
const vehicle = (id = 'a', trip = 'a') => ({ id, vehicle: {
  trip: { tripId: trip }, vehicle: { id, label: 'C1-123-PLATF.(3)' },
  position: { longitude: -3.7, latitude: 40.4 }, timestamp: String(second), currentStatus: 'STOPPED_AT', stopId: '001',
} });
function raw(entity: unknown[] = [vehicle()]) {
  return { feed: { header: { gtfsRealtimeVersion: '2.0', timestamp: String(second) }, entity },
    receivedAt: now, matches: { a: ['madrid', 'madrid'], b: ['sevilla', 'sevilla'], bus: ['bus', 'madrid'] } };
}

describe('posiciones publicadas, sin inferencias', () => {
  it('enlaza viaje y estación exactos y conserva plataforma opcional', () => {
    const snapshot = parseSnapshot(raw(), rail, now), train = snapshot.trains[0];
    expect(train.network).toBe('n10'); expect(train.shapeId).toBe('madrid');
    expect(train.observed).toBe(second * 1000); expect(train.platform).toBe('3');
    expect(rail.stops[train.stopId].name).toBe('Estación de prueba');
    expect(lineName(train)).toBe('C1'); expect(statusName(train)).toBe('Parado en estación');
    expect(train).not.toHaveProperty('speed'); expect(train).not.toHaveProperty('delay');
  });
  it('separa C1 de núcleos diferentes por route_id, no por etiqueta', () => {
    const snapshot = parseSnapshot(raw([vehicle('a'), vehicle('b', 'b')]), rail, now);
    expect(snapshot.trains.map(t => t.network)).toEqual(['n10', 'n30']);
    expect(snapshot.trains.map(lineName)).toEqual(['C1', 'C1']);
  });
  it('no atribuye red ni ruta a un viaje sin enlace o sin GTFS cargado', () => {
    const train = parseSnapshot(raw([vehicle('x', 'unknown')]), rail, now).trains[0];
    expect(train.network).toBe('unlinked'); expect(train.route).toBeNull(); expect(train.shapeId).toBeNull();
    expect(lineName(train)).toBe('GPS');
    expect(parseSnapshot(raw(), null, now).trains[0].route).toBeNull();
  });
  it('excluye GPS inválido, fuera de ámbito, duplicados y autobuses', () => {
    const bad = vehicle('bad'); bad.vehicle.position.latitude = NaN;
    const island = vehicle('island'); island.vehicle.position.latitude = 28;
    const snapshot = parseSnapshot(raw([vehicle(), vehicle(), bad, island, vehicle('bus', 'bus'), null]), rail, now);
    expect(snapshot.trains).toHaveLength(1); expect(snapshot.excluded).toBe(5);
  });
  it('acepta un feed realmente vacío sin crear trenes', () => {
    expect(parseSnapshot(raw([]), rail, now).trains).toEqual([]);
    expect(parseSnapshot({ ...raw(), feed: { header: raw().feed.header } }, rail, now).trains).toEqual([]);
  });
  it('rechaza el feed diferencial y metadatos malformados/futuros', () => {
    expect(() => parseSnapshot({ ...raw(), feed: { ...raw().feed, header: { ...raw().feed.header, incrementality: 'DIFFERENTIAL' } } }, rail, now)).toThrow('diferencial');
    expect(() => parseSnapshot({ ...raw(), receivedAt: 0 }, rail, now)).toThrow();
    expect(() => parseSnapshot({ ...raw(), feed: { ...raw().feed, header: { ...raw().feed.header, timestamp: String(second + 70) } } }, rail, now)).toThrow();
    expect(() => parseSnapshot({ ...raw(), feed: { ...raw().feed, header: { ...raw().feed.header, gtfsRealtimeVersion: '9.0' } } }, rail, now)).toThrow();
  });
  it('interpreta enums numéricos de GTFS correctamente: 0 incoming, 1 stopped, 2 transit', () => {
    for (const [value, status] of [[0, 'INCOMING_AT'], [1, 'STOPPED_AT'], [2, 'IN_TRANSIT_TO']] as const) {
      const source = vehicle();
      expect(parseSnapshot(raw([{ ...source, vehicle: { ...source.vehicle, currentStatus: value } }]), rail, now).trains[0].status).toBe(status);
    }
  });
  it('no sustituye una hora GPS o estado ausentes por la hora del feed', () => {
    const source = vehicle(), { timestamp: _time, currentStatus: _status, vehicle: _label, ...noTime } = source.vehicle;
    const train = parseSnapshot(raw([{ id: 'a', vehicle: noTime }]), rail, now).trains[0];
    expect(train.observed).toBeNull(); expect(train.platform).toBeNull();
    expect(fresh(train, parseSnapshot(raw(), rail, now), now)).toBe(false);
    expect(statusName(train)).toBe('Estado no publicado');
  });
  it('distingue antigüedad individual de la del feed, con umbrales exactos', () => {
    const snapshot = parseSnapshot(raw(), rail, now), train = snapshot.trains[0];
    expect(fresh(train, snapshot, now)).toBe(true);
    expect(fresh({ ...train, observed: now - 120_000 }, snapshot, now)).toBe(false);
    expect(fresh(train, { ...snapshot, timestamp: now - 90_000 }, now)).toBe(false);
  });
  it('un nuevo snapshot no retiene entidades desaparecidas', () => {
    expect(parseSnapshot(raw(), rail, now).trains).toHaveLength(1);
    expect(parseSnapshot(raw([]), rail, now).trains).toHaveLength(0);
  });
});
describe('interpolación visual acotada', () => {
  const train = parseSnapshot(raw(), rail, now).trains[0];
  const next = { ...train, observed: second * 1000 + 20_000, coordinates: [-3.701, 40.401] as [number, number] };
  it('solo anima dos observaciones del mismo identificador/viaje, sin extrapolar', () => {
    expect(canBlend(train, next)).toBe(true);
    expect(canBlend(train, { ...next, tripId: 'another' })).toBe(false);
    expect(canBlend(train, { ...next, observed: train.observed })).toBe(false);
    expect(canBlend(train, { ...next, observed: second * 1000 + 120_001 })).toBe(false);
    expect(canBlend(train, { ...next, coordinates: [-5, 38] })).toBe(false);
    expect(blend(train.coordinates, next.coordinates, 2)).toEqual(next.coordinates);
    expect(blend(train.coordinates, next.coordinates, -1)).toEqual(train.coordinates);
    expect(distance(train.coordinates, next.coordinates)).toBeLessThan(200);
  });
});
it('valida metadata, coordenadas y tipos del GTFS preparado', () => {
  expect(isRailData(rail)).toBe(true);
  expect(isRailData({ ...rail, metadata: { ...rail.metadata, preparedAt: 'invalid' } })).toBe(false);
  expect(isRailData({ ...rail, shapes: { bad: [[999, 40]] } })).toBe(false);
  expect(isRailData({ ...rail, routes: { bad: { ...rail.routes.madrid, mode: 'rail' } } })).toBe(false);
});

describe('alta velocidad: clasificación exacta y hora GPS no inventada', () => {
  const avRail: RailData = { ...rail, shapes: {}, lines: [], routes: {
    ave: { ...rail.routes.madrid, id: 'ave', line: 'AVE', network: 'av-AVE' },
    md: { ...rail.routes.sevilla, id: 'md', line: 'MD', network: 'av-MD' },
    avlo: { ...rail.routes.madrid, id: 'avlo', line: 'AVLO', network: 'av-AVLO' },
  } };
  const matches = { a: ['ave', ''], b: ['md', ''], c: ['avlo', ''] };
  it('solo incluye productos verificados por tripId y no adivina por etiqueta o número', () => {
    const md = vehicle('b', 'b'); md.vehicle.vehicle.label = 'AVE-12345';
    const snapshot = parseSnapshot({ ...raw([vehicle(), md, vehicle('c', 'c'), vehicle('x', 'unknown')]), matches },
      avRail, now, HIGH_SPEED_NETWORKS);
    expect(snapshot.trains.map(lineName)).toEqual(['AVE', 'AVLO']);
    expect(snapshot.filtered).toBe(2); expect(snapshot.excluded).toBe(0);
    expect(snapshot.trains.every(train => train.shapeId === null)).toBe(true);
  });
  it('sin timestamp de vehículo mantiene observado=null, no copia el header ni interpola', () => {
    const first = vehicle(), { timestamp: _time, ...withoutTime } = first.vehicle;
    const snapshot = parseSnapshot({ ...raw([{ id: first.id, vehicle: withoutTime }]), matches }, avRail, now, HIGH_SPEED_NETWORKS);
    const train = snapshot.trains[0];
    expect(train.observed).toBeNull(); expect(fresh(train, snapshot, now)).toBe(false);
    expect(canBlend(train, { ...train, coordinates: [-3.71, 40.41] })).toBe(false);
  });
  it('sin GTFS no etiqueta un GPS desconocido como alta velocidad', () => {
    const snapshot = parseSnapshot({ ...raw(), matches }, null, now, HIGH_SPEED_NETWORKS);
    expect(snapshot.trains).toEqual([]); expect(snapshot.filtered).toBe(1);
  });
  it('no cuenta dos veces un identificador repetido en distintos tramos', () => {
    const snapshot = parseSnapshot({ ...raw([vehicle('a', 'a'), vehicle('a', 'c')]), matches }, avRail, now, HIGH_SPEED_NETWORKS);
    expect(snapshot.trains).toHaveLength(1); expect(snapshot.excluded).toBe(1);
  });
});
