import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HOUR, solarAltitude, type Mix } from './energy';

type Coordinate = [number, number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mainlandPolygon(raw: unknown): Coordinate[] {
  if (!isRecord(raw) || !isRecord(raw.geometry)) throw new Error('El mapa no tiene geometría.');
  const geometry = raw.geometry;
  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates) || !['Polygon', 'MultiPolygon'].includes(String(geometry.type))) throw new Error('Geometría de país no válida.');
  const polygons: unknown[] = geometry.type === 'Polygon' ? [coordinates] : coordinates;
  const rings = polygons.map(polygon => {
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) throw new Error('Polígono geográfico no válido.');
    return polygon[0].map((point: unknown): Coordinate => {
      if (!Array.isArray(point) || typeof point[0] !== 'number' || typeof point[1] !== 'number' ||
          !Number.isFinite(point[0]) || !Number.isFinite(point[1])) throw new Error('Coordenada geográfica no válida.');
      return [point[0], point[1]];
    });
  });
  const area = (ring: Coordinate[]) => Math.abs(ring.reduce((sum, [x, y], i) => {
    const next = ring[(i + 1) % ring.length];
    return sum + x * next[1] - next[0] * y;
  }, 0));
  const largest = rings.sort((a, b) => area(b) - area(a))[0];
  if (!largest || largest.length < 4) throw new Error('No hay un contorno peninsular válido.');
  return largest;
}

export function insidePolygon(x: number, y: number, ring: Coordinate[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function project([longitude, latitude]: Coordinate): Coordinate {
  return [(longitude + 3.2) * 0.205, (latitude - 39.85) * 0.265];
}

export class EnergyScene {
  readonly renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  private scene = new THREE.Scene();
  private controls: OrbitControls;
  private rings = new THREE.Group();
  private map = new THREE.Group();
  private mapMaterial: THREE.ShaderMaterial;
  private dotMaterial: THREE.ShaderMaterial;
  private light: THREE.DirectionalLight;
  private lastFrame = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private elapsed = 0;
  private colors = new Map<string, string>();
  private selected: string | null = null;
  private down = { x: 0, y: 0 };

  constructor(container: HTMLElement, onFrame: (seconds: number) => void, onSelect: (id: string) => void, onError: (message: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'España peninsular en 3D. Anillo del mix diario agregado, no ubicaciones de centrales. Arrastra suavemente para explorar.');
    container.append(this.renderer.domElement);
    this.camera.position.set(0.12, 3.5, 3.55);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.minDistance = 3.7;
    this.controls.maxDistance = 6.2;
    this.controls.minPolarAngle = 0.22;
    this.controls.maxPolarAngle = 0.94;
    this.controls.minAzimuthAngle = -0.35;
    this.controls.maxAzimuthAngle = 0.35;
    this.scene.add(new THREE.AmbientLight(0x91bfc7, 1.3));
    this.light = new THREE.DirectionalLight(0xffe1a1, 2);
    this.light.position.set(1.5, 3, -1);
    this.scene.add(this.light, this.rings, this.map);
    this.mapMaterial = new THREE.ShaderMaterial({
      uniforms: {
        energy: { value: 0.5 }, clean: { value: 0.5 }, daylight: { value: 0.7 },
        accent: { value: new THREE.Color('#91efd1') }, selected: { value: 0 }, clock: { value: 0 },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        void main() {
          vPosition = position;
          vNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float energy;
        uniform float clean;
        uniform float daylight;
        uniform float clock;
        uniform vec3 accent;
        uniform float selected;
        varying vec3 vPosition;
        varying vec3 vNormal;
        void main() {
          vec3 hue = mix(vec3(0.25, 0.53, 0.65), vec3(0.26, 0.9, 0.72), clean);
          hue = mix(hue, accent, selected * 0.6);
          float grid = pow(max(0.0, sin(vPosition.x * 58.0) * sin(vPosition.y * 58.0)), 18.0);
          float sweep = 0.5 + 0.5 * sin(vPosition.y * 2.0 - clock * 0.45);
          float face = smoothstep(0.4, 0.9, vNormal.z);
          vec3 base = mix(vec3(0.02, 0.075, 0.10), vec3(0.035, 0.13, 0.15), daylight);
          vec3 color = base + hue * (0.07 + energy * 0.12 + grid * 0.22 + sweep * 0.04) * face;
          color += vec3(0.10, 0.06, 0.018) * daylight * smoothstep(-1.0, 1.0, vPosition.x) * face;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.dotMaterial = new THREE.ShaderMaterial({
      uniforms: { clock: { value: 0 }, energy: { value: 0.5 }, color: { value: new THREE.Color('#91efd1') } },
      vertexShader: `
        uniform float clock;
        uniform float energy;
        attribute float phase;
        varying float opacity;
        void main() {
          opacity = 0.35 + 0.45 * sin(clock * 0.65 + phase);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (2.0 + energy * 2.0) * (4.0 / -p.z);
          gl_Position = projectionMatrix * p;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying float opacity;
        void main() {
          float distance = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(color, (1.0 - smoothstep(0.1, 0.5, distance)) * max(opacity, 0.08));
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.addFloor();
    void this.loadMaps().catch(error => { console.error('Mapa no disponible', error); onError(`No se puede cargar el mapa: ${String(error)}. Los datos siguen disponibles.`); });
    this.renderer.domElement.addEventListener('pointerdown', event => { this.down = { x: event.clientX, y: event.clientY }; });
    this.renderer.domElement.addEventListener('pointerup', event => {
      if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6) return;
      const box = this.renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, this.camera);
      const hit = raycaster.intersectObjects(this.rings.children, false)[0];
      if (hit) onSelect(String(hit.object.userData.id));
    });
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      onError('Se ha perdido el contexto 3D. Recarga para recuperarlo; los datos siguen disponibles.');
    });
    const resize = () => {
      const box = container.getBoundingClientRect();
      this.camera.aspect = box.width / Math.max(1, box.height);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(box.width, box.height);
    };
    new ResizeObserver(resize).observe(container);
    resize();
    document.addEventListener('visibilitychange', () => { this.lastFrame = 0; });
    const animate = (now: number) => {
      const delta = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
      this.lastFrame = now;
      if (!document.hidden) onFrame(delta);
      this.elapsed += this.reducedMotion ? 0 : Math.min(delta, 0.1);
      this.mapMaterial.uniforms.clock.value = this.elapsed;
      this.dotMaterial.uniforms.clock.value = this.elapsed;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private async loadMaps(): Promise<void> {
    const maps = await Promise.all(['/maps/spain.geo.json', '/maps/portugal.geo.json'].map(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
      return mainlandPolygon(await response.json());
    }));
    for (const [index, ring] of maps.entries()) {
      const projected = ring.map(project);
      const shape = new THREE.Shape(projected.map(([x, y]) => new THREE.Vector2(x, y)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: index === 0 ? 0.075 : 0.035, bevelEnabled: true, bevelThickness: 0.013, bevelSize: 0.008, bevelSegments: 2, steps: 1 });
      const mesh = new THREE.Mesh(geometry, index === 0 ? this.mapMaterial : new THREE.MeshStandardMaterial({ color: '#142b36', roughness: 0.8 }));
      mesh.rotation.x = -Math.PI / 2;
      this.map.add(mesh);
      const outline = new THREE.BufferGeometry().setFromPoints(projected.map(([x, y]) => new THREE.Vector3(x, index === 0 ? 0.085 : 0.04, -y)));
      this.map.add(new THREE.LineLoop(outline, new THREE.LineBasicMaterial({ color: index === 0 ? '#96e8d1' : '#325569', transparent: true, opacity: index === 0 ? 0.85 : 0.6 })));
      if (index === 0) {
        const dots: number[] = [], phases: number[] = [];
        for (let y = -1.2; y <= 1.3; y += 0.057) {
          for (let x = -1.4; x <= 1.4; x += 0.057) {
            if (!insidePolygon(x, y, projected)) continue;
            dots.push(x, 0.097, -y);
            phases.push((x * 15.1 + y * 8.3) % (Math.PI * 2));
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
        geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
        this.map.add(new THREE.Points(geometry, this.dotMaterial));
      }
    }
  }

  private addFloor(): void {
    const material = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5);
          float ring = pow(max(0.0, 1.0 - abs(d - 0.21) * 100.0), 3.0);
          float grid = step(0.985, fract(vUv.x * 70.0)) + step(0.985, fract(vUv.y * 70.0));
          float fade = 1.0 - smoothstep(0.20, 0.48, d);
          gl_FragColor=vec4(0.19,0.48,0.52,(grid * 0.085 + ring * 0.10 + 0.02) * fade);
        }
      `,
      transparent: true, depthWrite: false,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.06;
    this.scene.add(floor);
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = haloCanvas.height = 128;
    const context = haloCanvas.getContext('2d')!;
    const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, '#75eac92d'); gradient.addColorStop(0.6, '#75eac913'); gradient.addColorStop(1, '#75eac900');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(haloCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.035;
    this.scene.add(halo);
  }

  setMix(mix: Mix | null): void {
    for (const child of this.rings.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.rings.clear();
    this.colors.clear();
    if (!mix) return;
    let angle = 0.38;
    for (const group of mix.groups) {
      this.colors.set(group.id, group.color);
      if (group.share <= 0) continue;
      const geometry = new THREE.RingGeometry(1.60, 1.63, Math.max(8, Math.ceil(group.share * 256)), 1, angle, group.share * Math.PI * 2);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: group.color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.018;
      mesh.userData.id = group.id;
      this.rings.add(mesh);
      angle += group.share * Math.PI * 2;
    }
  }

  select(id: string | null): void {
    this.selected = id;
    this.mapMaterial.uniforms.selected.value = id ? 1 : 0;
    if (id && this.colors.has(id)) this.mapMaterial.uniforms.accent.value.set(this.colors.get(id)!);
    for (const child of this.rings.children) {
      const mesh = child as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      mesh.material.opacity = !id || mesh.userData.id === id ? 1 : 0.25;
    }
  }

  update(time: number, demandLevel: number | null, cleanShare: number | null): void {
    const daylight = THREE.MathUtils.smoothstep(solarAltitude(time), -0.12, 0.6);
    this.mapMaterial.uniforms.daylight.value = daylight;
    this.mapMaterial.uniforms.energy.value = demandLevel ?? 0;
    this.mapMaterial.uniforms.clean.value = cleanShare ?? 0;
    this.dotMaterial.uniforms.energy.value = demandLevel ?? 0;
    this.dotMaterial.uniforms.color.value.set(this.selected ? this.colors.get(this.selected)! : '#91efd1');
    this.light.intensity = 0.7 + daylight * 2;
    this.light.position.x = Math.sin(time / HOUR * Math.PI / 12) * 3;
  }

  reset(): void {
    this.camera.position.set(0.12, 3.5, 3.55);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
}
