import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { solarDirection, type AuroraFeed, type Earthquake } from './data';

const vertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export function locationVector(latitude: number, longitude: number, radius = 1): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).multiplyScalar(radius);
}

export class Globe {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  readonly scene = new THREE.Scene();
  readonly controls: OrbitControls;
  private readonly markers = new THREE.Group();
  private readonly pulses = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly earthMaterial: THREE.ShaderMaterial;
  private readonly auroraMaterial: THREE.ShaderMaterial;
  private readonly auroraMesh: THREE.Mesh;
  private readonly points = new Map<string, THREE.Mesh>();
  private targetDirection: THREE.Vector3 | null = null;
  private lastFrame = 0;
  private frame = 0;
  private dragged = false;
  private down = { x: 0, y: 0 };
  private selectedId: string | null = null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private pulseGeometry = new THREE.RingGeometry(0.014, 0.019, 48);
  private markerGeometry = new THREE.SphereGeometry(1, 12, 8);
  private haloMaterial: THREE.SpriteMaterial;
  private auroraTexture: THREE.DataTexture | null = null;
  private onFrame: (delta: number) => void;
  private onSelect: (id: string) => void;
  private onError: (message: string) => void;

  constructor(container: HTMLElement, onSelect: (id: string) => void, onFrame: (delta: number) => void, onError: (message: string) => void) {
    this.onFrame = onFrame;
    this.onSelect = onSelect;
    this.onError = onError;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-label', 'Tierra 3D interactiva. Arrastra para girar y selecciona los puntos de terremotos; los eventos también están en la lista.');
    this.renderer.domElement.setAttribute('role', 'img');
    container.append(this.renderer.domElement);
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = haloCanvas.height = 64;
    const context = haloCanvas.getContext('2d')!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.haloMaterial = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(haloCanvas), color: 0xffb684, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.camera.position.copy(locationVector(22, -25, 3.45));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.9;
    this.controls.maxDistance = 4.8;
    this.controls.autoRotate = !this.reducedMotion;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener('start', () => { this.targetDirection = null; this.controls.autoRotate = false; });
    this.earthMaterial = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: `
        uniform sampler2D dayMap;
        uniform sampler2D nightMap;
        uniform vec3 sun;
        uniform float hasDay;
        uniform float hasNight;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          float light = dot(normalize(vNormal), sun);
          vec3 day = mix(vec3(0.025, 0.12, 0.19), texture2D(dayMap, vUv).rgb, hasDay);
          vec3 night = texture2D(nightMap, vUv).rgb * hasNight;
          float daylight = smoothstep(-0.14, 0.22, light);
          vec3 color = day * (0.095 + 0.95 * max(light, 0.0));
          color += night * (1.0 - daylight) * vec3(1.1, 0.86, 0.62);
          color += vec3(0.015, 0.028, 0.055) * (1.0 - daylight);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        dayMap: { value: null }, nightMap: { value: null },
        sun: { value: new THREE.Vector3(...solarDirection(Date.now())) },
        hasDay: { value: 0 }, hasNight: { value: 0 },
      },
    });
    const geometry = new THREE.SphereGeometry(1, 96, 64);
    this.scene.add(new THREE.Mesh(geometry, this.earthMaterial));
    const atmosphere = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-p.xyz);
          gl_Position = projectionMatrix * p;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 4.0);
          gl_FragColor = vec4(0.18, 0.57, 1.0, rim * 0.35);
        }
      `,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    atmosphere.scale.setScalar(1.045);
    this.scene.add(atmosphere);
    this.auroraMaterial = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: `
        uniform sampler2D probability;
        varying vec2 vUv;
        void main() {
          float p = texture2D(probability, vUv).r;
          float intensity = smoothstep(0.03, 0.8, p);
          vec3 color = mix(vec3(0.15, 1.0, 0.58), vec3(0.62, 0.38, 1.0), smoothstep(0.65, 1.0, p));
          gl_FragColor = vec4(color, intensity * 0.8);
        }
      `,
      uniforms: { probability: { value: null } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.auroraMesh = new THREE.Mesh(geometry, this.auroraMaterial);
    this.auroraMesh.scale.setScalar(1.013);
    this.auroraMesh.visible = false;
    this.scene.add(this.auroraMesh, this.markers, this.pulses);
    this.addStars();
    this.loadTexture('/textures/earth-day.jpg', 'dayMap', 'hasDay', 'La imagen diurna de la Tierra no se ha podido cargar.');
    this.loadTexture('/textures/earth-night.png', 'nightMap', 'hasNight', 'La imagen nocturna de la Tierra no se ha podido cargar.');
    this.renderer.domElement.addEventListener('pointerdown', event => {
      this.down = { x: event.clientX, y: event.clientY };
      this.dragged = false;
    });
    this.renderer.domElement.addEventListener('pointermove', event => {
      if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6) this.dragged = true;
    });
    this.renderer.domElement.addEventListener('pointerup', event => {
      if (!this.dragged) this.pick(event);
    });
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.onError('Se ha perdido el contexto 3D. Recarga la página para recuperar el globo; los datos siguen disponibles.');
    });
    document.addEventListener('visibilitychange', () => { this.lastFrame = 0; });
    const observer = new ResizeObserver(() => this.resize(container));
    observer.observe(container);
    this.resize(container);
    this.frame = requestAnimationFrame(this.animate);
  }

  private loadTexture(path: string, uniform: string, ready: string, error: string): void {
    new THREE.TextureLoader().load(path, texture => {
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.earthMaterial.uniforms[uniform].value = texture;
      this.earthMaterial.uniforms[ready].value = 1;
    }, undefined, () => this.onError(error));
  }

  private addStars(): void {
    const positions: number[] = [];
    let seed = 29;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 1000; i++) {
      const z = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      positions.push(r * Math.cos(theta) * 30, z * 30, r * Math.sin(theta) * 30);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0x9bb4cc, size: 0.018, transparent: true, opacity: 0.5, sizeAttenuation: true,
    })));
  }

  private resize(container: HTMLElement): void {
    const { width, height } = container.getBoundingClientRect();
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setEvents(events: Earthquake[]): void {
    for (const mesh of this.points.values()) (mesh.material as THREE.Material).dispose();
    this.markers.clear();
    this.points.clear();
    for (const event of events) {
      const magnitude = event.magnitude ?? 0;
      const color = magnitude >= 5 ? 0xffcaa0 : magnitude >= 3 ? 0xffac79 : 0xecc79e;
      const mesh = new THREE.Mesh(this.markerGeometry, new THREE.MeshBasicMaterial({ color }));
      mesh.position.copy(locationVector(event.latitude, event.longitude, 1.018));
      mesh.scale.setScalar(0.005 + Math.max(0, magnitude) * 0.0017);
      mesh.userData.id = event.id;
      mesh.userData.color = color;
      const halo = new THREE.Sprite(this.haloMaterial);
      halo.scale.setScalar(5);
      mesh.add(halo);
      this.markers.add(mesh);
      this.points.set(event.id, mesh);
    }
  }

  setVisibleEvents(ids: Set<string>, enabled: boolean): void {
    this.markers.visible = enabled;
    this.pulses.visible = enabled;
    for (const [id, mesh] of this.points) mesh.visible = ids.has(id);
  }

  setAurora(feed: AuroraFeed): void {
    const pixels = new Uint8Array(360 * 181 * 4);
    for (const [longitude, latitude, probability] of feed.cells) {
      const x = (Math.round(longitude) + 180) % 360;
      const y = Math.round(latitude) + 90;
      const index = (y * 360 + x) * 4;
      pixels[index] = Math.round(probability / 100 * 255);
      pixels[index + 3] = 255;
    }
    this.auroraTexture?.dispose();
    this.auroraTexture = new THREE.DataTexture(pixels, 360, 181, THREE.RGBAFormat);
    this.auroraTexture.magFilter = THREE.LinearFilter;
    this.auroraTexture.minFilter = THREE.LinearFilter;
    this.auroraTexture.wrapS = THREE.RepeatWrapping;
    this.auroraTexture.needsUpdate = true;
    this.auroraMaterial.uniforms.probability.value = this.auroraTexture;
  }

  showAurora(enabled: boolean): void {
    this.auroraMesh.visible = enabled && this.auroraTexture !== null;
  }

  setSun(time: number): void {
    this.earthMaterial.uniforms.sun.value.set(...solarDirection(time));
  }

  focus(event: Earthquake): void {
    this.selectedId = event.id;
    this.targetDirection = locationVector(event.latitude, event.longitude);
    this.controls.autoRotate = false;
    this.pulse(event);
  }

  resetView(): void {
    this.selectedId = null;
    this.targetDirection = locationVector(22, -25);
    this.controls.autoRotate = !this.reducedMotion;
  }

  focusPole(): void {
    this.targetDirection = locationVector(66, -30);
    this.controls.autoRotate = false;
  }

  pulse(event: Earthquake): void {
    if (this.reducedMotion) return;
    const material = new THREE.MeshBasicMaterial({
      color: 0xffb97d, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.pulseGeometry, material);
    mesh.position.copy(locationVector(event.latitude, event.longitude, 1.023));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), mesh.position.clone().normalize());
    mesh.userData.age = 0;
    this.pulses.add(mesh);
    if (this.pulses.children.length > 80) {
      const oldest = this.pulses.children[0] as THREE.Mesh;
      (oldest.material as THREE.Material).dispose();
      this.pulses.remove(oldest);
    }
  }

  clearPulses(): void {
    for (const child of this.pulses.children) ((child as THREE.Mesh).material as THREE.Material).dispose();
    this.pulses.clear();
  }

  private pick(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.markers.children, false).find(result => {
      const mesh = result.object;
      return this.markers.visible && mesh.visible && mesh.position.dot(this.camera.position.clone().sub(mesh.position)) > 0;
    });
    if (hit) this.onSelect(String(hit.object.userData.id));
  }

  private animate = (time: number): void => {
    const elapsed = this.lastFrame ? (time - this.lastFrame) / 1000 : 0;
    const delta = Math.min(elapsed, 0.1);
    this.lastFrame = time;
    this.onFrame(document.hidden ? 0 : elapsed);
    if (this.targetDirection) {
      const distance = this.camera.position.length();
      const desired = this.targetDirection.clone().multiplyScalar(distance);
      const current = this.camera.position.clone().normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(current, this.targetDirection);
      const step = new THREE.Quaternion().slerp(rotation, this.reducedMotion ? 1 : 1 - Math.exp(-delta * 3));
      this.camera.position.copy(current.applyQuaternion(step).multiplyScalar(distance));
      if (this.camera.position.distanceTo(desired) < 0.002) this.targetDirection = null;
    }
    this.controls.update(delta);
    for (const child of [...this.pulses.children]) {
      const mesh = child as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      mesh.userData.age += delta;
      const age = Number(mesh.userData.age);
      mesh.scale.setScalar(1 + age * 2.4);
      mesh.material.opacity = Math.max(0, 0.8 * (1 - age / 2.5));
      if (age >= 2.5) {
        mesh.material.dispose();
        this.pulses.remove(mesh);
      }
    }
    for (const [id, mesh] of this.points) {
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(id === this.selectedId ? 0xfff4dc : Number(mesh.userData.color ?? 0xffb684));
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  };

  stop(): void {
    cancelAnimationFrame(this.frame);
  }
}
