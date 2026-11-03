import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { type Coordinate, type RailData, type Train, lineName } from './trains-data';

export interface VisualTrain { train: Train; coordinates: Coordinate; recent: boolean }
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
maplibregl.setWorkerUrl(workerUrl);
const BASE: StyleSpecification = { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#07131b' } }] };

export class TrainMap {
  readonly map: maplibregl.Map;
  private rail: RailData | null = null;
  private network = '';
  private selected: Train | null = null;
  private visuals: VisualTrain[] = [];
  private following = false;
  private ready = false;
  private warned = false;
  constructor(container: HTMLElement, select: (key: string) => void, stopFollow: () => void, warning: (message: string, fatal?: boolean) => void) {
    this.map = new maplibregl.Map({ container, style: BASE, center: [-3.7, 40.4], zoom: 8, pitch: 35,
      attributionControl: false, maxPitch: 60 });
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    this.map.on('style.load', () => { this.ready = true; this.layers(); });
    this.map.on('click', event => {
      if (!this.map.getLayer('trains')) return;
      const feature = this.map.queryRenderedFeatures(event.point, { layers: ['trains'] })[0];
      if (feature && typeof feature.properties?.key === 'string') select(feature.properties.key);
    });
    this.map.on('mousemove', event => {
      if (this.map.getLayer('trains')) this.map.getCanvas().style.cursor =
        this.map.queryRenderedFeatures(event.point, { layers: ['trains'] }).length ? 'pointer' : '';
    });
    this.map.on('movestart', event => { if (event.originalEvent) { this.following = false; stopFollow(); } });
    this.map.on('error', event => {
      if (!this.warned) {
        this.warned = true; console.error('Cartografía', event.error);
        const fatal = /Worker failed|WebGL/i.test(event.error.message);
        warning(fatal ? 'No se pudo iniciar el motor del mapa. Las posiciones siguen disponibles en la lista.' :
          'Cartografía incompleta. Las posiciones y los trazados GTFS siguen siendo independientes.', fatal);
      }
    });
    void fetch('https://tiles.openfreemap.org/styles/dark', { signal: AbortSignal.timeout(12_000) })
      .then(async response => {
        if (!response.ok) throw new Error(`Mapa base HTTP ${response.status}`);
        const style: StyleSpecification = await response.json();
        this.ready = false; this.map.setStyle(style, { diff: false });
      })
      .catch(error => { console.error('Mapa base', error); warning('Mapa base no disponible. Se muestran posiciones y trazados reales sobre fondo neutro.'); });
  }
  setRail(rail: RailData | null): void { this.rail = rail; if (this.ready) this.layers(); }
  private source(name: string, data: FeatureCollection): void {
    const existing = this.map.getSource<GeoJSONSource>(name);
    if (existing) existing.setData(data); else this.map.addSource(name, { type: 'geojson', data });
  }
  private layers(): void {
    const rail = this.rail;
    const lines: FeatureCollection<LineString> = { type: 'FeatureCollection', features: (rail?.lines ?? []).flatMap(line =>
      rail?.shapes[line.shapeId] ? [{ type: 'Feature' as const, properties: line,
        geometry: { type: 'LineString' as const, coordinates: rail.shapes[line.shapeId] } }] : []) };
    const stops: FeatureCollection<Point> = { type: 'FeatureCollection', features: Object.values(rail?.stops ?? {}).map(stop => ({
      type: 'Feature', properties: { name: stop.name }, geometry: { type: 'Point', coordinates: stop.coordinates },
    })) };
    this.source('rails', lines); this.source('stations', stops); this.source('positions', EMPTY); this.source('chosen-route', EMPTY);
    if (!this.map.getLayer('rail-glow')) {
      this.map.addLayer({ id: 'rail-glow', type: 'line', source: 'rails', paint: { 'line-color': ['get', 'color'], 'line-width': 8, 'line-blur': 6, 'line-opacity': .33 } });
      this.map.addLayer({ id: 'rail-line', type: 'line', source: 'rails', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': .72 } });
      this.map.addLayer({ id: 'selected-route', type: 'line', source: 'chosen-route', paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': .85 } });
      this.map.addLayer({ id: 'station-dots', type: 'circle', source: 'stations', minzoom: 9, paint: { 'circle-radius': 2.2, 'circle-color': '#c4dedb', 'circle-opacity': .45 } });
      this.map.addLayer({ id: 'station-names', type: 'symbol', source: 'stations', minzoom: 11,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-offset': [0, 1.2] },
        paint: { 'text-color': '#a8c6c8', 'text-halo-color': '#09151c', 'text-halo-width': 2 } });
      this.map.addLayer({ id: 'train-halo', type: 'circle', source: 'positions', paint: { 'circle-radius': 15, 'circle-blur': .8, 'circle-color': ['get', 'color'], 'circle-opacity': .28 } });
      this.map.addLayer({ id: 'trains', type: 'circle', source: 'positions', paint: { 'circle-radius': ['case', ['get', 'selected'], 8, 5],
        'circle-color': ['get', 'color'], 'circle-stroke-color': '#061018', 'circle-stroke-width': 2 } });
      this.map.addLayer({ id: 'train-labels', type: 'symbol', source: 'positions', minzoom: 10,
        layout: { 'text-field': ['get', 'line'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, -1.3] },
        paint: { 'text-color': '#e2f3f1', 'text-halo-color': '#07131b', 'text-halo-width': 2 } });
      this.map.addLayer({ id: 'selected-ring', type: 'circle', source: 'positions', filter: ['==', ['get', 'selected'], true],
        paint: { 'circle-radius': 14, 'circle-color': '#000000', 'circle-opacity': 0, 'circle-stroke-color': '#e1f6f2', 'circle-stroke-width': 1.3 } });
    }
    this.setNetwork(this.network); this.setSelected(this.selected); this.render(this.visuals);
  }
  setNetwork(network: string): void {
    this.network = network;
    for (const id of ['rail-glow', 'rail-line']) if (this.map.getLayer(id)) this.map.setFilter(id, ['==', ['get', 'network'], network]);
  }
  setSelected(train: Train | null): void {
    this.selected = train;
    if (!this.ready) return;
    const coordinates = train?.shapeId && this.rail?.shapes[train.shapeId];
    this.source('chosen-route', coordinates ? { type: 'FeatureCollection', features: [{
      type: 'Feature', properties: { color: train?.route?.color ?? '#91efd1' }, geometry: { type: 'LineString', coordinates },
    }] } : EMPTY);
  }
  render(visuals: VisualTrain[]): void {
    this.visuals = visuals;
    if (!this.ready || !this.map.getSource('positions')) return;
    const data: FeatureCollection<Point> = { type: 'FeatureCollection', features: visuals.map(({ train, coordinates, recent }) => ({
      type: 'Feature', properties: { key: train.key, color: recent ? train.route?.color ?? '#a8c1cf' : '#637881',
        line: lineName(train), selected: train.key === this.selected?.key }, geometry: { type: 'Point', coordinates },
    })) };
    this.source('positions', data);
    const train = visuals.find(visual => visual.train.key === this.selected?.key);
    if (this.following && train && !this.map.isMoving()) {
      const center = this.map.getCenter();
      if (Math.abs(center.lng - train.coordinates[0]) + Math.abs(center.lat - train.coordinates[1]) > 0.000001) this.map.setCenter(train.coordinates);
    }
  }
  follow(active: boolean): void {
    this.following = active;
    if (active && this.selected) {
      const width = this.map.getContainer().clientWidth;
      this.map.easeTo({ center: this.selected.coordinates, zoom: Math.max(12, this.map.getZoom()), pitch: 40, duration: 1000,
        padding: width < 700 ? { top: 270, bottom: 230, left: 35, right: 35 } :
          { top: 130, bottom: 100, left: width < 1100 ? 320 : 370, right: width < 1100 ? 270 : 330 } });
    }
  }
  fit(trains: Train[], clean: boolean): void {
    this.following = false;
    let points = trains.length ? trains.map(train => train.coordinates) : (this.rail?.lines.filter(line => line.network === this.network)
      .flatMap(line => this.rail?.shapes[line.shapeId] ?? []) ?? []);
    if (!points.length && (this.network === 'all-av' || this.network.startsWith('av-'))) {
      points = [[-9.5, 35.8], [3.3, 43.8]];
    }
    if (!points.length) return;
    const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
    for (const point of points) bounds.extend(point);
    const width = this.map.getContainer().clientWidth, mobile = width < 700;
    this.map.fitBounds(bounds, { maxZoom: 12, duration: 900, padding: mobile ? { top: 270, bottom: 230, left: 35, right: 35 } :
      { top: 130, bottom: 100, left: clean ? 75 : width < 1100 ? 320 : 370, right: clean ? 75 : width <= 1000 ? 40 : width < 1100 ? 270 : 330 } });
  }
}
