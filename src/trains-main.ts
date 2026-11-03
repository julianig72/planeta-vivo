import './trains.css';
import { TrainMap, type VisualTrain } from './trains-map';
import { parseSnapshot, isRailData, record, fresh, canBlend, blend, lineName, statusName, POLL, FEED_OLD, HIGH_SPEED_NETWORKS,
  type Snapshot, type Train, type Coordinate, type RailData } from './trains-data';

document.title = 'España en movimiento · Cercanías y alta velocidad';
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="rail-map" aria-label="Mapa de posiciones publicadas por Renfe"></div><div class="vignette" aria-hidden="true"></div>
  <header><a class="brand" href="/"><svg viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="5" width="22" height="26" rx="7"/><path d="M13 12h14v9H13zM13 35l4-5m10 5-4-5"/><circle cx="15" cy="26" r="1"/><circle cx="25" cy="26" r="1"/></svg><span>España<span class="brand-light"> en movimiento</span><small>POSICIONES PUBLICADAS · CERCANÍAS + ALTA VELOCIDAD</small></span></a>
    <div class="header-controls"><label class="network-label">SERVICIO<select id="service" aria-label="Tipo de servicio"><option value="cercanias">Cercanías / Rodalies</option><option value="avld">Alta velocidad · Renfe</option></select></label><label class="network-label"><span id="network-label">NÚCLEO</span><select id="network" aria-label="Red o producto de Renfe"><option>Conectando…</option></select></label><button id="pause" class="round" aria-label="Pausar vista" disabled>Ⅱ</button><button id="clean" class="round" aria-label="Vista limpia para presentar" aria-pressed="false">▣</button><button id="sources" class="round info" aria-label="Fuentes y límites">i</button></div>
  </header>
  <main><section class="hero"><p class="eyebrow">UN PAÍS QUE NO SE QUEDA QUIETO</p><h1>Hay un país<br><em>en movimiento.</em></h1><p class="intro" id="intro">Cada punto es una posición publicada.<br>Cada línea, un trazado del GTFS de Renfe.</p><div class="metric"><strong id="train-count">—</strong><span id="count-label">POSICIONES GPS RECIENTES</span></div><div class="connection"><i id="live-dot"></i><span id="connection">CONECTANDO CON RENFE</span></div><p id="notice" class="notice" role="status"></p></section>
    <aside id="side-panel"><section id="train-detail" hidden><div class="detail-top"><span id="detail-line" class="line-badge"></span><button id="close-detail" aria-label="Cerrar tren seleccionado">×</button></div><p class="eyebrow" id="detail-network"></p><h2 id="detail-id"></h2><p id="detail-route"></p><div class="train-state"><i></i><span id="detail-state"></span></div><p id="detail-stop"></p><dl><div><dt>Observación GPS</dt><dd id="detail-time"></dd></div><div><dt>Antigüedad del tren</dt><dd id="detail-age"></dd></div><div><dt>Andén indicado</dt><dd id="detail-platform"></dd></div></dl><button id="follow" class="follow" aria-pressed="false">Seguir este tren ↗</button><p id="follow-note"></p></section>
      <section class="train-list-panel"><div class="panel-heading"><span id="panel-label">EN ESTE NÚCLEO</span><span id="network-name"></span></div><div id="train-list"></div><p class="list-note">Selecciona un punto o un tren.<br>La cámara sigue los puntos publicados, no horarios.</p></section>
    </aside>
    <div class="map-controls"><button id="zoom-in" class="round" aria-label="Acercar mapa">+</button><button id="zoom-out" class="round" aria-label="Alejar mapa">−</button><button id="fit">↗ Ajustar a posiciones</button><span id="view-label">EXPLORA EL MAPA</span></div>
    <div id="empty-state" role="status" hidden></div>
  </main>
  <footer><div><span id="view-state">OBSERVACIONES PUBLICADAS · NO SIMULACIÓN</span><strong id="feed-time">—</strong></div><div class="source-clock"><span id="feed-age">Esperando fuente pública…</span><span id="countdown"></span></div><button id="footer-sources">RENFE · CC BY 4.0 ↗<small id="transition-label">Transiciones: interpolación visual, no mediciones intermedias.</small></button></footer>
  <dialog id="sources-dialog" aria-labelledby="sources-title"><button id="close-sources" class="close" aria-label="Cerrar fuentes">×</button><p class="eyebrow">POSICIONES REALES. LÍMITES VISIBLES.</p><h2 id="sources-title">España en movimiento.<br>No un horario animado.</h2>
    <h3>Fuente pública y cadencia</h3><p>Renfe GTFS-Realtime, <a href="https://data.renfe.com/dataset/ubicacion-vehiculos" target="_blank" rel="noopener noreferrer">Ubicación de los vehículos</a>, CC BY 4.0. El catálogo declara actualización cada 20 segundos. El JSON público no habilita CORS; este servidor local consulta la fuente sin credenciales y comparte una caché de al menos 20 segundos entre clientes.</p><a href="https://gtfsrt.renfe.com/vehicle_positions.json" target="_blank" rel="noopener noreferrer">JSON oficial de posiciones ↗</a><p id="source-times"></p>
    <h3>Alta velocidad: fuente distinta, límites distintos</h3><p><a href="https://data.renfe.com/dataset/posicion-vehiculos-av-ld-md" target="_blank" rel="noopener noreferrer">Posición de vehículos AV/LD/MD</a> y <a href="https://gtfsrt.renfe.com/vehicle_positions_LD.json" target="_blank" rel="noopener noreferrer">JSON oficial LD</a>, CC BY 4.0, actualización declarada cada 15 segundos. Se consulta con una caché independiente de 15 segundos. No se presupone que el feed de Cercanías incluya AVE.</p>
    <p>La vista de alta velocidad filtra por enlace exacto al <a href="https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia" target="_blank" rel="noopener noreferrer">GTFS AV/LD/MD</a>: productos AVE, AVLO, AVANT y sus variantes AVE INT / AVANT EXP. No incluye ALVIA, Intercity, MD ni otras marcas por conjeturas sobre su velocidad. No hay fuente verificada aquí para iryo u Ouigo.</p>
    <p><strong>La muestra verificada de AV/LD no aporta hora GPS por vehículo.</strong> El reloj es del feed, no una medición individual. «Posiciones publicadas» no certifica que cada punto sea actual: se desconoce su antigüedad GPS. La cámara puede seguir sus coordenadas publicadas, pero no se interpolan puntos sin timestamp propio. Un identificador duplicado en varios tramos se cuenta una sola vez.</p>
    <p><strong>El ZIP AV/LD comprobado no contiene shapes.txt.</strong> No se muestran trazados AV inventados ni líneas entre estaciones. Las estaciones y productos proceden del GTFS; la paleta por producto es propia de la aplicación. Horarios estáticos y predicciones de <code>trip_updates_LD</code> no se usan como GPS ni se integran como mediciones. Adif devolvió HTTP 403 en las páginas oficiales consultadas: no se pudo verificar un recurso de posición reutilizable y no se incorporan datos suyos.</p>
    <h3>Qué es un punto</h3><p>Una latitud/longitud GPS publicada para un identificador del feed. La hora del feed y la observación individual se muestran por separado. No se infieren velocidad, rumbo, retraso, ocupación o llegada. El estado GTFS indica parada, aproximación o tránsito respecto a una estación, no una velocidad medida. El andén solo aparece si Renfe lo incluye en la etiqueta.</p>
    <h3>Transiciones y pausa</h3><p>En Cercanías, un cambio entre dos posiciones recibidas del mismo viaje puede animarse durante 5 segundos. Es interpolación visual en línea recta, no GPS intermedio, ni recorrido observado sobre una vía. Alta velocidad no interpola puntos. Nunca extrapolamos después de la última posición. La pausa congela el último conjunto de observaciones, no inventa un replay; las consultas continúan y su antigüedad sigue visible.</p>
    <h3>Antigüedad, desaparición y errores</h3><p>Feed de 90 segundos o más: antiguo. Observación de 120 segundos o más, o sin hora propia: no se cuenta como GPS reciente. En alta velocidad se cuentan por separado las posiciones publicadas en un feed reciente, con antigüedad GPS desconocida. Las posiciones de un feed antiguo o conservadas por un error se ven grises, sin seguimiento activo. En una nueva lista completa, un tren ausente desaparece del mapa. Un feed vacío puede reflejar servicio nocturno o falta de datos: no lo sustituimos por trenes simulados.</p><p id="source-excluded"></p>
    <h3>Estaciones, rutas y redes</h3><p><a href="https://data.renfe.com/dataset/horarios-cercanias" target="_blank" rel="noopener noreferrer">GTFS estático de Cercanías y Rodalies</a>, CC BY 4.0. Se enlaza tripId exactamente con trip_id y de ahí a route_id / shape_id. stopId se une por su código exacto con stops.txt. Se conservan las coordenadas y el orden original de shapes.txt; no se dibujan vías deducidas de horarios ni de la proximidad entre estaciones.</p>
    <p>C1 no es una línea nacional única. Agrupamos por prefijo de ruta GTFS, con nombres contrastados con sus extremos: Madrid, Asturias, Sevilla y las demás redes. Las claves internas no son códigos oficiales de núcleo. Un viaje sin enlace se muestra en «Sin red enlazada», con su GPS, sin atribuirle una ruta. Las estaciones son contexto geográfico, no se infiere qué líneas las sirven por proximidad.</p><p id="static-times"></p>
    <h3>Cobertura y cartografía</h3><p>Solo lo publicado en la fuente elegida con coordenadas peninsulares válidas; no todos los servicios ni todas las operadoras. Se excluyen coordenadas inválidas, duplicados y rutas de autobús identificadas en GTFS. Mapa base: OpenFreeMap / OpenMapTiles / OpenStreetMap, con atribución en el mapa. Si falla la cartografía, posiciones y trazados GTFS son independientes; si no hay WebGL, la lista de datos permanece accesible.</p><p id="map-status"></p><p class="source-small">Sin claves, sin telemetría propia, sin datos sintéticos ni historial ficticio. El identificador del feed no garantiza identificar el mismo material rodante de forma permanente. El navegador contacta el servidor local, OpenFreeMap y Google Fonts.</p>
  </dialog>`;

function el<T extends Element = HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`Falta el elemento ${id}.`);
  return element;
}
const stamp = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
const age = (time: number | null) => time === null ? 'Hora propia no publicada' : `${Math.max(0, Math.floor((Date.now() - time) / 1000))} s`;
let rail: RailData | null = null, latest: Snapshot | null = null, shown: Snapshot | null = null;
let network = '', selected: string | null = null, following = false, paused = false, clean = false;
let feedError: string | null = null, staticError: string | null = null, mapError: string | null = null;
let loading = false, attempted = -Infinity, fitted = false, notification = '';
let initialized = false;
let service: 'cercanias' | 'avld' = 'cercanias', generation = 0;
const chosenNetworks = { cercanias: '', avld: 'all-av' };
const cadence = () => service === 'avld' ? 15_000 : POLL;
let listSignature = '';
let networkSignature = '';
const motions = new Map<string, { from: Coordinate; to: Coordinate; started: number }>();
let view: TrainMap | null = null;
function stopFollowing(): void { following = false; view?.follow(false); updateDetail(); }
try {
  view = new TrainMap(el('rail-map'), selectTrain, stopFollowing, (message, fatal = false) => {
    mapError = message;
    if (fatal) { document.body.classList.add('map-unavailable'); stopFollowing(); }
    renderUI();
  });
} catch (error) {
  console.error('Mapa WebGL', error); document.body.classList.add('map-unavailable');
  mapError = 'No se pudo iniciar WebGL. Las posiciones siguen disponibles en la lista.';
}

function trains(): Train[] { return shown?.trains.filter(train => network === 'all-av' || train.network === network) ?? []; }
function networkName(id: string): string { return id === 'all-av' ? 'Todos · AVE / AVLO / Avant' : rail?.networks[id]?.name ?? 'Sin red enlazada'; }
function recent(train: Train): boolean { return Boolean(shown && !feedError && !paused && fresh(train, shown)); }
function currentPublication(train: Train, snapshot = shown): boolean {
  return Boolean(snapshot && !feedError && !paused && (service === 'avld' && train.observed === null ?
    Date.now() - snapshot.timestamp < FEED_OLD : fresh(train, snapshot)));
}
function canFollow(train: Train): boolean { return Boolean(view && currentPublication(train) && !document.body.classList.contains('map-unavailable')); }
function renderMap(): void {
  const now = performance.now(), visuals: VisualTrain[] = trains().map(train => {
    const motion = motions.get(train.key);
    let point = train.coordinates;
    if (motion && recent(train)) {
      const progress = (now - motion.started) / 5000;
      point = blend(motion.from, motion.to, progress);
      if (progress >= 1) motions.delete(train.key);
    } else motions.delete(train.key);
    return { train, coordinates: point, recent: currentPublication(train) };
  });
  view?.render(visuals);
}
async function poll(): Promise<void> {
  if (!initialized || loading || Date.now() - attempted < cadence()) return;
  const version = generation;
  loading = true; attempted = Date.now();
  try {
    const response = await fetch(service === 'avld' ? '/api/high-speed/positions' : '/api/positions', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (version !== generation) return;
    if (!response.ok) {
      const reason: unknown = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : null;
      throw new Error(`Consulta a Renfe HTTP ${response.status}${record(reason) && typeof reason.error === 'string' ? `: ${reason.error}` : ''}`);
    }
    const raw: unknown = await response.json();
    if (version !== generation) return;
    const next = parseSnapshot(raw, rail, Date.now(), service === 'avld' ? HIGH_SPEED_NETWORKS : undefined);
    if (latest && next.timestamp < latest.timestamp) throw new Error('El feed retrocede en el tiempo; no sustituimos la observación anterior.');
    feedError = null;
    if (!paused) {
      const previous = new Map((shown?.trains ?? []).map(train => [train.key, train]));
      for (const train of next.trains) {
        const old = previous.get(train.key);
        if (service === 'cercanias' && old && canBlend(old, train) && fresh(train, next) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          motions.set(train.key, { from: old.coordinates, to: train.coordinates, started: performance.now() });
        }
      }
      shown = next;
    }
    latest = next;
    if (!network) {
      const counts = new Map<string, number>();
      for (const train of next.trains.filter(train => fresh(train, next))) counts.set(train.network, (counts.get(train.network) ?? 0) + 1);
      network = chosenNetworks[service] || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || Object.keys(rail?.networks ?? {})[0] || 'unlinked';
    }
    if (selected && !trains().some(train => train.key === selected)) {
      selected = null; stopFollowing(); view?.setSelected(null); notification = 'El tren seleccionado ya no aparece en el conjunto mostrado.';
    }
    if (selected && !trains().some(train => train.key === selected && currentPublication(train))) stopFollowing();
    view?.setNetwork(network);
    renderUI(); renderMap();
    if (!fitted && (trains().length || service === 'avld')) { fitted = true; view?.fit(trains(), clean); }
  } catch (error) {
    if (version !== generation) return;
    console.error('Renfe · posiciones', error);
    feedError = error instanceof Error ? error.message : 'Error de conexión desconocido.';
    motions.clear(); stopFollowing(); renderUI(); renderMap();
  } finally { if (version === generation) loading = false; }
}
function renderUI(): void {
  const all = trains(), current = all.filter(train => currentPublication(train));
  el('network-label').textContent = service === 'avld' ? 'PRODUCTO RENFE' : 'NÚCLEO';
  el('network').setAttribute('aria-label', service === 'avld' ? 'Producto de alta velocidad' : 'Red de Cercanías');
  el('intro').innerHTML = service === 'avld' ? 'AVE, AVLO y Avant publicados por Renfe.<br>Posiciones del feed. Hora GPS no publicada.' :
    'Cada punto es una posición publicada.<br>Cada línea, un trazado del GTFS de Renfe.';
  el('panel-label').textContent = service === 'avld' ? 'POSICIONES PUBLICADAS' : 'EN ESTE NÚCLEO';
  el('train-count').textContent = shown ? String(paused ? all.length : current.length) : '—';
  el('count-label').textContent = paused ? `${all.length} POSICIONES EN VISTA CONGELADA` :
    service === 'avld' ? 'POSICIONES EN EL FEED RECIENTE' : 'POSICIONES GPS RECIENTES';
  el('connection').textContent = feedError ? 'CONEXIÓN INTERRUMPIDA · POSICIONES CONSERVADAS' : paused ? 'VISTA CONGELADA · NO ES DIRECTO' :
    latest && Date.now() - latest.timestamp >= FEED_OLD ? 'FEED ANTIGUO · NO ES DIRECTO' : latest ?
      service === 'avld' ? 'FEED AV/LD RECIENTE · NO IMPLICA GPS RECIENTE' : 'RENFE · OBSERVACIONES RECIENTES' : 'CONECTANDO CON RENFE';
  el('live-dot').classList.toggle('live', Boolean(service === 'cercanias' && latest && !feedError && !paused && Date.now() - latest.timestamp < FEED_OLD));
  el('notice').textContent = [feedError && `No se pudieron actualizar las posiciones. ${feedError}`, staticError, mapError,
    notification, service === 'avld' ? `${all.filter(train => train.observed === null).length}/${all.length} posiciones sin hora GPS individual: antigüedad desconocida. El reloj es del feed. Sin trazados: el GTFS AV/LD no los publica.` : '',
    latest?.excluded ? `${latest.excluded} registros sin GPS válido, duplicados o no ferroviarios excluidos.` : '',
    all.length > current.length && !paused ? `${all.length - current.length} observaciones conservadas/antiguas se muestran grises.` : ''].filter(Boolean).join(' ');
  const selector = el<HTMLSelectElement>('network');
  const networks = new Set([...(service === 'avld' ? ['all-av'] : []), ...Object.keys(rail?.networks ?? {}), ...(latest?.trains.map(train => train.network) ?? [])]);
  const options = [...networks].map(id => {
    const count = latest?.trains.filter(train => (id === 'all-av' || train.network === id) &&
      !feedError && (service === 'avld' && train.observed === null ? Date.now() - latest!.timestamp < FEED_OLD : fresh(train, latest!))).length ?? 0;
    return { id, label: `${networkName(id)} · ${count}` };
  });
  const optionsSignature = JSON.stringify(options);
  if (optionsSignature !== networkSignature) {
    networkSignature = optionsSignature; selector.replaceChildren();
    for (const item of options) {
      const option = document.createElement('option');
      option.value = item.id; option.textContent = item.label; selector.append(option);
    }
  }
  if (selector.value !== network) selector.value = network;
  el('network-name').textContent = networkName(network);
  const signature = `${service}:${network}:${shown?.timestamp}:${selected}:${all.map(train => `${train.key}:${currentPublication(train)}`).join(',')}`;
  const list = el('train-list');
  if (signature !== listSignature) {
  listSignature = signature; list.replaceChildren();
  for (const train of [...all].sort((a, b) => Number(currentPublication(b)) - Number(currentPublication(a)) || a.label.localeCompare(b.label))) {
    const button = document.createElement('button'); button.className = 'train-row'; button.dataset.train = train.key;
    button.classList.toggle('selected', train.key === selected); button.classList.toggle('old', !currentPublication(train));
    button.style.setProperty('--line', train.route?.color ?? '#a0b8c8');
    const badge = document.createElement('span'); badge.className = 'line-badge'; badge.textContent = lineName(train);
    const info = document.createElement('span'), name = document.createElement('strong'), stop = document.createElement('small');
    name.textContent = `Tren ${train.id}`; stop.textContent = rail?.stops[train.stopId]?.name ?? statusName(train);
    info.append(name, stop); button.append(badge, info);
    button.setAttribute('aria-label', `${networkName(train.network)}, ${lineName(train)}, tren ${train.id}`);
    button.addEventListener('click', () => selectTrain(train.key)); list.append(button);
  }
  }
  el('empty-state').hidden = Boolean(all.length);
  el('empty-state').textContent = service === 'avld' && staticError ? 'Sin GTFS no se puede clasificar un GPS como AVE, AVLO o Avant.' : !latest ? 'Esperando posiciones reales de Renfe…' :
    feedError ? 'No se pueden confirmar posiciones actuales.' : 'No hay posiciones en esta vista. Puede ser una franja sin servicio o sin datos publicados.';
  el<HTMLButtonElement>('pause').disabled = !shown;
  el('pause').textContent = paused ? '▶' : 'Ⅱ';
  el('pause').setAttribute('aria-label', paused ? 'Volver a las últimas observaciones' : 'Pausar vista');
  el('view-state').textContent = paused && shown ? `VISTA CONGELADA DEL ${stamp.format(shown.timestamp)}` :
    service === 'avld' ? 'HORA DEL FEED AV/LD · NO ES LA HORA GPS INDIVIDUAL' : 'OBSERVACIONES PUBLICADAS · NO SIMULACIÓN';
  el('feed-time').textContent = latest ? stamp.format(latest.timestamp) : '—';
  el('feed-age').textContent = latest ? `Antigüedad del feed: ${age(latest.timestamp)}` : 'Esperando fuente pública…';
  el('countdown').textContent = `Nueva consulta en ${Math.max(0, Math.ceil((cadence() - (Date.now() - attempted)) / 1000))} s`;
  el('transition-label').textContent = service === 'avld' ? 'GPS publicados sin hora propia: no se interpolan ni se estiman posiciones.' : 'Transiciones: interpolación visual, no mediciones intermedias.';
  el('source-times').textContent = latest ? `${service === 'avld' ? 'AV/LD · ' : 'Cercanías · '}Feed: ${stamp.format(latest.timestamp)}. Última descarga desde Renfe: ${stamp.format(latest.receivedAt)}. Último intento local: ${stamp.format(attempted)}.${feedError ? ` Error: ${feedError}` : ''}` : 'Todavía no hay una descarga válida.';
  el('source-excluded').textContent = latest ? `${latest.trains.length} posiciones válidas en la vista; ${latest.excluded} registros excluidos; ${latest.filtered} servicios no clasificados en los productos elegidos, omitidos. ${latest.trains.filter(train => train.observed === null).length} sin hora GPS individual.` : '';
  el('static-times').textContent = rail ? `GTFS preparado: ${stamp.format(Date.parse(rail.metadata.preparedAt))}. Enlaces exactos presentes en esta descarga: ${latest?.trains.filter(train => train.route).length ?? 0}/${latest?.trains.length ?? 0}.${Date.now() - Date.parse(rail.metadata.preparedAt) > 7 * 86400_000 ? ' GTFS de más de 7 días: conviene regenerar; algunas rutas pueden no enlazar.' : ''}` : staticError ?? 'GTFS no cargado.';
  el('map-status').textContent = mapError ?? 'Cartografía y capas de Renfe independientes.';
  updateDetail();
}
function updateDetail(): void {
  const train = trains().find(train => train.key === selected);
  el('train-detail').hidden = !train;
  el('view-label').textContent = 'EXPLORA EL MAPA';
  if (!train) return;
  el('detail-line').textContent = lineName(train); el('detail-line').style.setProperty('--line', train.route?.color ?? '#a0b8c8');
  el('detail-network').textContent = networkName(train.network);
  el('detail-id').textContent = `Tren ${train.id}`; el('detail-route').textContent = train.route?.name ?? `Viaje sin ruta enlazada · ${train.tripId || train.label}`;
  el('detail-state').textContent = `${statusName(train)}${service === 'avld' && train.observed === null ? ' · hora GPS desconocida' : !recent(train) ? ' · observación no actual' : ''}`;
  el('detail-stop').textContent = rail?.stops[train.stopId]?.name ?? `Estación sin enlace · ${train.stopId || 'sin código'}`;
  el('detail-time').textContent = train.observed ? stamp.format(train.observed) : 'No publicada';
  el('detail-age').textContent = age(train.observed); el('detail-platform').textContent = train.platform ?? 'No publicado';
  el<HTMLButtonElement>('follow').disabled = !canFollow(train);
  el('follow').textContent = following ? 'Siguiendo este tren · detener ↗' : 'Seguir este tren ↗';
  el('follow').setAttribute('aria-pressed', String(following));
  el('follow-note').textContent = service === 'avld' && train.observed === null ?
    'Sigue las coordenadas del feed, no un horario. No se conoce su antigüedad GPS; sin interpolación.' :
    following ? 'Navegar manualmente detiene el seguimiento.' : 'La cámara sigue posiciones recibidas, no un horario.';
  el('view-label').textContent = following ? `SIGUIENDO ${lineName(train)} · ${train.id}` : 'EXPLORA EL MAPA';
  view?.setSelected(train);
}
function selectTrain(key: string): void {
  const train = trains().find(train => train.key === key);
  if (!train) return;
  selected = key; notification = ''; following = canFollow(train);
  view?.setSelected(train); view?.follow(following); renderUI(); renderMap();
}
el<HTMLSelectElement>('network').addEventListener('change', () => {
  network = el<HTMLSelectElement>('network').value; selected = null; notification = ''; fitted = true;
  stopFollowing(); view?.setSelected(null); view?.setNetwork(network); renderUI(); renderMap(); view?.fit(trains(), clean);
});
el('pause').addEventListener('click', () => {
  paused = !paused; motions.clear(); stopFollowing();
  if (latest) shown = latest;
  if (selected && !trains().some(train => train.key === selected)) {
    selected = null; view?.setSelected(null); notification = 'El tren seleccionado ya no aparece en las últimas observaciones.';
  }
  renderUI(); renderMap();
});
el('follow').addEventListener('click', () => { following = !following; view?.follow(following); updateDetail(); });
el('close-detail').addEventListener('click', () => { selected = null; stopFollowing(); view?.setSelected(null); renderUI(); renderMap(); });
el('fit').addEventListener('click', () => { stopFollowing(); view?.fit(trains(), clean); });
for (const [id, change] of [['zoom-in', 1], ['zoom-out', -1]] as const) el(id).addEventListener('click', () => {
  stopFollowing(); if (view) view.map.easeTo({ zoom: view.map.getZoom() + change, duration: 400 });
});
el('clean').addEventListener('click', () => { clean = !clean; document.body.classList.toggle('clean', clean); el('clean').setAttribute('aria-pressed', String(clean)); });
const dialog = el<HTMLDialogElement>('sources-dialog');
for (const id of ['sources', 'footer-sources']) el(id).addEventListener('click', () => dialog.showModal());
el('close-sources').addEventListener('click', () => dialog.close());
let lastPaint = 0;
function tick(now: number): void { if (motions.size && now - lastPaint > 50) { lastPaint = now; renderMap(); } requestAnimationFrame(tick); }
requestAnimationFrame(tick);
document.addEventListener('visibilitychange', () => { if (!document.hidden && initialized) { renderUI(); renderMap(); void poll(); } });
async function loadService(): Promise<void> {
  const version = ++generation;
  initialized = false; loading = false; attempted = -Infinity; fitted = false;
  rail = null; latest = null; shown = null; selected = null; paused = false;
  feedError = null; staticError = null; notification = ''; listSignature = ''; network = chosenNetworks[service];
  motions.clear(); stopFollowing(); view?.setSelected(null); view?.setRail(null);
  renderUI(); renderMap();
  try {
    const response = await fetch(service === 'avld' ? '/rail/high-speed.json' : '/rail/network.json', { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`GTFS HTTP ${response.status}`);
    const raw: unknown = await response.json();
    if (version !== generation) return;
    if (!isRailData(raw)) throw new Error('GTFS preparado con formato inválido.');
    rail = raw; view?.setRail(rail);
  } catch (error) {
    if (version !== generation) return;
    console.error('GTFS estático', error);
    staticError = service === 'avld' ? 'GTFS AV/LD no disponible: no se pueden clasificar los productos de alta velocidad.' :
      'GTFS no disponible: GPS sin red ni trazado atribuible.';
  }
  initialized = true; await poll();
}
el<HTMLSelectElement>('service').addEventListener('change', () => {
  chosenNetworks[service] = network;
  service = el<HTMLSelectElement>('service').value === 'avld' ? 'avld' : 'cercanias';
  void loadService();
});
window.setInterval(() => { if (initialized) { renderUI(); renderMap(); void poll(); } }, 1000);
void loadService();
