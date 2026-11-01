import './generation.css';
import { GenerationChart } from './generation-chart';
import { HOUR, midnight, bounds, fetchGenerationHistory, historyURL, historyIndex, errorText, type GenerationHistory } from './energy';

document.title = 'España respira energía · Así cambia la generación';
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <div class="ambient" aria-hidden="true"></div>
  <header class="header">
    <a class="brand" href="/" aria-label="España respira energía, inicio"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><path d="M22 8 13 22h7l-2 10 10-15h-8z"/></svg><span>planeta<span class="brand-light">vivo</span><small>ESPAÑA RESPIRA ENERGÍA</small></span></a>
    <div class="header-right"><span id="connection" class="connection">CONECTANDO CON REData</span><button id="refresh" class="icon-button" aria-label="Actualizar el período" title="Actualizar fuentes">↻</button><button id="sources-button" class="icon-button" aria-label="Fuentes, fechas y límites">i</button></div>
  </header>
  <main>
    <section class="hero" aria-labelledby="headline">
      <div><p class="eyebrow">ESPAÑA PENINSULAR · GENERACIÓN REAL</p><h1 id="headline">La energía <em>cambia.</em></h1><p class="hero-description">Solar, eólica y otras fuentes. Ahora puedes ver cómo evolucionan.</p></div>
      <div class="date-display"><span>EL DÍA QUE ESTÁS VIENDO</span><time id="selected-date">—</time><p id="selected-year">AGREGADOS DIARIOS · ARCHIVO</p></div>
    </section>
    <div id="data-notice" class="data-notice" role="alert" hidden></div>
    <div class="experience">
      <section class="chart-panel" aria-label="Evolución temporal de generación por tecnología">
        <div class="chart-heading"><span>GENERACIÓN POR TECNOLOGÍA</span><span>GWh / DÍA · ÁREAS APILADAS</span></div>
        <div class="chart-stage"><svg id="generation-chart" tabindex="0" role="img" aria-label="Generación diaria por tecnología. Usa las flechas para explorar." aria-describedby="chart-help"></svg><div id="chart-empty" class="chart-empty" role="status"><span>Una historia real,<br><em>día a día.</em></span><p>Consultando la generación pública de REData…</p></div></div>
        <div class="chart-foot"><p id="chart-help">Explora la gráfica o mueve el cursor. Selecciona una fuente para destacarla.</p><span id="period-label">BUSCANDO DÍAS PUBLICADOS</span></div>
        <div class="change-story"><span class="story-mark" aria-hidden="true">↗</span><div><span id="comparison-label">CAMBIO RESPECTO AL DÍA ANTERIOR</span><p id="change-insight">Las franjas cambian con los datos. No con una simulación.</p></div></div>
      </section>
      <aside class="mix-panel" aria-label="Generación del día seleccionado">
        <div class="mix-heading"><span>LA GENERACIÓN DE ESTE DÍA</span><strong id="generation-total">—</strong></div>
        <div id="mix-list" class="mix-list"></div>
        <p class="mix-note">Cada valor es energía total de un día en GWh.<br><span id="component-note">No es potencia instantánea ni una curva horaria.</span></p>
        <button id="reset-focus" class="text-button" hidden>Ver todas las fuentes ↗</button>
      </aside>
    </div>
    <section class="playback" aria-label="Reproducción cronológica de generación diaria">
      <div class="playback-top">
        <div class="playback-controls"><button id="play-pause" class="play-button" disabled aria-label="Reproducir el período">▶</button><div><strong id="play-state">Generación real en 30 segundos</strong><span id="play-resolution">UN PASO = UN DÍA PUBLICADO · SIN INTERPOLACIÓN</span></div></div>
        <div class="playback-date"><span>RESOLUCIÓN DIARIA</span><time id="scene-date">—</time></div>
        <div class="manual-controls"><button id="previous-day" class="icon-button" disabled aria-label="Día anterior">‹</button><button id="next-day" class="icon-button" disabled aria-label="Día siguiente">›</button><button id="restart" class="text-button" disabled>↺ Ir al inicio</button></div>
      </div>
      <input id="timeline" type="range" min="0" max="1" step="1" value="1" aria-label="Día en reproducción" disabled />
      <div class="timeline-labels"><time id="first-date">—</time><span id="sample-count">DATOS DIARIOS, NO TIEMPO REAL</span><time id="last-date">—</time></div>
    </section>
  </main>
  <footer class="footer"><span id="data-age">DATOS HISTÓRICOS · ESPAÑA PENINSULAR</span><button id="footer-sources">RED ELÉCTRICA · REData ↗</button><span id="source-status" role="status">Consultando fuente pública…</span></footer>
  <dialog id="sources-dialog" aria-labelledby="sources-title">
    <button id="close-sources" class="detail-close" aria-label="Cerrar fuentes">×</button><p class="eyebrow">DATOS REALES. RESOLUCIÓN VISIBLE.</p><h2 id="sources-title">Cómo cambia la generación.<br>Un día real en cada paso.</h2>
    <p id="source-period"></p><h3>Fuente y resolución comprobadas</h3><p>REData, widget público <code>generacion/estructura-generacion</code>, con <code>time_trunc=day</code>. Mostramos energía diaria en GWh. Las áreas tienen escalones: no fabricamos observaciones entre días. El cursor y las barras pueden moverse con fluidez, pero las cifras solo cambian al pasar a otro agregado real.</p>
    <p>La consulta horaria de este widget, estructura-renovables, evolucion-renovable-no-renovable, estructura-generacion-emisiones-asociadas y no-renovables-detalle-emisiones-CO2 devolvió HTTP 400 en las pruebas. No afirmamos que REData nunca tenga otros productos: este desglose verificado es diario. No se inventan curvas horarias de solar o eólica.</p>
    <h3>Qué significa cada franja</h3><p>Solar reúne fotovoltaica y térmica. Eólica, hidráulica, nuclear y ciclo combinado mantienen sus datos publicados; Otras agrupa las tecnologías restantes. La suma se valida contra la generación total con una tolerancia de redondeo de 2 MWh. Los porcentajes se calculan sobre ese total, no sumando porcentajes de subgrupos.</p>
    <p>Los valores publicados conservan su signo: por ejemplo, carbón aparece negativo en algunos días de este período y contribuye con ese signo al grupo Otras. No se transforma en cero ni se elimina el día. Si un grupo completo es negativo, se dibuja bajo cero y una línea discontinua señala el total firmado. Las barras del panel comparan magnitudes absolutas; el signo permanece en la cifra.</p>
    <p>El bombeo y los intercambios no se añaden al mix de este producto. No se etiqueta la turbinación de bombeo como renovable. No afirmamos generación bruta ni explicamos una causa física de los signos que la API no documenta. No se compara la generación con la demanda en esta vista.</p>
    <h3>Fechas, días sin datos y comparaciones</h3><p>Buscamos 30 días anteriores a hoy en Europe/Madrid. La gráfica termina en el último día válido publicado. Si falta un día dentro del período aparece un hueco rayado y sus cifras quedan no disponibles, nunca rellenadas. El cambio se calcula frente al día calendario anterior; si falta ese dato no se calcula un cambio.</p><p>Los días tienen su energía real, incluidos los de 23 o 25 horas por cambio de horario. No los normalizamos a 24 horas ni presentamos GWh como GW.</p>
    <h3>Ámbito peninsular</h3><p>Filtros explícitos: geo_trunc=electric_system, geo_limit=peninsular, geo_ids=8741. Canarias, Baleares, Ceuta y Melilla no forman parte del agregado. No se representan regiones, centrales ni flujos físicos.</p>
    <h3>Producto y descargas</h3><p id="source-times"></p><a id="source-response" target="_blank" rel="noopener noreferrer">Ver respuesta REData ↗</a><p id="source-errors"></p>
    <h3>Componentes del día seleccionado · GWh</h3><div id="technology-table"></div><p id="unreported-components"></p>
    <p class="source-small"><a href="https://www.ree.es/es/datos/apidatos" target="_blank" rel="noopener noreferrer">Documentación pública REData ↗</a> · Sin ESIOS, claves ni datos sintéticos de sustitución. Si falla una actualización se conserva la última descarga válida identificada y se muestra el error.</p>
  </dialog>
`;

function el<T extends Element = HTMLElement>(id: string): T {
  const node = document.querySelector<T>(`#${id}`);
  if (!node) throw new Error(`No existe el elemento ${id}.`);
  return node;
}
const number = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const componentNumber = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 6 });
const gwh = (value: number) => `${number.format(value / 1000)} GWh`;
const percent = (value: number) => `${number.format(value * 100)}%`;
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number.format(Math.abs(value) / 1000)} GWh`;
const shortDate = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'short' });
const fullDate = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'long', year: 'numeric' });
const stamp = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

let history: GenerationHistory | null = null;
let progress = 1, playing = false, replay = false, loading = false, lastIndex = -1;
let focused: string | null = null, refreshError: string | null = null, attempted = 0;
let lastFrame = 0, frame = 0;
const chart = new GenerationChart(el<SVGSVGElement>('generation-chart'), explore);

async function load(): Promise<void> {
  if (loading) return;
  loading = true; pause(); attempted = Date.now();
  el<HTMLButtonElement>('refresh').disabled = true;
  el('connection').textContent = history ? 'ACTUALIZANDO EL ARCHIVO' : 'BUSCANDO GENERACIÓN REAL';
  try {
    const next = await fetchGenerationHistory(history?.startDate, history?.endDate);
    const oldDate = history?.days[historyIndex(history.days.length, progress)].date;
    history = next; refreshError = null;
    const index = oldDate ? history.days.findIndex(day => day.date === oldDate) : -1;
    progress = index >= 0 ? (index + 0.5) / history.days.length : 1;
    lastIndex = -1;
    chart.setHistory(history);
    el('chart-empty').hidden = true;
    renderStatic(); updateView();
  } catch (error) {
    console.error('REData · evolución de generación', error);
    refreshError = errorText(error);
    el('data-notice').hidden = false;
    el('data-notice').textContent = history ? `Error al actualizar. Últimos datos conservados: ${refreshError}` :
      `No se puede mostrar evolución real: ${refreshError} Pulsa actualizar para volver a consultar.`;
    el('connection').textContent = history ? 'ARCHIVO CONSERVADO · REVISAR FUENTE' : 'REData NO DISPONIBLE';
    el('connection').classList.remove('connected');
    el('source-status').textContent = history ? 'Error al actualizar · última descarga válida conservada' : 'Generación no disponible';
    if (!history) el('chart-empty').textContent = 'La fuente no ofrece una serie válida. No usamos datos de sustitución.';
    renderSources();
  } finally {
    loading = false; el<HTMLButtonElement>('refresh').disabled = false; updatePlayState();
  }
}

function renderStatic(): void {
  if (!history) return;
  const first = history.days[0], last = history.days[history.days.length - 1];
  const missing = history.days.filter(day => !day.mix);
  el('period-label').textContent = `${shortDate.format(midnight(first.date))} — ${shortDate.format(midnight(last.date))} · ${history.days.length} DÍAS`;
  el('first-date').textContent = fullDate.format(midnight(first.date));
  el('last-date').textContent = fullDate.format(midnight(last.date));
  el('sample-count').textContent = `${history.days.filter(day => day.mix).length} DÍAS VÁLIDOS · RESOLUCIÓN DIARIA`;
  el('source-status').textContent = `Producto: ${stamp.format(history.updated)}`;
  el('connection').textContent = missing.length ? 'ARCHIVO REAL · CON HUECOS' : 'REData · GENERACIÓN DIARIA REAL';
  el('connection').classList.toggle('connected', !missing.length);
  el('data-notice').hidden = !missing.length;
  el('data-notice').textContent = missing.length ? `${missing.length} día(s) sin generación válida: se muestran huecos, no datos rellenados. Consulta las fuentes.` : '';
  el<HTMLInputElement>('timeline').max = String(history.days.length - 1);
  el<HTMLInputElement>('timeline').disabled = false;
  el<HTMLButtonElement>('restart').disabled = false;
  updateAge();
  const list = el('mix-list'); list.replaceChildren();
  for (const group of first.mix!.groups) {
    const button = document.createElement('button');
    button.className = 'mix-row'; button.dataset.technology = group.id;
    button.style.setProperty('--technology', group.color);
    button.innerHTML = '<span class="technology-name"><i></i><span></span><small></small></span><span class="technology-values"><strong></strong><small></small></span><span class="technology-bar"><span></span></span>';
    button.querySelector('.technology-name > span')!.textContent = group.title;
    button.setAttribute('aria-pressed', String(focused === group.id));
    button.addEventListener('click', () => focus(focused === group.id ? null : group.id));
    list.append(button);
  }
}

function updateAge(): void {
  if (!history) return;
  const lag = Math.max(0, (Date.now() - bounds(history.days[history.days.length - 1].date).end) / HOUR);
  el('data-age').textContent = `ARCHIVO · ÚLTIMO DÍA HACE ${number.format(lag)} H · NO ES HOY`;
  el('data-age').classList.toggle('warning', lag > 72);
}

function updateView(): void {
  if (!history) return;
  const index = historyIndex(history.days.length, progress);
  chart.setCursor(progress);
  el<HTMLInputElement>('timeline').value = String(index);
  root.dataset.dayIndex = String(index);
  if (index === lastIndex) return;
  lastIndex = index;
  const day = history.days[index], previous = history.days[index - 1]?.mix;
  const date = midnight(day.date);
  root.dataset.selectedDate = day.date;
  el('selected-date').textContent = shortDate.format(date).replace('.', '');
  el('selected-date').setAttribute('datetime', day.date);
  el('selected-year').textContent = `${day.date.slice(0, 4)} · ${day.mix ? 'ENERGÍA TOTAL DE ESTE DÍA' : 'DÍA SIN DATOS VÁLIDOS'}`;
  el('scene-date').textContent = shortDate.format(date).replace('.', '');
  el('scene-date').setAttribute('datetime', day.date);
  el<HTMLInputElement>('timeline').setAttribute('aria-valuetext', fullDate.format(date));
  el('generation-total').textContent = day.mix ? gwh(day.mix.total) : '—';
  const maximum = Math.max(...history.days.flatMap(day => day.mix?.groups.map(group => Math.abs(group.value)) ?? []));
  for (const button of el('mix-list').querySelectorAll<HTMLButtonElement>('.mix-row')) {
    const group = day.mix?.groups.find(group => group.id === button.dataset.technology);
    const old = previous?.groups.find(group => group.id === button.dataset.technology);
    const change = group && old ? group.value - old.value : null;
    button.querySelector('strong')!.textContent = group ? gwh(group.value) : '—';
    button.querySelector('.technology-name small')!.textContent = group ? percent(group.share) : 'Sin dato';
    button.querySelector('.technology-values small')!.textContent = change !== null ? signed(change) : 'Sin comparación';
    button.querySelector<HTMLElement>('.technology-bar span')!.style.width = group ? `${Math.abs(group.value) / maximum * 100}%` : '0%';
    button.classList.toggle('unavailable', !group);
    button.setAttribute('aria-label', group ? `${group.title}: ${gwh(group.value)}, ${percent(group.share)}. ${change !== null ? `Cambio ${signed(change)} respecto al día anterior.` : 'Sin comparación.'}` : `${button.querySelector('.technology-name > span')!.textContent}: sin dato.`);
  }
  el('comparison-label').textContent = previous ? `CAMBIO FRENTE AL ${shortDate.format(midnight(history.days[index - 1].date)).toUpperCase()}` : 'SIN COMPARACIÓN CON EL DÍA ANTERIOR';
  const changes = day.mix && previous ? day.mix.groups.map(group => ({
    group, delta: group.value - previous.groups.find(old => old.id === group.id)!.value,
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) : [];
  const largest = focused ? changes.find(change => change.group.id === focused) : changes[0];
  el('change-insight').textContent = !day.mix ? `Sin datos válidos para este día. ${day.error}` : largest ?
    `${largest.group.title} ${largest.delta > 0 ? 'sube' : largest.delta < 0 ? 'baja' : 'se mantiene'}${largest.delta ? ` ${gwh(Math.abs(largest.delta))}` : ''}. El mix vuelve a cambiar.` :
    index === 0 ? 'Este es el primer día disponible. Avanza para ver cómo cambia la generación.' :
    'No hay un dato válido del día anterior para comparar. Explora otro día.';
  el('change-insight').style.color = largest?.group.color ?? '';
  el('component-note').textContent = day.unreported.length && day.mix ? 'Otras suma los componentes publicados; el total diario cierra.' : 'No es potencia instantánea ni una curva horaria.';
  el<HTMLButtonElement>('previous-day').disabled = index === 0;
  el<HTMLButtonElement>('next-day').disabled = index === history.days.length - 1;
  renderSources();
}

function focus(id: string | null): void {
  focused = id; chart.setFocus(id); root.dataset.focus = id ?? 'all';
  for (const button of el('mix-list').querySelectorAll<HTMLButtonElement>('.mix-row')) {
    button.classList.toggle('selected', button.dataset.technology === id);
    button.setAttribute('aria-pressed', String(button.dataset.technology === id));
  }
  el('reset-focus').hidden = !id;
  lastIndex = -1; updateView();
}

function renderSources(): void {
  if (!history) {
    el('source-errors').textContent = refreshError ?? 'Esperando la respuesta pública.';
    el('source-response').removeAttribute('href');
    return;
  }
  const day = history.days[historyIndex(history.days.length, progress)];
  el('source-period').textContent = `Período solicitado: ${history.startDate} — ${history.endDate}. Mostramos ${history.days[0].date} — ${history.days[history.days.length - 1].date}. Día seleccionado: ${fullDate.format(midnight(day.date))}.`;
  el('source-times').textContent = `Producto: ${stamp.format(history.updated)}. Última descarga válida: ${stamp.format(history.received)}. Último intento: ${stamp.format(attempted)}.${refreshError ? ` Error al actualizar; últimos datos conservados: ${refreshError}` : ''}`;
  el<HTMLAnchorElement>('source-response').href = historyURL(history.startDate, history.endDate);
  el('source-errors').textContent = [
    history.unpublished.length ? `Fuera del tramo válido: ${history.unpublished.join(', ')}; no tienen generación validada.` : '',
    ...history.days.filter(day => day.error).map(day => `${day.date}: ${day.error}`),
  ].filter(Boolean).join(' ');
  const table = el('technology-table'); table.replaceChildren();
  for (const group of day.mix?.groups ?? []) {
    for (const component of group.technologies) {
      const row = document.createElement('div'); row.className = 'component-row';
      const title = document.createElement('span'); title.textContent = component.title;
      const value = document.createElement('strong'); value.textContent = `${componentNumber.format(component.value / 1000)} GWh`;
      row.append(title, value); table.append(row);
    }
  }
  if (!day.mix) table.textContent = 'Día sin datos válidos.';
  el('unreported-components').textContent = day.unreported.length ?
    `Sin valor individual publicado este día: ${day.unreported.join(', ')}. No se crean registros cero. Si falta una tecnología principal o la suma no cierra, el día no se muestra como válido.` : 'Todos los indicadores del período tienen valor publicado para este día.';
}

function updatePlayState(): void {
  el<HTMLButtonElement>('play-pause').disabled = !history || loading;
  el('play-pause').textContent = playing ? 'Ⅱ' : '▶';
  el('play-pause').setAttribute('aria-label', playing ? 'Pausar reproducción' : 'Reproducir el período');
  el('play-state').textContent = loading ? 'Consultando fuentes públicas…' : !history ? 'Generación no disponible' : playing ?
    `${history.days.length} días reales en 30 segundos` : !replay ? `${history.days.length} días reales en 30 segundos` :
    progress >= 1 ? 'Fin del período · volver a reproducir' : 'Exploración en pausa';
}

function pause(): void {
  playing = false; cancelAnimationFrame(frame); lastFrame = 0; updatePlayState();
}
function explore(value: number): void {
  if (!history || loading) return;
  pause(); replay = true; progress = Math.min(1, Math.max(0, value)); updateView(); updatePlayState();
}
function tick(time: number): void {
  if (!playing || !history) return;
  if (lastFrame) progress = Math.min(1, progress + (time - lastFrame) / 30_000);
  lastFrame = time;
  updateView();
  if (progress >= 1) { pause(); updateAge(); return; }
  frame = requestAnimationFrame(tick);
}
el('play-pause').addEventListener('click', () => {
  if (!history || loading) return;
  if (playing) { pause(); return; }
  if (!replay || progress >= 1) progress = 0;
  replay = true; playing = true; lastFrame = 0; updatePlayState(); updateView(); frame = requestAnimationFrame(tick);
});
el<HTMLInputElement>('timeline').addEventListener('input', () => {
  if (history) explore((Number(el<HTMLInputElement>('timeline').value) + 0.5) / history.days.length);
});
for (const [id, offset] of [['previous-day', -1], ['next-day', 1]] as const) {
  el(id).addEventListener('click', () => {
    if (history) explore((historyIndex(history.days.length, progress) + offset + 0.5) / history.days.length);
  });
}
el('restart').addEventListener('click', () => explore(0));
el('reset-focus').addEventListener('click', () => focus(null));
el('refresh').addEventListener('click', () => void load());
const dialog = el<HTMLDialogElement>('sources-dialog');
for (const id of ['sources-button', 'footer-sources']) el(id).addEventListener('click', () => { renderSources(); dialog.showModal(); });
el('close-sources').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) pause();
  if (!document.hidden) updateAge();
});
window.setInterval(updateAge, 60_000);
void load();
