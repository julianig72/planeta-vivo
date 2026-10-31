import './style.css';
import { Globe } from './globe';
import {
  USGS_URL, NOAA_URL, DAY, EARTHQUAKE_STALE, AURORA_STALE,
  fetchJSON, parseQuakes, parseAurora, recentEvents, replayTime, eventProgress,
  type QuakeFeed, type AuroraFeed, type Earthquake,
} from './data';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="ambient" aria-hidden="true"></div>
  <header class="header">
    <a class="brand" href="/" aria-label="Planeta vivo, inicio">
      <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><ellipse cx="20" cy="20" rx="7" ry="16"/><path d="M4 20h32M7 11h26M7 29h26"/></svg>
      <span>planeta<span class="brand-light">vivo</span><small>UNA TIERRA. MILES DE HISTORIAS.</small></span>
    </a>
    <div class="header-right"><span class="connection" id="connection">CONECTANDO CON EL PLANETA</span><time id="wall-clock"></time><button class="icon-button" id="sources-button" aria-label="Abrir fuentes y explicación de datos" title="Fuentes y datos">i</button></div>
  </header>
  <main>
    <div id="globe" class="globe"></div>
    <div id="graphics-error" class="graphics-error" role="alert" hidden></div>
    <section class="intro" aria-labelledby="headline">
      <p class="eyebrow"><span class="tiny-line"></span> OBSERVATORIO DEL PRESENTE</p>
      <h1 id="headline">La Tierra<br>no se <em>detiene.</em></h1>
      <p class="intro-description">Bajo nuestros pies. Sobre nuestras cabezas.<br>Un planeta que sigue escribiendo su historia.</p>
      <div class="metrics">
        <div><strong id="quake-count">—</strong><span>terremotos · 24 h</span></div>
        <div><strong id="max-mag">—</strong><span>magnitud máxima</span></div>
      </div>
      <div class="layer-controls" aria-label="Capas del globo">
        <button id="quakes-toggle" class="layer-button active" aria-pressed="true"><span class="layer-dot quake-dot"></span>Terremotos<span class="switch" aria-hidden="true"></span></button>
        <button id="aurora-toggle" class="layer-button active" aria-pressed="true"><span class="layer-dot aurora-dot"></span>Previsión de auroras<span class="switch" aria-hidden="true"></span></button>
      </div>
      <p class="globe-hint">ARRASTRA PARA EXPLORAR · ACERCA CON LA RUEDA</p>
      <button class="text-button" id="reset-view">↗ Volver a la vista global</button>
    </section>
    <aside class="side-panel" aria-label="Eventos y previsión">
      <section class="event-section">
        <div class="section-heading"><h2>El pulso de la Tierra</h2><span id="events-label">24 H</span></div>
        <p class="section-description" id="events-description">Terremotos recientes · no detección en directo</p>
        <div class="feed-status" id="quake-status" role="status">Conectando con USGS…</div>
        <div class="event-list" id="event-list" aria-label="Selecciona un terremoto"></div>
        <button class="retry" id="retry-quakes" hidden>Reintentar USGS ↗</button>
      </section>
      <section class="aurora-card">
        <div class="section-heading"><h2><span class="layer-dot aurora-dot"></span> Luces del norte y del sur</h2><span class="forecast-tag">PREVISIÓN</span></div>
        <p class="aurora-description">El viento solar dibuja la posibilidad.<br>No es una observación de auroras.</p>
        <div class="aurora-scale"><span>0%</span><div></div><span>100%</span></div>
        <p class="scale-caption">Probabilidad modelada · NOAA OVATION</p>
        <div class="feed-status" id="aurora-status" role="status">Conectando con NOAA…</div>
        <button class="text-button" id="view-aurora">↗ Explorar el polo norte</button>
        <button class="retry" id="retry-aurora" hidden>Reintentar NOAA ↗</button>
      </section>
    </aside>
    <section class="detail-card" id="detail-card" aria-label="Terremoto seleccionado" hidden>
      <button class="detail-close" id="detail-close" aria-label="Cerrar detalles del terremoto">×</button>
      <p class="eyebrow" id="detail-label">EVENTO REAL · USGS</p>
      <div class="detail-title"><strong id="detail-mag"></strong><h2 id="detail-place"></h2></div>
      <div class="detail-meta"><span id="detail-time"></span><span id="detail-depth"></span></div>
      <p id="detail-coordinates"></p>
      <a id="detail-link" target="_blank" rel="noopener noreferrer">Ver evento en USGS ↗</a>
    </section>
    <div class="globe-caption"><span class="caption-cross">+</span> <span id="globe-caption">EVENTOS RECIENTES + PREVISIÓN DE AURORAS</span><span class="caption-line"></span></div>
    <section class="playback" aria-label="Control del tiempo">
      <div class="playback-top">
        <div class="mode-selector"><button id="live-mode" class="mode active" aria-pressed="true"><span class="status-dot"></span> Ahora</button><button id="replay-mode" class="mode" aria-pressed="false">Últimas 24 horas <span class="mode-arrow">↗</span></button></div>
        <div class="replay-clock"><span id="clock-label">HORA ACTUAL · UTC</span><time id="scene-clock">—</time></div>
        <div class="playback-actions"><button id="play-pause" class="play-button" disabled aria-label="Reproducir últimas 24 horas">▶</button><span id="playback-description">24 horas reales en 30 segundos</span></div>
      </div>
      <div class="timeline-wrap">
        <div class="timeline-track" id="timeline-track"><div class="timeline-fill" id="timeline-fill"></div><div id="timeline-events" class="timeline-events"></div></div>
        <input id="timeline" class="timeline-input" type="range" min="0" max="1000" value="1000" aria-label="Posición en la reproducción de las últimas 24 horas" disabled />
      </div>
      <div class="timeline-labels"><time id="start-time">HACE 24 HORAS</time><span id="temporal-note">La previsión de auroras es independiente del reloj sísmico.</span><time id="end-time">AHORA</time></div>
    </section>
  </main>
  <footer class="footer"><span>UN PLANETA VIVO. DATOS ABIERTOS.</span><button id="footer-sources">USGS + NOAA <span>· Fuentes y actualización ↗</span></button><span class="visual-note">Pulsos visuales, no ondas sísmicas.</span></footer>
  <dialog id="sources-dialog" aria-labelledby="sources-title">
    <button id="close-sources" class="detail-close" aria-label="Cerrar fuentes">×</button>
    <p class="eyebrow">TRANSPARENCIA, ANTES QUE ESPECTÁCULO</p>
    <h2 id="sources-title">Una ventana. No un sensor.</h2>
    <h3>Terremotos recientes · USGS</h3>
    <p>Eventos publicados en las últimas 24 horas, con posibles retrasos y revisiones. Consultamos el feed cada minuto. «Ahora» no significa detección en tiempo real. Los puntos y pulsos marcan ubicaciones, no simulan la propagación de ondas.</p>
    <p id="quake-source-time">Todavía no se han recibido datos.</p>
    <a href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php" target="_blank" rel="noopener noreferrer">Documentación y feed de USGS ↗</a>
    <h3>Previsión de auroras · NOAA SWPC</h3>
    <p>Cuadrícula del modelo OVATION: probabilidad de aurora, no observación ni garantía de verla. El horizonte suele ser de 30–90 minutos y depende del viento solar. Consultamos cada 5 minutos y mostramos las horas UTC del producto.</p>
    <p id="aurora-source-time">Todavía no se ha recibido una previsión.</p>
    <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer">Producto de previsión de NOAA ↗</a>
    <h3>Reproducción histórica</h3>
    <p>Una instantánea de 24 horas de eventos reales, ordenados por su hora. Un ciclo dura 30 segundos y termina en pausa. Las nuevas descargas no cambian esa instantánea. La capa de auroras se oculta durante la reproducción: no tenemos una previsión histórica para ese reloj.</p>
    <h3>Imágenes y luz</h3>
    <p>Texturas de la Tierra: NASA, distribuidas en los ejemplos de Three.js. Son imágenes estáticas, no satélite en directo. La iluminación día/noche es una aproximación solar al reloj mostrado. Estrellas decorativas, no mediciones astronómicas.</p>
    <p class="source-small">Tiempos obsoletos: USGS &gt; 15 min desde generación; NOAA &gt; 45 min desde observación o previsión ya vencida. Ante un error conservamos los últimos datos identificados; nunca generamos eventos ni auroras de sustitución.</p>
  </dialog>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
const utcClock = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const utcDate = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const magnitude = (value: number | null) => value === null ? '—' : value.toFixed(1);
const dateLabel = (value: number) => `${utcDate.format(value)} UTC`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Error de conexión desconocido.';

let quakeFeed: QuakeFeed | null = null;
let auroraFeed: AuroraFeed | null = null;
let quakeError: string | null = null;
let auroraError: string | null = null;
let quakeLoading = false;
let auroraLoading = false;
let quakeReceived = 0;
let auroraReceived = 0;
let events: Earthquake[] = [];
let visibleEvents: Earthquake[] = [];
let replayEvents: Earthquake[] = [];
let mode: 'live' | 'replay' = 'live';
let playing = false;
let progress = 1;
let replayEnd = Date.now();
let replayStart = replayEnd - DAY;
let quakesEnabled = true;
let auroraEnabled = true;
let selected: Earthquake | null = null;
let lastUI = 0;
let sinceFocus = 5;
let globe: Globe | null = null;

function graphicsError(message: string): void {
  const panel = element('graphics-error');
  panel.hidden = false;
  panel.textContent = message;
}
try {
  globe = new Globe(element('globe'), selectEvent, tick, graphicsError);
} catch (error) {
  console.error('No se pudo iniciar el globo 3D', error);
  graphicsError('Este navegador no ha podido iniciar WebGL. Los eventos y la reproducción siguen disponibles; prueba un navegador con aceleración gráfica.');
}

function updateStatus(): void {
  const now = Date.now();
  const quakeStale = quakeFeed !== null && now - quakeFeed.generated > EARTHQUAKE_STALE;
  const auroraStale = auroraFeed !== null && (now - auroraFeed.observation > AURORA_STALE || now > auroraFeed.forecast);
  const quakeStatus = element('quake-status');
  const auroraStatus = element('aurora-status');
  quakeStatus.classList.toggle('warning', Boolean(quakeError) || quakeStale);
  auroraStatus.classList.toggle('warning', Boolean(auroraError) || auroraStale);
  quakeStatus.textContent = quakeError
    ? `USGS no disponible. ${quakeFeed ? 'Conservamos la última descarga. ' : 'No hay eventos cargados. '}${quakeError}`
    : quakeFeed ? `${quakeStale ? 'Datos antiguos · ' : ''}Feed: ${dateLabel(quakeFeed.generated)}${quakeFeed.skipped ? ` · ${quakeFeed.skipped} registros no sísmicos o incompletos omitidos` : ''}` : 'Conectando con USGS…';
  auroraStatus.textContent = auroraError
    ? `NOAA no disponible. ${auroraFeed ? 'Última previsión conservada. ' : 'Capa sin datos. '}${auroraError}`
    : auroraFeed ? `${auroraStale ? 'Previsión vencida o datos antiguos · ' : ''}Observación: ${dateLabel(auroraFeed.observation)} · Previsión: ${dateLabel(auroraFeed.forecast)}` : 'Conectando con NOAA…';
  element('retry-quakes').hidden = !quakeError;
  element('retry-aurora').hidden = !auroraError;
  element('connection').textContent = quakeFeed
    ? (quakeError || quakeStale ? 'ÚLTIMOS DATOS · REVISAR FUENTE' : 'DATOS REALES · ACTUALIZACIÓN AUTOMÁTICA')
    : quakeError ? 'USGS SIN CONEXIÓN' : 'CONECTANDO CON EL PLANETA';
  element('connection').classList.toggle('connected', Boolean(quakeFeed) && !quakeError && !quakeStale);
  element('quake-source-time').textContent = quakeFeed ? `Generación: ${dateLabel(quakeFeed.generated)}. Descarga: ${dateLabel(quakeReceived)}.${quakeError ? ` Error: ${quakeError}` : ''}` : quakeError ?? 'Todavía no se han recibido datos.';
  element('aurora-source-time').textContent = auroraFeed ? `Observación: ${dateLabel(auroraFeed.observation)}. Previsión: ${dateLabel(auroraFeed.forecast)}. Descarga: ${dateLabel(auroraReceived)}.${auroraError ? ` Error: ${auroraError}` : ''}` : auroraError ?? 'Todavía no se ha recibido una previsión.';
  element('view-aurora').hidden = !auroraFeed || mode === 'replay' || !auroraEnabled;
  element<HTMLButtonElement>('play-pause').disabled = !quakeFeed;
  element<HTMLButtonElement>('replay-mode').disabled = !quakeFeed;
  element<HTMLInputElement>('timeline').disabled = !quakeFeed;
}

async function loadQuakes(): Promise<void> {
  if (quakeLoading) return;
  quakeLoading = true;
  try {
    const feed = parseQuakes(await fetchJSON(USGS_URL));
    if (feed.generated > Date.now() + 5 * 60_000) throw new Error('La hora del feed USGS está en el futuro. Comprueba el reloj del equipo.');
    quakeFeed = feed;
    quakeReceived = Date.now();
    quakeError = null;
    if (mode === 'live') configureLive();
  } catch (error) {
    console.error('Error al cargar USGS', error);
    quakeError = errorMessage(error);
  } finally {
    quakeLoading = false;
    updateStatus();
  }
}

async function loadAurora(): Promise<void> {
  if (auroraLoading) return;
  auroraLoading = true;
  try {
    const feed = parseAurora(await fetchJSON(NOAA_URL));
    if (feed.observation > Date.now() + 5 * 60_000) throw new Error('La observación NOAA está en el futuro. Comprueba el reloj del equipo.');
    auroraFeed = feed;
    auroraReceived = Date.now();
    auroraError = null;
    globe?.setAurora(auroraFeed);
    globe?.showAurora(auroraEnabled && mode === 'live');
  } catch (error) {
    console.error('Error al cargar NOAA', error);
    auroraError = errorMessage(error);
  } finally {
    auroraLoading = false;
    updateStatus();
  }
}

function configureLive(): void {
  if (!quakeFeed) return;
  events = recentEvents(quakeFeed, Date.now());
  visibleEvents = events;
  replayEnd = Date.now();
  replayStart = replayEnd - DAY;
  globe?.setEvents(events);
  globe?.setVisibleEvents(new Set(events.map(event => event.id)), quakesEnabled);
  if (selected) {
    const refreshed = events.find(event => event.id === selected?.id);
    if (refreshed) { selected = refreshed; renderDetails(); } else closeDetails();
  }
  renderMetrics();
  renderList();
  renderTimeline(events);
}

function renderMetrics(): void {
  element('quake-count').textContent = String(visibleEvents.length);
  const magnitudes = visibleEvents.flatMap(event => event.magnitude === null ? [] : [event.magnitude]);
  element('max-mag').textContent = magnitudes.length ? Math.max(...magnitudes).toFixed(1) : '—';
}

function renderList(): void {
  const list = element('event-list');
  list.replaceChildren();
  const ordered = [...visibleEvents].reverse();
  if (!ordered.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = mode === 'replay' ? 'La reproducción aún no ha llegado al primer evento.' : 'No hay terremotos publicados en esta ventana de 24 horas.';
    list.append(empty);
    return;
  }
  for (const event of ordered) {
    const button = document.createElement('button');
    button.className = `event-row${selected?.id === event.id ? ' selected' : ''}`;
    button.dataset.eventId = event.id;
    button.setAttribute('aria-label', `Magnitud ${magnitude(event.magnitude)}, ${event.place}, ${dateLabel(event.time)}`);
    const mag = document.createElement('span');
    mag.className = 'event-magnitude';
    mag.textContent = magnitude(event.magnitude);
    const info = document.createElement('span');
    info.className = 'event-info';
    const place = document.createElement('span');
    place.className = 'event-place';
    place.textContent = event.place;
    const time = document.createElement('time');
    time.textContent = `${utcClock.format(event.time)} UTC · ${event.depth.toFixed(0)} km`;
    info.append(place, time);
    const arrow = document.createElement('span');
    arrow.className = 'event-arrow';
    arrow.textContent = '↗';
    button.append(mag, info, arrow);
    button.addEventListener('click', () => selectEvent(event.id));
    list.append(button);
  }
}

function renderTimeline(source: Earthquake[]): void {
  const marks = element('timeline-events');
  marks.replaceChildren();
  for (const event of source) {
    const mark = document.createElement('span');
    mark.style.left = `${eventProgress(event, replayStart, replayEnd) * 100}%`;
    mark.style.height = `${3 + Math.max(0, event.magnitude ?? 0) * 1.8}px`;
    mark.title = `M ${magnitude(event.magnitude)} · ${dateLabel(event.time)}`;
    marks.append(mark);
  }
  element('start-time').textContent = dateLabel(replayStart);
  element('end-time').textContent = dateLabel(replayEnd);
}

function selectEvent(id: string): void {
  const event = visibleEvents.find(item => item.id === id);
  if (!event) return;
  selected = event;
  globe?.focus(event);
  renderDetails();
  for (const row of element('event-list').querySelectorAll<HTMLButtonElement>('.event-row')) {
    row.classList.toggle('selected', row.dataset.eventId === id);
  }
}

function renderDetails(): void {
  if (!selected) return;
  element('detail-card').hidden = false;
  element('detail-mag').textContent = `M ${magnitude(selected.magnitude)}`;
  element('detail-place').textContent = selected.place;
  element('detail-time').textContent = dateLabel(selected.time);
  element('detail-depth').textContent = `${selected.depth.toFixed(1)} km de profundidad`;
  element('detail-coordinates').textContent = `${Math.abs(selected.latitude).toFixed(2)}° ${selected.latitude >= 0 ? 'N' : 'S'} · ${Math.abs(selected.longitude).toFixed(2)}° ${selected.longitude >= 0 ? 'E' : 'O'} · Revisado: ${dateLabel(selected.updated)}`;
  element('detail-label').textContent = mode === 'replay' ? 'REPRODUCCIÓN HISTÓRICA · EVENTO REAL USGS' : 'EVENTO RECIENTE · USGS';
  const link = element<HTMLAnchorElement>('detail-link');
  link.hidden = !selected.url;
  if (selected.url) link.href = selected.url;
}

function closeDetails(): void {
  selected = null;
  element('detail-card').hidden = true;
  for (const row of element('event-list').querySelectorAll('.selected')) row.classList.remove('selected');
}

function setMode(next: 'live' | 'replay'): void {
  if (next === 'replay' && !quakeFeed) return;
  mode = next;
  closeDetails();
  globe?.clearPulses();
  globe?.showAurora(auroraEnabled && mode === 'live');
  if (mode === 'replay') {
    replayEnd = Math.min(Date.now(), quakeFeed!.generated);
    replayStart = replayEnd - DAY;
    replayEvents = quakeFeed!.events.filter(event => event.time >= replayStart && event.time <= replayEnd);
    events = replayEvents;
    globe?.setEvents(events);
    progress = 0;
    playing = true;
    sinceFocus = 5;
    updateReplay(0);
    renderTimeline(replayEvents);
  } else {
    playing = false;
    progress = 1;
    configureLive();
  }
  element('live-mode').classList.toggle('active', mode === 'live');
  element('live-mode').setAttribute('aria-pressed', String(mode === 'live'));
  element('replay-mode').classList.toggle('active', mode === 'replay');
  element('replay-mode').setAttribute('aria-pressed', String(mode === 'replay'));
  element('clock-label').textContent = mode === 'replay' ? 'REPRODUCCIÓN HISTÓRICA · UTC' : 'HORA ACTUAL · UTC';
  element('events-description').textContent = mode === 'replay' ? 'Eventos reales · hasta el reloj de reproducción' : 'Terremotos recientes · no detección en directo';
  element('globe-caption').textContent = mode === 'replay' ? 'REPRODUCCIÓN HISTÓRICA · AURORAS OCULTAS' : 'EVENTOS RECIENTES + PREVISIÓN DE AURORAS';
  element('temporal-note').textContent = mode === 'replay' ? 'Auroras ocultas: la previsión actual no corresponde a este pasado.' : 'La previsión de auroras es independiente del reloj sísmico.';
  element('aurora-toggle').classList.toggle('unavailable', mode === 'replay');
  element<HTMLButtonElement>('aurora-toggle').disabled = mode === 'replay';
  updatePlayButton();
  updateStatus();
  updateClock();
}

function updateReplay(previousTime: number): void {
  const time = replayTime(replayStart, replayEnd, progress);
  const oldLength = visibleEvents.length;
  visibleEvents = replayEvents.filter(event => event.time <= time);
  globe?.setVisibleEvents(new Set(visibleEvents.map(event => event.id)), quakesEnabled);
  const crossed = visibleEvents.filter(event => event.time > previousTime);
  if (previousTime > 0) {
    for (const event of crossed) globe?.pulse(event);
    if (crossed.length && sinceFocus > 2) {
      const featured = crossed.reduce((best, event) => (event.magnitude ?? -10) > (best.magnitude ?? -10) ? event : best);
      selectEvent(featured.id);
      sinceFocus = 0;
    }
  }
  if (selected && selected.time > time) closeDetails();
  if (oldLength !== visibleEvents.length || progress === 0) {
    renderMetrics();
    renderList();
  }
}

function updatePlayButton(): void {
  const button = element<HTMLButtonElement>('play-pause');
  button.textContent = playing ? 'Ⅱ' : '▶';
  button.setAttribute('aria-label', playing ? 'Pausar reproducción' : progress >= 1 && mode === 'replay' ? 'Volver a reproducir las últimas 24 horas' : 'Reproducir últimas 24 horas');
  element('playback-description').textContent = mode === 'live' ? '24 horas reales en 30 segundos' : playing ? 'REPRODUCIENDO · 24 h / 30 s' : progress >= 1 ? 'FIN DE LA REPRODUCCIÓN' : 'REPRODUCCIÓN EN PAUSA';
}

function updateClock(): void {
  const now = Date.now();
  const sceneTime = mode === 'live' ? now : replayTime(replayStart, replayEnd, progress);
  element('wall-clock').textContent = `${utcClock.format(now)} UTC`;
  element('scene-clock').textContent = utcClock.format(sceneTime);
  element<HTMLInputElement>('timeline').value = String(Math.round(progress * 1000));
  element('timeline-fill').style.width = `${progress * 100}%`;
  globe?.setSun(sceneTime);
}

function tick(delta: number): void {
  sinceFocus += delta;
  if (mode === 'replay' && playing) {
    const previousTime = replayTime(replayStart, replayEnd, progress);
    progress = Math.min(1, progress + delta / 30);
    updateReplay(previousTime);
    if (progress >= 1) { playing = false; updatePlayButton(); }
  }
  lastUI += delta;
  if (lastUI > 0.1) { lastUI = 0; updateClock(); }
}

element('live-mode').addEventListener('click', () => setMode('live'));
element('replay-mode').addEventListener('click', () => setMode('replay'));
element('play-pause').addEventListener('click', () => {
  if (mode === 'live' || progress >= 1) setMode('replay');
  else { playing = !playing; updatePlayButton(); }
});
element<HTMLInputElement>('timeline').addEventListener('input', event => {
  const value = Number((event.target as HTMLInputElement).value) / 1000;
  if (mode === 'live') setMode('replay');
  playing = false;
  progress = value;
  globe?.clearPulses();
  updateReplay(0);
  renderMetrics();
  renderList();
  updatePlayButton();
  updateClock();
});
element('quakes-toggle').addEventListener('click', () => {
  quakesEnabled = !quakesEnabled;
  element('quakes-toggle').classList.toggle('active', quakesEnabled);
  element('quakes-toggle').setAttribute('aria-pressed', String(quakesEnabled));
  globe?.setVisibleEvents(new Set(visibleEvents.map(event => event.id)), quakesEnabled);
});
element('aurora-toggle').addEventListener('click', () => {
  auroraEnabled = !auroraEnabled;
  element('aurora-toggle').classList.toggle('active', auroraEnabled);
  element('aurora-toggle').setAttribute('aria-pressed', String(auroraEnabled));
  globe?.showAurora(auroraEnabled && mode === 'live');
  updateStatus();
});
element('view-aurora').addEventListener('click', () => { closeDetails(); globe?.focusPole(); });
element('reset-view').addEventListener('click', () => { closeDetails(); globe?.resetView(); });
element('detail-close').addEventListener('click', closeDetails);
element('retry-quakes').addEventListener('click', () => void loadQuakes());
element('retry-aurora').addEventListener('click', () => void loadAurora());
const dialog = element<HTMLDialogElement>('sources-dialog');
element('sources-button').addEventListener('click', () => dialog.showModal());
element('footer-sources').addEventListener('click', () => dialog.showModal());
element('close-sources').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });

updateStatus();
updateClock();
void loadQuakes();
void loadAurora();
window.setInterval(() => void loadQuakes(), 60_000);
window.setInterval(() => void loadAurora(), 300_000);
window.setInterval(() => {
  updateStatus();
  if (mode === 'live' && quakeFeed && events.some(event => event.time < Date.now() - DAY)) configureLive();
}, 1000);
window.setInterval(() => { if (!globe) tick(document.hidden ? 0 : 0.1); }, 100);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (Date.now() - quakeReceived >= 60_000) void loadQuakes();
    if (Date.now() - auroraReceived >= 300_000) void loadAurora();
  }
});
