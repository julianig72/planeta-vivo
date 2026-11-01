import './energy.css';
import { EnergyScene } from './energy-scene';
import {
  HOUR, WIDGETS, widgetURL, fetchDay, fetchRecentDay, intervalIndex, sceneTime, sunrise,
  localParts, solarAltitude, errorText, synchronize, type EnergyDay, type MixGroup, type Layer,
} from './energy';

document.title = 'España respira energía · Planeta vivo';
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <div class="ambient" aria-hidden="true"></div>
  <header class="header">
    <a class="brand" href="/" aria-label="España respira energía, inicio"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><path d="M22 8 13 22h7l-2 10 10-15h-8z"/></svg><span>planeta<span class="brand-light">vivo</span><small>ESPAÑA RESPIRA ENERGÍA</small></span></a>
    <div class="header-right"><span id="connection" class="connection">CONECTANDO CON REData</span><button id="refresh" class="icon-button" aria-label="Actualizar las fuentes del día" title="Actualizar fuentes">↻</button><button id="sources-button" class="icon-button" aria-label="Fuentes, fechas y límites">i</button></div>
  </header>
  <main>
    <div id="data-notice" class="data-notice" role="alert" hidden></div>
    <div class="energy-map" id="energy-map"></div>
    <div class="graphics-error" id="graphics-error" role="alert" hidden></div>
    <section class="intro" aria-labelledby="headline">
      <p class="eyebrow"><span class="tiny-line"></span> SISTEMA ELÉCTRICO PENINSULAR</p>
      <h1 id="headline">España<br>respira <em>energía.</em></h1>
      <p class="intro-description">Un país que despierta.<br>Muchas formas de encenderlo.</p>
      <div class="demand-stat"><div class="metric-label">DEMANDA · MEDIA DE LA HORA</div><strong id="demand-value">—</strong><span class="metric-unit"> GW</span><p id="interval-label">Esperando un día completo…</p></div>
      <div class="clean-stat"><span class="clean-line" aria-hidden="true"></span><strong id="clean-value">—</strong><span>generación sin emisiones CO₂ eq.<small>En esta hora · incluye nuclear</small></span></div>
      <div class="day-badge"><span class="calendar-mark" aria-hidden="true">◷</span><span id="day-label">BUSCANDO DATOS REALES</span><span class="archive-tag">ARCHIVO</span></div>
      <p class="data-age" id="data-age"></p>
      <div class="feed-status" id="demand-status" role="status">Consultando demanda horaria…</div>
      <div class="feed-status" id="generation-status" role="status">Consultando generación horaria…</div>
    </section>
    <div class="map-heading"><span class="map-overline">UN PAÍS. UN PULSO.</span><span id="day-phase">LA ENERGÍA TOMA FORMA</span></div>
    <div class="map-caption"><span class="caption-cross">+</span><span>EL ANILLO REPRESENTA EL MIX AGREGADO DEL DÍA</span><span class="caption-line"></span></div>
    <div class="map-controls"><button id="sunrise" class="text-button" disabled>↗ Ir al amanecer</button><button id="reset-view" class="text-button">↗ Vista de España</button><span>ARRASTRA SUAVEMENTE PARA EXPLORAR</span></div>
    <aside class="side-panel" aria-label="Mix de generación del día">
      <div class="section-heading"><h2>Las formas de la energía</h2><span class="daily-tag">TOTAL DIARIO</span></div>
      <p class="section-description">El mix solar y eólico no cambia con el reloj:<br> REData no ofrece aquí su curva horaria.</p>
      <div id="mix-list" class="mix-list"></div>
      <div class="feed-status" id="mix-status" role="status">Consultando generación por tecnología…</div>
      <section class="day-summary"><div class="summary-top"><span>GENERACIÓN DEL DÍA</span><strong id="generation-total">—</strong></div><div class="summary-bottom"><span id="renewable-total">—</span><span>renovable · total diario</span></div></section>
      <button class="balance-button" id="balance-button">Balance, almacenamiento e intercambios ↗</button>
      <div class="feed-status" id="balance-status" role="status">Consultando balance diario…</div>
    </aside>
    <section id="technology-detail" class="detail-card" aria-label="Tecnología seleccionada" hidden>
      <button id="close-detail" class="detail-close" aria-label="Cerrar detalle">×</button><p class="eyebrow">MIX AGREGADO · TOTAL DEL DÍA</p>
      <div class="detail-heading"><h2 id="detail-title"></h2><strong id="detail-share"></strong></div>
      <div id="detail-technologies" class="detail-technologies"></div>
      <p class="detail-note">No es generación en esta hora ni ubicación de centrales. Almacenamiento e intercambios se muestran fuera del mix.</p>
    </section>
    <section class="playback" aria-label="Reproducción de un día real">
      <div class="playback-top">
        <div class="playback-controls"><button id="play-pause" class="play-button" disabled aria-label="Reproducir el día completo">▶</button><div><strong id="play-state">Un día real en 30 segundos</strong><span id="play-date">DEMANDA Y GENERACIÓN CON/SIN EMISIONES · POR HORA</span></div></div>
        <div class="scene-clock"><span id="clock-label">HORA PENINSULAR · ARCHIVO</span><time id="scene-clock">—</time></div>
        <button id="overview" class="text-button" disabled>Volver al resumen ↗</button>
      </div>
      <div class="timeline-wrap"><svg id="demand-chart" viewBox="0 0 1000 42" preserveAspectRatio="none" role="img" aria-label="Demanda eléctrica horaria del día"><defs><linearGradient id="chart-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#91efd1" stop-opacity=".25"/><stop offset="100%" stop-color="#91efd1" stop-opacity="0"/></linearGradient></defs><path id="chart-fill" fill="url(#chart-gradient)"/><path id="chart-line" fill="none" stroke="#91efd1" stroke-opacity=".6" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg><div class="timeline-progress" id="timeline-progress"></div><input id="timeline" type="range" min="0" max="1000" value="500" aria-label="Hora del día en reproducción" disabled /></div>
      <div id="timeline-labels" class="timeline-labels"><time data-hour="0">00:00</time><span data-hour="6">06:00</span><span data-hour="12">12:00</span><span data-hour="18">18:00</span><time data-hour="24">24:00</time></div>
    </section>
  </main>
  <footer class="footer"><span>ESPAÑA PENINSULAR · NO ES TELEMETRÍA DE RED</span><button id="footer-sources">RED ELÉCTRICA · REData <span>+ Natural Earth ↗</span></button><span class="visual-note">Luz y puntos: representación gráfica, no centrales.</span></footer>
  <dialog id="sources-dialog" aria-labelledby="sources-title">
    <button id="close-sources" class="detail-close" aria-label="Cerrar fuentes">×</button><p class="eyebrow">DATOS REALES. LÍMITES VISIBLES.</p><h2 id="sources-title">Una historia de energía.<br>No una red en directo.</h2>
    <p id="source-day"></p><h3>Qué cambia con el reloj</h3><p>Demanda y generación con/sin emisiones CO₂ eq., en intervalos horarios reales. Las cifras son la potencia media equivalente de cada hora (GW); no se interpolan ni son medidas instantáneas. «Sin emisiones» incluye nuclear y no equivale a «renovable».</p>
    <h3>Qué no cambia con el reloj</h3><p>Solar, eólica y demás tecnologías: energía agregada del día (GWh) y porcentaje sobre la generación diaria publicada. Los widgets de mix por tecnología verificados no admiten aquí la resolución horaria. No repartimos esos totales entre horas ni inventamos una curva solar. El anillo es un mix diario fijo.</p>
    <h3>Ámbito geográfico</h3><p>Consultas explícitas a sistema peninsular: geo_trunc=electric_system, geo_limit=peninsular, geo_ids=8741. Canarias, Baleares, Ceuta y Melilla no forman parte del agregado mostrado. Portugal aparece únicamente como contexto geográfico. No representamos datos regionales, ubicaciones de centrales ni flujos entre ciudades.</p>
    <h3>Balance diario · GWh</h3><p>La generación publicada, más el saldo de almacenamiento, el saldo internacional y el enlace Península–Baleares, da la demanda. Los intercambios positivos aportan al sistema peninsular; los negativos salen de él. El bombeo consumidor es negativo y la turbinación es positiva. No se incluyen como porcentajes de generación tecnológica.</p>
    <div id="balance-table"></div><h3>Fuentes y horas del producto</h3><div id="source-times"></div><p id="search-history"></p>
    <a href="https://www.ree.es/es/datos/apidatos" target="_blank" rel="noopener noreferrer">Documentación pública REData ↗</a>
    <h3>La forma de España y la luz</h3><p>Made with Natural Earth: contornos geográficos de dominio público, escala 1:110 millones. Seleccionamos la parte peninsular; el relieve es decorativo. El amanecer y la luz son una aproximación astronómica para 40,4° N, 3,7° O (referencia Madrid), no mediciones solares ni de generación. Los puntos y colores son efectos agregados, no sensores o centrales.</p>
    <p class="source-small">Buscamos el día completo más reciente entre los tres días anteriores. Se muestra la fecha, el retraso respecto al final de ese día, la hora de cada producto y la última descarga válida. Si falla una actualización conservamos los últimos datos identificados y mostramos el error. Sin ESIOS, claves ni datos sintéticos de sustitución.</p>
  </dialog>
`;

function el<T extends Element = HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`No existe el elemento de interfaz ${id}.`);
  return element;
}
const number = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = (value: number) => `${number.format(value * 100)}%`;
const gwh = (value: number) => `${number.format(value / 1000)} GWh`;
const dateFormat = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'long', year: 'numeric' });
const clockFormat = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const timestampFormat = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
const zoneFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', timeZoneName: 'short' });

let day: EnergyDay | null = null;
let scene: EnergyScene | null = null;
let progress = 0.5;
let playing = false;
let replay = false;
let loading = false;
let selected: MixGroup | null = null;
let uiElapsed = 0;
let lastInterval = -1;

function graphicsError(message: string): void { el('graphics-error').hidden = false; el('graphics-error').textContent = message; }
try { scene = new EnergyScene(el('energy-map'), tick, selectTechnology, graphicsError); }
catch (error) {
  console.error('No se pudo iniciar WebGL', error);
  graphicsError('WebGL no está disponible. Puedes explorar los datos y reproducir el día; el mapa necesita aceleración gráfica.');
}

function retain<T>(next: Layer<T>, previous: Layer<T>): Layer<T> {
  return !next.data && previous.data ? { ...previous, error: `Error al actualizar; últimos datos conservados. ${next.error}` } : next;
}

async function load(): Promise<void> {
  if (loading) return;
  loading = true;
  playing = false;
  updatePlayState();
  el<HTMLButtonElement>('refresh').disabled = true;
  el('connection').textContent = day ? 'ACTUALIZANDO EL DÍA DE ARCHIVO' : 'BUSCANDO UN DÍA COMPLETO · REData';
  try {
    const next = day ? await fetchDay(day.date) : await fetchRecentDay();
    if (day && day.date === next.date) {
      next.demand = retain(next.demand, day.demand);
      next.generation = retain(next.generation, day.generation);
      next.mix = retain(next.mix, day.mix);
      next.balance = retain(next.balance, day.balance);
      next.attempts = day.attempts;
      synchronize(next);
    }
    day = next;
    scene?.setMix(day.mix.data);
    closeDetail();
    lastInterval = -1;
    renderStatic();
    updateView();
  } catch (error) {
    console.error('No se pudo consultar REData', error);
    el('demand-status').textContent = `No se puede consultar REData. ${errorText(error)}`;
    el('demand-status').classList.add('warning');
  } finally {
    loading = false;
    el<HTMLButtonElement>('refresh').disabled = false;
    updatePlayState();
  }
}

function layerStatus<T extends { updated: number }>(id: string, layer: Layer<T>, name: string): void {
  el(id).textContent = layer.error ? `${name}: ${layer.error}` : layer.data ? `Producto: ${timestampFormat.format(layer.data.updated)}` : `${name}: no disponible.`;
  el(id).classList.toggle('warning', Boolean(layer.error));
}

function renderStatic(): void {
  if (!day) return;
  el('day-label').textContent = dateFormat.format(day.start).toUpperCase();
  el('play-date').textContent = `${dateFormat.format(day.start)} · ${(day.end - day.start) / HOUR} HORAS REALES`;
  updateAge();
  layerStatus('demand-status', day.demand, 'Demanda');
  layerStatus('generation-status', day.generation, 'Generación horaria');
  layerStatus('mix-status', day.mix, 'Mix diario');
  layerStatus('balance-status', day.balance, 'Balance');
  const hasError = [day.demand, day.generation, day.mix, day.balance].some(layer => layer.error);
  const notice = el('data-notice');
  notice.hidden = !hasError;
  notice.textContent = [day.demand.error && `Demanda: ${day.demand.error}`, day.generation.error && `Generación horaria: ${day.generation.error}`, day.mix.error && `Mix: ${day.mix.error}`, day.balance.error && `Balance: ${day.balance.error}`].filter(Boolean).join(' · ');
  el('connection').textContent = hasError ? 'ARCHIVO REAL · REVISAR FUENTES' : 'REData · DÍA REAL, NO TIEMPO REAL';
  el('connection').classList.toggle('connected', !hasError);
  const ready = Boolean(day.demand.data);
  for (const id of ['play-pause', 'overview', 'sunrise']) el<HTMLButtonElement>(id).disabled = !ready;
  el<HTMLInputElement>('timeline').disabled = !ready;
  el('generation-total').textContent = day.mix.data ? gwh(day.mix.data.total) : '—';
  el('renewable-total').textContent = day.balance.data && day.mix.data ? percent(day.balance.data.renewable / day.mix.data.total) : '—';
  const list = el('mix-list');
  list.replaceChildren();
  for (const group of day.mix.data?.groups ?? []) {
    const button = document.createElement('button');
    button.className = 'mix-row';
    button.dataset.technology = group.id;
    button.setAttribute('aria-label', `${group.title}, ${percent(group.share)} de generación diaria`);
    const dot = document.createElement('span'); dot.className = 'technology-dot'; dot.style.background = group.color;
    const info = document.createElement('span'); info.className = 'technology-info';
    const title = document.createElement('span'); title.textContent = group.title;
    const value = document.createElement('small'); value.textContent = group.technologies.length ? gwh(group.value) : 'No reportada';
    info.append(title, value);
    const share = document.createElement('strong'); share.textContent = group.technologies.length ? percent(group.share) : '—';
    const bar = document.createElement('span'); bar.className = 'technology-bar';
    const fill = document.createElement('span'); fill.style.width = `${group.share * 100}%`; fill.style.background = group.color; bar.append(fill);
    button.append(dot, info, share, bar);
    button.addEventListener('click', () => selectTechnology(group.id));
    list.append(button);
  }
  drawDemand();
  renderSources();
}

function updateAge(): void {
  if (!day) return;
  const lag = Math.max(0, (Date.now() - day.end) / HOUR);
  el('data-age').textContent = `Fin del día hace ${number.format(lag)} h · no son datos de hoy`;
  el('data-age').classList.toggle('warning', lag > 72);
}

function drawDemand(): void {
  const points = day?.demand.data?.points;
  el<SVGPathElement>('chart-line').setAttribute('d', '');
  el<SVGPathElement>('chart-fill').setAttribute('d', '');
  if (!points) return;
  const min = Math.min(...points.map(point => point.value)), max = Math.max(...points.map(point => point.value));
  const y = (value: number) => 35 - (value - min) / Math.max(1, max - min) * 30;
  let path = `M 0 ${y(points[0].value)}`;
  points.forEach((point, i) => {
    path += ` L ${(i + 1) / points.length * 1000} ${y(point.value)}`;
    if (i + 1 < points.length) path += ` L ${(i + 1) / points.length * 1000} ${y(points[i + 1].value)}`;
  });
  el('chart-line').setAttribute('d', path);
  el('chart-fill').setAttribute('d', `${path} L 1000 42 L 0 42 Z`);
  if (day) {
    for (const mark of el('timeline-labels').querySelectorAll<HTMLElement>('[data-hour]')) {
      const hour = Number(mark.dataset.hour);
      const time = hour === 24 ? day.end : points.find(point => Number(localParts(point.time).hour) === hour)?.time;
      if (time !== undefined) mark.style.left = `${(time - day.start) / (day.end - day.start) * 100}%`;
    }
  }
}

function renderSources(): void {
  if (!day) return;
  el('source-day').textContent = `Reproducimos el ${dateFormat.format(day.start)}. Las capas corresponden al mismo día y al mismo sistema peninsular. Última consulta: ${timestampFormat.format(day.fetched)}.`;
  const sources = el('source-times');
  sources.replaceChildren();
  for (const [key, name] of [['demand', 'Demanda horaria'], ['generation', 'Generación horaria con/sin CO₂ eq.'], ['mix', 'Mix por tecnología diario'], ['balance', 'Balance diario']] as const) {
    const layer = day[key];
    const block = document.createElement('p');
    block.textContent = `${name}: ${layer.data ? `producto ${timestampFormat.format(layer.data.updated)} · última descarga válida ${layer.received ? timestampFormat.format(layer.received) : 'no disponible'}` : 'no disponible'}${layer.error ? ` · ${layer.error}` : ''}.`;
    const link = document.createElement('a');
    link.href = widgetURL(WIDGETS[key], day.date, key === 'demand' || key === 'generation' ? 'hour' : 'day');
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Ver respuesta REData ↗';
    sources.append(block, link);
  }
  el('search-history').textContent = day.attempts.length ? `Búsqueda de día completo: ${day.attempts.map(attempt => `${attempt.date}: ${attempt.reason}`).join(' / ')}` : 'El día anterior está completo en las tres capas principales.';
  const table = el('balance-table');
  table.replaceChildren();
  if (!day.balance.data || !day.mix.data) {
    table.textContent = `Balance no disponible: ${day.balance.error ?? 'sin generación diaria válida'}`;
    return;
  }
  const balance = day.balance.data;
  const rows: [string, number][] = [
    ['Generación por tecnologías (sin almacenamiento)', day.mix.data.total],
    ['Turbinación de bombeo', balance.turbine], ['Consumo de bombeo', balance.pumping],
    ['Saldo almacenamiento (turbinación + consumo)', balance.storage],
    ['Saldo internacional (+ entrada / − salida)', balance.international],
    ['Enlace Península–Baleares (+ entrada / − salida)', balance.balearic],
    ['Demanda en barras de central', balance.demand],
    ['Diferencia de cierre (MWh)', balance.residual],
  ];
  for (const [title, value] of rows) {
    const row = document.createElement('div'); row.className = 'balance-row';
    const label = document.createElement('span'); label.textContent = title;
    const numberEl = document.createElement('strong'); numberEl.textContent = title.startsWith('Diferencia') ? `${number.format(value)} MWh` : gwh(value);
    row.append(label, numberEl); table.append(row);
  }
}

function selectTechnology(id: string): void {
  const group = day?.mix.data?.groups.find(group => group.id === id);
  if (!group) return;
  selected = group;
  scene?.select(id);
  el('technology-detail').hidden = false;
  el('detail-title').textContent = group.title;
  el('detail-title').style.color = group.color;
  el('detail-share').textContent = percent(group.share);
  const list = el('detail-technologies'); list.replaceChildren();
  for (const technology of group.technologies) {
    const row = document.createElement('div');
    const label = document.createElement('span'); label.textContent = technology.title;
    const value = document.createElement('strong'); value.textContent = gwh(technology.value);
    row.append(label, value); list.append(row);
  }
  if (!group.technologies.length) list.textContent = 'Esta tecnología no aparece con generación en el producto diario.';
  for (const row of el('mix-list').querySelectorAll<HTMLButtonElement>('.mix-row')) row.classList.toggle('selected', row.dataset.technology === id);
}

function closeDetail(): void {
  selected = null;
  scene?.select(null);
  el('technology-detail').hidden = true;
  for (const row of el('mix-list').querySelectorAll('.selected')) row.classList.remove('selected');
}

function updateView(): void {
  if (!day) return;
  const time = sceneTime(day, progress), index = intervalIndex(day, progress);
  const demand = day.demand.data?.points[index];
  const clean = day.generation.data?.clean[index].value;
  const emitting = day.generation.data?.emitting[index].value;
  const cleanShare = clean !== undefined && emitting !== undefined && clean + emitting > 0 ? clean / (clean + emitting) : null;
  el('demand-value').textContent = demand ? number.format(demand.value / 1000) : '—';
  el('clean-value').textContent = cleanShare !== null ? percent(cleanShare) : '—';
  el('interval-label').textContent = demand ? `${clockFormat.format(demand.time)}–${clockFormat.format(demand.time + HOUR)} · ${zoneFormat.formatToParts(demand.time).find(part => part.type === 'timeZoneName')?.value}` : 'Demanda horaria no disponible';
  el('scene-clock').textContent = progress >= 1 ? '24:00' : clockFormat.format(time);
  el('clock-label').textContent = `${replay ? 'REPRODUCCIÓN' : 'VISTA DEL DÍA'} · HORA PENINSULAR`;
  const parts = localParts(time), altitude = solarAltitude(time);
  el('day-phase').textContent = altitude > 0.45 ? 'EL PAÍS ESTÁ DESPIERTO' : altitude > -0.05 ? Number(parts.hour) < 12 ? 'LA LUZ EMPIEZA A LLEGAR' : 'LA TARDE CAMBIA EL PAISAJE' : Number(parts.hour) < 7 ? 'INCLUSO DE NOCHE, SIGUE EL PULSO' : 'LA NOCHE TAMBIÉN NECESITA ENERGÍA';
  el<HTMLInputElement>('timeline').value = String(Math.round(progress * 1000));
  el('timeline-progress').style.left = `${progress * 100}%`;
  const values = day.demand.data?.points.map(point => point.value) ?? [];
  const min = Math.min(...values), max = Math.max(...values);
  scene?.update(time, demand ? (demand.value - min) / Math.max(1, max - min) : null, cleanShare);
  if (lastInterval !== index) {
    lastInterval = index;
    root.dataset.hourIndex = String(index);
  }
}

function updatePlayState(): void {
  el('play-pause').textContent = playing ? 'Ⅱ' : '▶';
  el('play-pause').setAttribute('aria-label', playing ? 'Pausar reproducción' : replay && progress < 1 ? 'Continuar reproducción' : 'Reproducir el día completo');
  el('play-state').textContent = loading ? 'Consultando fuentes públicas…' : playing ? 'Reproduciendo · un día en 30 segundos' : replay ? progress >= 1 ? 'Fin del día · volver a reproducir' : 'Reproducción en pausa' : 'Un día real en 30 segundos';
}

function tick(delta: number): void {
  if (playing && day) {
    progress = Math.min(1, progress + delta / 30);
    if (progress >= 1) { playing = false; updatePlayState(); }
  }
  uiElapsed += delta;
  if (uiElapsed >= 0.1) { uiElapsed = 0; updateView(); }
}

el('play-pause').addEventListener('click', () => {
  if (!day?.demand.data) return;
  if (!replay || progress >= 1) { progress = 0; replay = true; playing = true; closeDetail(); }
  else playing = !playing;
  updatePlayState(); updateView();
});
el<HTMLInputElement>('timeline').addEventListener('input', event => {
  progress = Number((event.target as HTMLInputElement).value) / 1000;
  replay = true; playing = false; updatePlayState(); updateView();
});
el('sunrise').addEventListener('click', () => {
  if (!day) return;
  progress = (sunrise(day) - day.start) / (day.end - day.start);
  replay = true; playing = false; closeDetail(); updatePlayState(); updateView();
});
el('overview').addEventListener('click', () => { progress = 0.5; playing = false; replay = false; closeDetail(); updatePlayState(); updateView(); });
el('reset-view').addEventListener('click', () => { closeDetail(); scene?.reset(); });
el('close-detail').addEventListener('click', closeDetail);
el('refresh').addEventListener('click', () => void load());
const dialog = el<HTMLDialogElement>('sources-dialog');
for (const id of ['sources-button', 'footer-sources', 'balance-button']) el(id).addEventListener('click', () => dialog.showModal());
el('close-sources').addEventListener('click', () => dialog.close());
window.addEventListener('keydown', event => { if (event.key === 'Escape' && selected) closeDetail(); });
let fallbackLast = performance.now();
window.setInterval(() => {
  const now = performance.now();
  if (!scene && !document.hidden) tick((now - fallbackLast) / 1000);
  fallbackLast = now;
}, 100);
window.setInterval(updateAge, 60_000);
void load();
