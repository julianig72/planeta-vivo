export const HOUR = 3_600_000;
export const API = 'https://apidatos.ree.es/es/datos/';
export const WIDGETS = {
  demand: 'demanda/evolucion',
  generation: 'generacion/evolucion-estructura-generacion-emisiones-asociadas',
  mix: 'generacion/estructura-generacion',
  balance: 'balance/balance-electrico',
} as const;

export interface Point { time: number; value: number }
interface Series { id: string; title: string; points: Point[] }
interface Widget { updated: number; series: Series[] }
export interface Demand { updated: number; points: Point[]; total: number }
export interface Generation { updated: number; clean: Point[]; emitting: Point[] }
export interface Technology { id: string; title: string; value: number }
export interface MixGroup { id: string; title: string; color: string; value: number; share: number; technologies: Technology[] }
export interface Mix { updated: number; total: number; groups: MixGroup[] }
export interface GenerationDate {
  date: string;
  mix: Mix | null;
  error: string | null;
  unreported: string[];
}
export interface GenerationHistory {
  startDate: string;
  endDate: string;
  received: number;
  updated: number;
  days: GenerationDate[];
  unpublished: string[];
}
export interface Balance {
  updated: number;
  demand: number;
  renewable: number;
  nonRenewable: number;
  turbine: number;
  pumping: number;
  storage: number;
  international: number;
  balearic: number;
  residual: number;
}
export interface Layer<T> { data: T | null; error: string | null; received: number | null }
export interface EnergyDay {
  date: string;
  start: number;
  end: number;
  fetched: number;
  demand: Layer<Demand>;
  generation: Layer<Generation>;
  mix: Layer<Mix>;
  balance: Layer<Balance>;
  attempts: { date: string; reason: string }[];
}

const madrid = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function localParts(time: number): Record<string, string> {
  return Object.fromEntries(madrid.formatToParts(time).map(part => [part.type, part.value]));
}

export function madridDate(time: number): string {
  const parts = localParts(time);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 24 * HOUR).toISOString().slice(0, 10);
}

export function midnight(date: string): number {
  const target = Date.parse(`${date}T00:00:00Z`);
  let time = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(time);
    const represented = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    time += target - represented;
  }
  return time;
}

export function bounds(date: string): { start: number; end: number } {
  return { start: midnight(date), end: midnight(shiftDate(date, 1)) };
}

export function widgetURL(widget: string, date: string, truncation: 'hour' | 'day'): string {
  const params = new URLSearchParams({
    start_date: `${date}T00:00`, end_date: `${date}T23:59`, time_trunc: truncation,
    geo_trunc: 'electric_system', geo_limit: 'peninsular', geo_ids: '8741',
  });
  return `${API}${widget}?${params}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function timeValue(value: unknown): number {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('REData no ha facilitado una hora con zona válida.');
  }
  return Date.parse(value);
}

export function parseWidget(raw: unknown): Widget {
  if (!record(raw) || !record(raw.data) || !record(raw.data.attributes) || !Array.isArray(raw.included)) {
    throw new Error('La respuesta REData no tiene el formato esperado.');
  }
  const updated = timeValue(raw.data.attributes['last-update']);
  const series: Series[] = [];
  function visit(item: unknown): void {
    if (!record(item) || !record(item.attributes)) throw new Error('Indicador REData incompleto.');
    const attributes = item.attributes;
    if (Array.isArray(attributes.content)) {
      for (const child of attributes.content) visit(child);
      return;
    }
    if (typeof item.id !== 'string' || typeof attributes.title !== 'string' || !Array.isArray(attributes.values)) {
      throw new Error('Indicador REData sin identificador, título o valores.');
    }
    const points = attributes.values.map((value: unknown) => {
      if (!record(value) || typeof value.value !== 'number' || !Number.isFinite(value.value)) {
        throw new Error('REData contiene un valor no numérico.');
      }
      return { time: timeValue(value.datetime), value: value.value };
    }).sort((a, b) => a.time - b.time);
    if (new Set(points.map(point => point.time)).size !== points.length) throw new Error('REData contiene horas duplicadas.');
    if (series.some(existing => existing.id === item.id)) throw new Error('REData contiene indicadores duplicados.');
    series.push({ id: item.id, title: attributes.title, points });
  }
  for (const item of raw.included) visit(item);
  return { updated, series };
}

function seriesByID(widget: Widget, id: string): Series {
  const series = widget.series.find(item => item.id === id);
  if (!series) throw new Error(`REData no incluye el indicador ${id}.`);
  return series;
}

function hourly(series: Series, date: string): Point[] {
  const { start, end } = bounds(date);
  const count = (end - start) / HOUR;
  if (series.points.length !== count || series.points.some((point, i) => point.time !== start + i * HOUR || point.value < 0)) {
    throw new Error(`El día ${date} no tiene todas sus ${count} horas válidas (${series.title}).`);
  }
  return series.points;
}

function daily(series: Series, date: string): number {
  if (series.points.length !== 1 || series.points[0].time !== midnight(date)) {
    throw new Error(`El agregado diario de ${series.title} no corresponde al día ${date}.`);
  }
  return series.points[0].value;
}

export function parseDemand(raw: unknown, date: string): Demand {
  const widget = parseWidget(raw);
  const points = hourly(seriesByID(widget, '10297'), date);
  return { updated: widget.updated, points, total: points.reduce((sum, point) => sum + point.value, 0) };
}

export function parseGeneration(raw: unknown, date: string): Generation {
  const widget = parseWidget(raw);
  return { updated: widget.updated, clean: hourly(seriesByID(widget, '1'), date), emitting: hourly(seriesByID(widget, '2'), date) };
}

const GROUPS = [
  { id: 'solar', title: 'Solar', color: '#ffcd79', ids: ['1458', '1459'] },
  { id: 'wind', title: 'Eólica', color: '#91efd1', ids: ['10291'] },
  { id: 'hydro', title: 'Hidráulica', color: '#80caff', ids: ['10288'] },
  { id: 'nuclear', title: 'Nuclear', color: '#b7a5ff', ids: ['1446'] },
  { id: 'gas', title: 'Ciclo combinado', color: '#ff9686', ids: ['1454'] },
  { id: 'other', title: 'Otras tecnologías', color: '#a2b6c3', ids: [] },
];

export function parseMix(raw: unknown, date: string): Mix {
  const widget = parseWidget(raw);
  const total = daily(seriesByID(widget, '10296'), date);
  const technologies = widget.series.filter(item => item.id !== '10296').map(item => ({
    id: item.id, title: item.title, value: daily(item, date),
  }));
  return summarizeMix(widget.updated, total, technologies);
}

function summarizeMix(updated: number, total: number, technologies: Technology[]): Mix {
  if (total <= 0) throw new Error('La generación total diaria no es positiva.');
  if (Math.abs(technologies.reduce((sum, item) => sum + item.value, 0) - total) > 2) {
    throw new Error('Las tecnologías no suman la generación total publicada.');
  }
  const known = new Set(GROUPS.flatMap(group => group.ids));
  const groups = GROUPS.map(group => {
    const members = technologies.filter(item => group.id === 'other' ? !known.has(item.id) : group.ids.includes(item.id));
    const value = members.reduce((sum, item) => sum + item.value, 0);
    return { id: group.id, title: group.title, color: group.color, value, share: value / total, technologies: members };
  });
  return { updated, total, groups };
}

export function historyURL(startDate: string, endDate: string): string {
  const url = new URL(widgetURL(WIDGETS.mix, startDate, 'day'));
  url.searchParams.set('end_date', `${endDate}T23:59`);
  return url.toString();
}

export function parseGenerationHistory(raw: unknown, startDate: string, endDate: string): GenerationHistory {
  const widget = parseWidget(raw);
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) {
    dates.push(date);
    if (dates.length > 31) throw new Error('El período debe tener como máximo 31 días.');
  }
  if (!dates.length) throw new Error('El período de generación está vacío.');
  const allowed = new Set(dates.map(midnight));
  if (widget.series.some(series => series.points.some(point => !allowed.has(point.time)))) {
    throw new Error('La fuente incluye valores fuera del período o sin resolución diaria peninsular.');
  }
  const total = seriesByID(widget, '10296');
  const required = GROUPS.flatMap(group => group.ids);
  const days = dates.map((date): GenerationDate => {
    const time = midnight(date);
    const unreported = widget.series.filter(series => series.id !== '10296' && !series.points.some(point => point.time === time)).map(series => series.title);
    try {
      const point = total.points.find(point => point.time === time);
      if (!point) throw new Error('Día sin generación total publicada.');
      for (const id of required) {
        if (!widget.series.find(series => series.id === id)?.points.some(point => point.time === time)) {
          throw new Error(`Tecnología principal sin dato diario: ${id}.`);
        }
      }
      const technologies = widget.series.filter(series => series.id !== '10296').flatMap(series => {
        const value = series.points.find(point => point.time === time);
        return value ? [{ id: series.id, title: series.title, value: value.value }] : [];
      });
      return { date, mix: summarizeMix(widget.updated, point.value, technologies), error: null, unreported };
    } catch (error) {
      const message = errorText(error);
      console.error(`REData · generación diaria · ${date}`, message);
      return { date, mix: null, error: message, unreported };
    }
  });
  const first = days.findIndex(day => day.mix);
  const last = days.reduce((last, day, index) => day.mix ? index : last, -1);
  if (first < 0 || days.filter(day => day.mix).length < 2) {
    throw new Error('REData no ofrece al menos dos días válidos para comparar generación.');
  }
  return {
    startDate, endDate, updated: widget.updated, received: Date.now(),
    days: days.slice(first, last + 1),
    unpublished: [...days.slice(0, first), ...days.slice(last + 1)].map(day => day.date),
  };
}

export async function fetchGenerationHistory(startDate?: string, endDate?: string): Promise<GenerationHistory> {
  const end = endDate ?? shiftDate(madridDate(Date.now()), -1);
  const start = startDate ?? shiftDate(end, -29);
  const response = await fetch(historyURL(start, end), { signal: AbortSignal.timeout(22_000), cache: 'no-store' });
  if (!response.ok) throw new Error(`REData · HTTP ${response.status} al consultar generación diaria.`);
  return parseGenerationHistory(await response.json(), start, end);
}

export function historyIndex(count: number, progress: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor(progress * count)));
}

export function parseBalance(raw: unknown, date: string): Balance {
  const widget = parseWidget(raw);
  const get = (id: string) => daily(seriesByID(widget, id), date);
  const renewable = get('10299'), nonRenewable = get('10298');
  const demand = get('10297'), turbine = get('1445'), pumping = get('1472'), storage = get('10483');
  const international = get('1474'), balearic = get('1473');
  if (renewable < 0 || nonRenewable < 0 || demand < 0 || turbine < 0 || pumping > 0 ||
      Math.abs(turbine + pumping - storage) > 2) throw new Error('Los signos o el saldo de almacenamiento no son coherentes.');
  const residual = renewable + nonRenewable + storage + international + balearic - demand;
  if (Math.abs(residual) > 2) throw new Error(`El balance publicado no cierra (${residual.toFixed(1)} MWh de diferencia).`);
  return { updated: widget.updated, demand, renewable, nonRenewable, turbine, pumping, storage, international, balearic, residual };
}

export function intervalIndex(day: EnergyDay, progress: number): number {
  return Math.min((day.end - day.start) / HOUR - 1, Math.max(0, Math.floor(progress * (day.end - day.start) / HOUR)));
}

export function sceneTime(day: EnergyDay, progress: number): number {
  return day.start + Math.min(1, Math.max(0, progress)) * (day.end - day.start);
}

export function solarAltitude(time: number): number {
  const utc = new Date(time);
  const day = (time - Date.UTC(utc.getUTCFullYear(), 0, 0)) / (24 * HOUR);
  const declination = -23.44 * Math.cos(2 * Math.PI * (day + 10) / 365.25) * Math.PI / 180;
  const hour = utc.getUTCHours() + utc.getUTCMinutes() / 60 + utc.getUTCSeconds() / 3600;
  const angle = (15 * (hour - 12) - 3.7) * Math.PI / 180;
  const latitude = 40.4 * Math.PI / 180;
  return Math.asin(Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(angle));
}

export function sunrise(day: Pick<EnergyDay, 'start' | 'end'>): number {
  for (let time = day.start; time < day.end; time += 60_000) {
    if (solarAltitude(time) >= 0) return time;
  }
  throw new Error('No se puede calcular el amanecer aproximado de este día.');
}

async function request(widget: string, date: string, truncation: 'hour' | 'day'): Promise<unknown> {
  const response = await fetch(widgetURL(widget, date, truncation), { signal: AbortSignal.timeout(22_000), cache: 'no-store' });
  if (!response.ok) {
    let detail = '';
    if (response.headers.get('content-type')?.includes('json')) {
      const body: unknown = await response.json();
      if (record(body) && Array.isArray(body.errors)) {
        detail = body.errors.filter(record).map(error => typeof error.detail === 'string' ? error.detail : '').join(' ');
      }
    }
    throw new Error(`HTTP ${response.status}${detail ? ` · ${detail}` : ''}`);
  }
  return response.json() as Promise<unknown>;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Error de conexión desconocido.';
}

export async function fetchDay(date: string): Promise<EnergyDay> {
  async function layer<T>(widget: string, truncation: 'hour' | 'day', parser: (raw: unknown, date: string) => T): Promise<Layer<T>> {
    try { return { data: parser(await request(widget, date, truncation), date), error: null, received: Date.now() }; }
    catch (error) {
      console.error(`REData · ${widget} · ${date}`, error);
      return { data: null, error: errorText(error), received: null };
    }
  }
  const [demand, generation, mix, balance] = await Promise.all([
    layer(WIDGETS.demand, 'hour', parseDemand),
    layer(WIDGETS.generation, 'hour', parseGeneration),
    layer(WIDGETS.mix, 'day', parseMix),
    layer(WIDGETS.balance, 'day', parseBalance),
  ]);
  const day: EnergyDay = { date, ...bounds(date), fetched: Date.now(), demand, generation, mix, balance, attempts: [] };
  synchronize(day);
  return day;
}

export function synchronize(day: EnergyDay): void {
  if (day.generation.data && day.mix.data) {
    const generation = day.generation.data;
    const total = generation.clean.reduce((sum, point, i) => sum + point.value + generation.emitting[i].value, 0);
    if (Math.abs(total - day.mix.data.total) > 2) {
      day.generation = { data: null, error: 'La generación horaria no suma el total diario: capas no sincronizadas.', received: null };
      console.error(day.generation.error);
    }
  }
  if (day.balance.data && (day.demand.data && Math.abs(day.demand.data.total - day.balance.data.demand) > 2 ||
      day.mix.data && Math.abs(day.mix.data.total - day.balance.data.renewable - day.balance.data.nonRenewable) > 2)) {
    day.balance = { data: null, error: 'El balance no coincide con las otras capas de este día.', received: null };
    console.error(day.balance.error);
  }
}

export async function fetchRecentDay(now = Date.now()): Promise<EnergyDay> {
  const firstDate = shiftDate(madridDate(now), -1);
  const attempts: EnergyDay['attempts'] = [];
  let fallback: EnergyDay | null = null;
  let bestScore = -1;
  for (let offset = 0; offset < 3; offset++) {
    const day = await fetchDay(shiftDate(firstDate, -offset));
    const score = Number(Boolean(day.demand.data)) + Number(Boolean(day.generation.data)) +
      Number(Boolean(day.mix.data)) + Number(Boolean(day.balance.data)) * 0.1;
    if (score > bestScore) { fallback = day; bestScore = score; }
    if (day.demand.data && day.generation.data && day.mix.data) return { ...day, attempts };
    attempts.push({
      date: day.date,
      reason: [day.demand.error, day.generation.error, day.mix.error].filter(Boolean).join(' · '),
    });
  }
  return { ...fallback!, attempts };
}
