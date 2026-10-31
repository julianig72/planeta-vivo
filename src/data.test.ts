import { describe, expect, it } from 'vitest';
import { parseQuakes, parseAurora, replayTime, recentEvents, DAY, solarDirection } from './data';

const now = Date.UTC(2026, 9, 31, 20);
const feature = (time = now - 1000) => ({
  id: 'test-event',
  properties: { type: 'earthquake', mag: 4.5, place: '<script>not HTML</script>', time, updated: now, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/test-event' },
  geometry: { coordinates: [-70, -33, 10] },
});
const feed = (features: unknown[]) => ({ metadata: { generated: now }, features });

describe('USGS parser', () => {
  it('preserves source times, locations, magnitudes and plain text', () => {
    const parsed = parseQuakes(feed([feature()]));
    expect(parsed.events[0]).toMatchObject({ longitude: -70, latitude: -33, depth: 10, magnitude: 4.5, place: '<script>not HTML</script>' });
    expect(parsed.generated).toBe(now);
  });
  it('sorts real events chronologically and skips non-earthquake or invalid records explicitly', () => {
    const nonQuake = feature();
    nonQuake.properties.type = 'explosion';
    const invalid = feature();
    invalid.geometry.coordinates = [0, 150, 10];
    const parsed = parseQuakes(feed([feature(now), feature(now - 1000), nonQuake, invalid]));
    expect(parsed.events.map(event => event.time)).toEqual([now - 1000, now]);
    expect(parsed.skipped).toBe(2);
  });
  it('allows a truly empty feed but rejects malformed envelopes', () => {
    expect(parseQuakes(feed([])).events).toEqual([]);
    expect(() => parseQuakes({ features: [] })).toThrow();
  });
  it('keeps null magnitude as unknown rather than inventing a value', () => {
    const value = feature();
    const raw = { ...value, properties: { ...value.properties, mag: null, url: 'javascript:alert(1)' } };
    expect(parseQuakes(feed([raw])).events[0]).toMatchObject({ magnitude: null, url: null });
  });
  it('filters exactly the last 24h and excludes future events', () => {
    const parsed = parseQuakes(feed([feature(now - DAY - 1), feature(now - DAY), feature(now), feature(now + 1)]));
    expect(recentEvents(parsed, now).map(event => event.time)).toEqual([now - DAY, now]);
  });
});

describe('NOAA parser', () => {
  const raw = { 'Observation Time': '2026-10-31 20:00:00', 'Forecast Time': '2026-10-31T20:45:00Z', coordinates: [[0, 65, 45], [359, -70, 80]] };
  it('interprets UTC metadata and uses the actual grid values', () => {
    const parsed = parseAurora(raw);
    expect(parsed.observation).toBe(now);
    expect(parsed.forecast - parsed.observation).toBe(45 * 60_000);
    expect(parsed.cells).toEqual(raw.coordinates);
    expect(parsed.maximum).toBe(80);
  });
  it('rejects malformed cells, empty grids and invalid temporal metadata', () => {
    expect(() => parseAurora({ ...raw, coordinates: [[0, 65, 101]] })).toThrow();
    expect(() => parseAurora({ ...raw, coordinates: [] })).toThrow();
    expect(() => parseAurora({ ...raw, 'Observation Time': 'not a date' })).toThrow();
    expect(() => parseAurora({ ...raw, 'Forecast Time': '2026-10-31T19:00:00Z' })).toThrow();
  });
});

describe('replay and illumination', () => {
  it('maps the entire 24h window to exactly 30 seconds of playback', () => {
    const start = now - DAY;
    expect(replayTime(start, now, 0)).toBe(start);
    expect(replayTime(start, now, 15 / 30)).toBe(now - DAY / 2);
    expect(replayTime(start, now, 30 / 30)).toBe(now);
    expect(replayTime(start, now, 2)).toBe(now);
    expect(replayTime(start, now, -1)).toBe(start);
  });
  it('returns a unit solar direction that changes with the UTC clock', () => {
    const first = solarDirection(now);
    expect(Math.hypot(...first)).toBeCloseTo(1, 10);
    expect(solarDirection(now + DAY / 2)[0]).toBeCloseTo(-first[0], 2);
  });
});
