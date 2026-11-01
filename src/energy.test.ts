import { describe, expect, it, vi } from 'vitest';
import {
  HOUR, bounds, midnight, shiftDate, parseDemand, parseGeneration, parseMix, parseBalance,
  widgetURL, intervalIndex, sceneTime, sunrise, solarAltitude, synchronize, fetchRecentDay, type EnergyDay,
} from './energy';
import { mainlandPolygon, insidePolygon } from './energy-scene';

const date = '2026-10-30';
const updated = '2026-10-31T07:20:00+01:00';
function series(id: string, title: string, values: number[], selectedDate = date) {
  return { id, attributes: { title, values: values.map((value, i) => ({ value, percentage: 999, datetime: new Date(midnight(selectedDate) + i * HOUR).toISOString() })) } };
}
function widget<T>(items: T[]) { return { data: { attributes: { 'last-update': updated } }, included: items }; }
const demandRaw = () => widget([series('10297', 'Demanda', Array(24).fill(15))]);
const mixRaw = () => widget([
  series('1458', 'Solar fotovoltaica', [100]), series('1459', 'Solar térmica', [20]), series('10291', 'Eólica', [80]),
  series('1446', 'Nuclear', [100]), series('1454', 'Ciclo combinado', [50]), series('10293', 'Cogeneración', [50]),
  series('10296', 'Generación total', [400]),
]);
const balanceRaw = () => widget([
  { attributes: { content: [
    series('10299', 'Generación renovable', [200]), series('10298', 'Generación no renovable', [200]),
    series('1445', 'Turbinación bombeo', [10]), series('1472', 'Consumo bombeo', [-15]),
    series('10483', 'Saldo almacenamiento', [-5]), series('1474', 'Saldo internacional', [-30]),
    series('1473', 'Enlace Baleares', [-5]), series('10297', 'Demanda', [360]),
  ] } },
]);

function testDay(): EnergyDay {
  return {
    date, ...bounds(date), fetched: Date.now(), attempts: [],
    demand: { data: parseDemand(demandRaw(), date), error: null, received: Date.now() },
    generation: { data: parseGeneration(widget([series('1', 'Sin emisiones', Array(24).fill(12.5)), series('2', 'Con emisiones', Array(24).fill(100 / 24))]), date), error: null, received: Date.now() },
    mix: { data: parseMix(mixRaw(), date), error: null, received: Date.now() },
    balance: { data: parseBalance(balanceRaw(), date), error: null, received: Date.now() },
  };
}

describe('peninsular time and hourly observations', () => {
  it('uses Madrid midnight, including 23- and 25-hour daylight-saving days', () => {
    expect(midnight(date)).toBe(Date.parse('2026-10-30T00:00:00+01:00'));
    expect((bounds('2026-10-25').end - bounds('2026-10-25').start) / HOUR).toBe(25);
    expect((bounds('2026-03-29').end - bounds('2026-03-29').start) / HOUR).toBe(23);
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
  });
  it('keeps actual hourly values and sums them as daily energy', () => {
    const demand = parseDemand(demandRaw(), date);
    expect(demand.points).toHaveLength(24);
    expect(demand.total).toBe(360);
    expect(demand.points[0]).toEqual({ time: midnight(date), value: 15 });
  });
  it('rejects missing hours rather than fabricating samples', () => {
    expect(() => parseDemand(widget([series('10297', 'Demanda', Array(23).fill(15))]), date)).toThrow('24 horas');
  });
  it('keeps distinct repeated clock hours on a 25-hour day', () => {
    const demand = parseDemand(widget([series('10297', 'Demanda', Array(25).fill(15), '2026-10-25')]), '2026-10-25');
    expect(demand.points[3].time - demand.points[2].time).toBe(HOUR);
    expect(demand.total).toBe(375);
  });
  it('rejects wrong dates, duplicates, empty responses and non-finite data', () => {
    expect(() => parseDemand(demandRaw(), '2026-10-29')).toThrow();
    const duplicate = series('10297', 'Demanda', Array(24).fill(15));
    duplicate.attributes.values[1].datetime = duplicate.attributes.values[0].datetime;
    expect(() => parseDemand(widget([duplicate]), date)).toThrow('duplicadas');
    expect(() => parseDemand(widget([]), date)).toThrow();
    expect(() => parseDemand(widget([series('10297', 'Demanda', [NaN])]), date)).toThrow('no numérico');
  });
});

describe('generation, grouping and signed balance', () => {
  it('groups photovoltaic and thermal solar, includes other technologies and ignores source percentages', () => {
    const mix = parseMix(mixRaw(), date);
    expect(mix.groups.find(group => group.id === 'solar')).toMatchObject({ value: 120, share: 0.3 });
    expect(mix.groups.find(group => group.id === 'other')?.technologies[0].title).toBe('Cogeneración');
    expect(mix.groups.reduce((sum, group) => sum + group.share, 0)).toBeCloseTo(1, 12);
    expect(mix.total).toBe(400);
  });
  it('rejects negative technology energy or totals that do not close', () => {
    const raw = mixRaw();
    raw.included.push(series('new', 'Otra tecnología', [50]));
    expect(() => parseMix(raw, date)).toThrow('no suman');
    expect(() => parseMix(widget([series('10296', 'Total', [100]), series('1458', 'Solar', [-100])]), date)).toThrow('negativos');
  });
  it('does not double-count storage totals and keeps negative exports and pumping', () => {
    const balance = parseBalance(balanceRaw(), date);
    expect(balance).toMatchObject({ turbine: 10, pumping: -15, storage: -5, international: -30, balearic: -5, demand: 360 });
    expect(balance.residual).toBe(0);
  });
  it('rejects a non-closing balance', () => {
    const raw = balanceRaw();
    raw.included[0].attributes.content.find(item => item.id === '1474')!.attributes.values[0].value = -20;
    expect(() => parseBalance(raw, date)).toThrow('no cierra');
  });
  it('checks cross-widget totals and removes only unsynchronized layers', () => {
    const day = testDay();
    synchronize(day);
    expect(day.generation.error).toBeNull();
    day.generation.data!.clean[0].value += 20;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    synchronize(day);
    expect(day.generation.data).toBeNull();
    expect(day.generation.error).toContain('no sincronizadas');
    expect(day.demand.data?.total).toBe(360);
    expect(day.mix.data?.total).toBe(400);
    log.mockRestore();
  });
  it('preserves the best available real layers when no candidate has complete demand', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(input);
      const isAvailable = url.searchParams.get('start_date')?.startsWith(date);
      const body = !isAvailable || url.pathname.endsWith('/evolucion') ? widget([]) :
        url.pathname.endsWith('/estructura-generacion') ? mixRaw() :
        url.pathname.endsWith('/balance-electrico') ? balanceRaw() :
        widget([series('1', 'Sin emisiones', Array(24).fill(12.5)), series('2', 'Con emisiones', Array(24).fill(100 / 24))]);
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    try {
      const day = await fetchRecentDay(Date.parse('2026-11-01T12:00:00+01:00'));
      expect(day.date).toBe(date);
      expect(day.demand.data).toBeNull();
      expect(day.mix.data?.total).toBe(400);
      expect(day.generation.data?.clean).toHaveLength(24);
      expect(day.attempts).toHaveLength(3);
    } finally {
      vi.unstubAllGlobals();
      log.mockRestore();
    }
  });
});

describe('replay, geography and API scope', () => {
  it('selects actual intervals without numerical interpolation and clamps the final interval', () => {
    const day = testDay();
    expect(intervalIndex(day, 0)).toBe(0);
    expect(intervalIndex(day, 0.51)).toBe(12);
    expect(intervalIndex(day, 1)).toBe(23);
    expect(sceneTime(day, 0.5)).toBe(day.start + 12 * HOUR);
    expect(sceneTime(day, 1)).toBe(day.end);
  });
  it('finds an approximate astronomical sunrise without using generation to invent a solar profile', () => {
    const day = testDay(), time = sunrise(day);
    expect(time).toBeGreaterThan(day.start + 7 * HOUR);
    expect(time).toBeLessThan(day.start + 10 * HOUR);
    expect(solarAltitude(time)).toBeGreaterThanOrEqual(0);
    expect(solarAltitude(time - 60_000)).toBeLessThan(0);
  });
  it('always explicitly requests the peninsular system and the verified resolution', () => {
    const url = new URL(widgetURL('generacion/estructura-generacion', date, 'day'));
    expect(url.searchParams.get('geo_limit')).toBe('peninsular');
    expect(url.searchParams.get('geo_ids')).toBe('8741');
    expect(url.searchParams.get('time_trunc')).toBe('day');
    expect(url.searchParams.get('end_date')).toBe(`${date}T23:59`);
  });
  it('selects the mainland polygon, not islands, and checks the decorative dot mask', () => {
    const mainland = [[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]];
    const island = [[8, 8], [9, 8], [9, 9], [8, 9], [8, 8]];
    const result = mainlandPolygon({ geometry: { type: 'MultiPolygon', coordinates: [[island], [mainland]] } });
    expect(result).toEqual(mainland);
    expect(insidePolygon(3, 3, result)).toBe(true);
    expect(insidePolygon(8.5, 8.5, result)).toBe(false);
  });
});
