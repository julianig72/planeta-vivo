import { historyIndex, midnight, type GenerationHistory } from './energy';

const NS = 'http://www.w3.org/2000/svg';
const shortDate = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: 'short' });

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

export class GenerationChart {
  private history: GenerationHistory | null = null;
  private progress = 1;
  private selected: string | null = null;
  private left = 44;
  private top = 24;
  private width = 1;
  private height = 1;
  private maximum = 1;
  private minimum = 0;
  private cursor: SVGLineElement | null = null;
  private band: SVGRectElement | null = null;
  private reveal: SVGRectElement | null = null;
  private dots: SVGCircleElement[] = [];

  constructor(private element: SVGSVGElement, private explore: (progress: number) => void) {
    new ResizeObserver(() => this.draw()).observe(element);
    element.addEventListener('pointermove', event => {
      if (!this.history || event.pointerType === 'touch') return;
      this.atPointer(event.clientX);
    });
    element.addEventListener('click', event => this.atPointer(event.clientX));
    element.addEventListener('keydown', event => {
      if (!this.history || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const count = this.history.days.length;
      const index = historyIndex(count, this.progress);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 :
        Math.min(count - 1, Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1)));
      this.explore((next + 0.5) / count);
    });
  }

  setHistory(history: GenerationHistory): void { this.history = history; this.draw(); }
  setFocus(id: string | null): void {
    this.selected = id;
    for (const path of this.element.querySelectorAll<SVGPathElement>('[data-technology]')) {
      const muted = Boolean(id && path.dataset.technology !== id);
      path.style.opacity = muted ? '.07' : path.dataset.layer === 'past' ? '.72' : '.27';
    }
    for (const dot of this.dots) dot.style.opacity = id && dot.dataset.technology !== id ? '.15' : '1';
  }

  private atPointer(clientX: number): void {
    if (!this.history) return;
    const x = clientX - this.element.getBoundingClientRect().left;
    if (x < this.left || x > this.left + this.width) return;
    const count = this.history.days.length;
    const index = historyIndex(count, (x - this.left) / this.width);
    this.explore((index + 0.5) / count);
  }

  private y(value: number): number { return this.top + this.height * (this.maximum - value) / (this.maximum - this.minimum); }

  private draw(): void {
    const history = this.history;
    const width = this.element.clientWidth, height = this.element.clientHeight;
    if (!history || width < 100 || height < 100) return;
    this.width = width - this.left - 16;
    this.height = height - this.top - 36;
    const positive = Math.max(...history.days.map(day => day.mix?.groups.reduce((sum, group) => sum + Math.max(0, group.value), 0) ?? 0));
    const negative = Math.min(...history.days.map(day => day.mix?.groups.reduce((sum, group) => sum + Math.min(0, group.value), 0) ?? 0));
    const quantum = Math.ceil(positive / 4 / 50_000) * 50_000;
    this.maximum = Math.ceil(positive / quantum) * quantum;
    this.minimum = Math.floor(negative / quantum) * quantum;
    this.element.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.element.replaceChildren();
    this.element.append(svg('title', {}, 'Evolución real de la generación eléctrica por tecnología'),
      svg('desc', {}, 'Áreas apiladas en GWh diarios. Cada escalón es un agregado diario publicado. Los huecos no se interpolan. Usa las flechas para explorar.'));
    const definitions = svg('defs');
    this.reveal = svg('rect', { x: this.left, y: 0, width: 0, height });
    const clip = svg('clipPath', { id: 'history-reveal' }); clip.append(this.reveal);
    const hatch = svg('pattern', { id: 'missing-day', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(40)' });
    hatch.append(svg('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#9bb3c2', 'stroke-opacity': '.25' }));
    definitions.append(clip, hatch); this.element.append(definitions);
    for (let value = this.minimum; value <= this.maximum; value += quantum) {
      const y = this.y(value);
      this.element.append(svg('line', { x1: this.left, x2: this.left + this.width, y1: y, y2: y, class: 'chart-grid' }),
        svg('text', { x: this.left - 12, y: y + 3, 'text-anchor': 'end', class: 'chart-label' }, String(value / 1000)));
    }
    const count = history.days.length;
    const step = this.width / count;
    const groups = history.days.find(day => day.mix)!.mix!.groups;
    for (const [groupIndex, group] of groups.entries()) {
      let run: number[] = [];
      const flush = () => {
        if (!run.length) return;
        const upper: [number, number][] = [], lower: [number, number][] = [];
        for (const index of run) {
          const mix = history.days[index].mix!;
          const amount = mix.groups[groupIndex].value;
          const bottom = mix.groups.slice(0, groupIndex).reduce((sum, group) =>
            sum + (amount >= 0 ? Math.max(0, group.value) : Math.min(0, group.value)), 0);
          const top = bottom + mix.groups[groupIndex].value;
          const x = this.left + index * step;
          upper.push([x, this.y(top)], [x + step, this.y(top)]);
          lower.push([x, this.y(bottom)], [x + step, this.y(bottom)]);
        }
        const points = [...upper, ...lower.reverse()];
        const d = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + ' Z';
        for (const layer of ['all', 'past']) {
          const path = svg('path', { d, fill: group.color, stroke: group.color, 'stroke-width': '.7', 'stroke-opacity': '.4' });
          path.dataset.technology = group.id; path.dataset.layer = layer;
          if (layer === 'past') path.setAttribute('clip-path', 'url(#history-reveal)');
          this.element.append(path);
        }
        run = [];
      };
      history.days.forEach((day, index) => { if (day.mix) run.push(index); else flush(); });
      flush();
    }
    history.days.forEach((day, index) => {
      if (!day.mix) this.element.append(svg('rect', {
        x: this.left + index * step, y: this.top, width: step, height: this.height, fill: 'url(#missing-day)', 'data-missing': day.date,
      }));
    });
    if (negative < 0) {
      let line = '';
      history.days.forEach((day, index) => {
        if (!day.mix) return;
        const x = this.left + index * step;
        const command = index === 0 || !history.days[index - 1].mix ? 'M' : 'L';
        line += `${command}${x} ${this.y(day.mix.total)} L${x + step} ${this.y(day.mix.total)} `;
      });
      this.element.append(svg('path', { d: line, fill: 'none', stroke: '#eef8f5', 'stroke-opacity': '.7', 'stroke-dasharray': '3 3', 'data-net-total': 'true' }));
      this.element.append(svg('line', { x1: this.left, x2: this.left + this.width, y1: this.y(0), y2: this.y(0), stroke: '#afc7ce', 'stroke-opacity': '.4' }));
    }
    const marks = new Set([0, count - 1]);
    for (let i = 1; i < 5; i++) marks.add(Math.round(i / 5 * (count - 1)));
    for (const index of [...marks].sort((a, b) => a - b)) {
      const x = this.left + (index + 0.5) * step;
      this.element.append(svg('text', { x, y: height - 6, 'text-anchor': 'middle', class: 'chart-label' }, shortDate.format(midnight(history.days[index].date))));
    }
    this.band = svg('rect', { y: this.top, height: this.height, width: step, fill: '#f3f9f8', 'fill-opacity': '.045', stroke: '#e1faf4', 'stroke-opacity': '.15' });
    this.cursor = svg('line', { y1: this.top - 6, y2: this.top + this.height + 7, stroke: '#e1faf4', 'stroke-opacity': '.8', 'stroke-width': 1 });
    this.element.append(this.band, this.cursor);
    this.dots = groups.map(group => {
      const dot = svg('circle', { r: 3.5, fill: group.color, stroke: '#061219', 'stroke-width': 1.5, class: 'chart-dot' });
      dot.dataset.technology = group.id; this.element.append(dot); return dot;
    });
    this.setFocus(this.selected);
    this.setCursor(this.progress);
  }

  setCursor(progress: number): void {
    this.progress = progress;
    if (!this.history || !this.cursor || !this.reveal || !this.band) return;
    const count = this.history.days.length, index = historyIndex(count, progress);
    const x = this.left + Math.min(1, Math.max(0, progress)) * this.width;
    this.cursor.setAttribute('x1', String(x)); this.cursor.setAttribute('x2', String(x));
    this.band.setAttribute('x', String(this.left + index / count * this.width));
    this.reveal.setAttribute('width', String(Math.max(0, x - this.left)));
    const mix = this.history.days[index].mix;
    let positive = 0, negative = 0;
    this.dots.forEach((dot, i) => {
      dot.style.display = mix ? '' : 'none';
      if (!mix) return;
      const value = mix.groups[i].value;
      if (value >= 0) positive += value; else negative += value;
      dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(this.y(value >= 0 ? positive : negative)));
    });
    this.element.dataset.date = this.history.days[index].date;
  }
}
