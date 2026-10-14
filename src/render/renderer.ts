import {
  WebGPURenderer, Scene, Mesh, PlaneGeometry, MeshBasicNodeMaterial, PerspectiveCamera, OrthographicCamera,
  Vector2, Vector3, Color, DoubleSide, Line, LineSegments, BufferGeometry, LineBasicMaterial, CircleGeometry, RingGeometry,
  RenderTarget, FloatType, NearestFilter, NoToneMapping,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Fn, If, Discard, positionLocal, uv, vec2, vec3, vec4, float, uniform, mix, smoothstep } from 'three/tsl';
import type { SceneState, CameraState } from '../state';
import { CAMERA_2D, CAMERA_3D, EXTENT, MASK_RADIUS } from '../state';
import { createFieldShader } from './shader';
import { sampleField } from '../physics/model';
import { LongitudinalParticles } from './longitudinal';

const QUALITY = { low: 128, medium: 256, high: 512 };
export const WAVE_COLORS = ['#78ded3', '#ffb079', '#ba9aff', '#ffd36e', '#79b7ff', '#ee87ad', '#a3db84', '#d6dce4'];
export interface ValidationReport { backend: string; samples: number; maxAbsoluteError: number; maxRelativeError: number; passed: boolean;
  cases: { index: number; error: number; maskErrors: number; worst?: { x: number; y: number; channel: number; expected: number; actual: number } }[] }

export class WaveRenderer {
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly perspective = new PerspectiveCamera(42, 1, 0.05, 250);
  readonly orthographic = new OrthographicCamera(-6, 6, 6, -6, 0.05, 250);
  readonly shader = createFieldShader();
  private readonly particles = new LongitudinalParticles();
  private controls!: OrbitControls;
  private surface!: Mesh<PlaneGeometry, MeshBasicNodeMaterial>;
  private readonly mode = uniform(0);
  private markers: Mesh[] = [];
  private sectionLine: Line;
  private particleGrid: LineSegments;
  private lastState!: SceneState;
  private lastQuality = '';
  private lastMode = '';
  private restoring = false;
  private observer: ResizeObserver;
  private labelLayer: HTMLElement;
  private labels: { element: HTMLElement; position: Vector3 }[] = [];
  private validationRunning = false;

  constructor(private host: HTMLElement, private onCameraChange: (camera: CameraState) => void, forceWebGL: boolean) {
    this.renderer = new WebGPURenderer({ antialias: true, forceWebGL });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(new Color('#10161e'), 1);
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.domElement.setAttribute('aria-label', 'Поле хвиль. У 3D: перетягніть для обертання; права кнопка для зміщення; колесо для масштабу.');
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
    host.append(this.renderer.domElement);
    this.perspective.up.set(0, 0, 1);
    this.labelLayer = document.createElement('div'); this.labelLayer.className = 'axis-labels'; host.append(this.labelLayer);
    for (const [text, x, y] of [['x, м', 5.35, 0], ['y, м', 0, 5.35], ['−5', -5, -5.25], ['0', 0, -5.25], ['5', 5, -5.25]] as const) {
      const element = document.createElement('span'); element.textContent = text; this.labelLayer.append(element);
      this.labels.push({ element, position: new Vector3(x, y, 0) });
    }
    this.sectionLine = new Line(new BufferGeometry().setFromPoints([new Vector3(-5, 0, 0.01), new Vector3(5, 0, 0.01)]),
      new LineBasicMaterial({ color: '#a7eee5', transparent: true, opacity: 0.7, depthTest: false }));
    this.scene.add(this.particles.group);
    const gridPoints: Vector3[] = [];
    for (let i = -5; i <= 5; i++) gridPoints.push(new Vector3(i, -5, 0), new Vector3(i, 5, 0),
      new Vector3(-5, i, 0), new Vector3(5, i, 0));
    this.particleGrid = new LineSegments(new BufferGeometry().setFromPoints(gridPoints),
      new LineBasicMaterial({ color: '#8ea3b5', transparent: true, opacity: 0.15 }));
    this.scene.add(this.particleGrid);
    this.sectionLine.renderOrder = 4; this.scene.add(this.sectionLine);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
  }

  get camera() { return this.lastState?.mode === '3d' ? this.perspective : this.orthographic; }
  get backend(): string { return 'isWebGPUBackend' in this.renderer.backend ? 'WebGPU' : 'WebGL 2'; }
  get segments(): number { return QUALITY[this.lastState.display.quality]; }
  async init(state: SceneState): Promise<void> {
    await this.renderer.init();
    this.lastState = state; this.buildSurface(); this.setState(state, true); this.resize();
    this.renderer.render(this.scene, this.camera);
  }
  private buildSurface(): void {
    const shader = this.shader;
    const material = new MeshBasicNodeMaterial({ side: DoubleSide });
    material.positionNode = Fn(() => {
      const height = float(0).toVar();
      If(this.mode.greaterThan(0), () => {
        const value = shader.field(positionLocal.xy);
        If(shader.quantity.equal(0), () => { height.assign(value.x); }).ElseIf(shader.quantity.equal(1), () => {
          height.assign(value.y.sqrt());
        }).Else(() => { height.assign(value.z.sqrt()); });
        height.mulAssign(shader.heightScale);
      });
      return vec3(positionLocal.xy, height);
    })();
    material.colorNode = Fn(() => {
      const xy = uv().sub(0.5).mul(EXTENT * 2);
      const sample = shader.field(xy);
      If(sample.w.greaterThan(0), () => { Discard(); });
      const normalized = float(0).toVar();
      const rgb = vec3(0).toVar();
      If(shader.quantity.equal(0), () => {
        normalized.assign(sample.x.div(shader.colorScale).clamp(-1, 1));
        rgb.assign(mix(vec3(0.037, 0.063, 0.095), vec3(0.11, 0.43, 0.91), normalized.negate().max(0)));
        rgb.assign(mix(rgb, vec3(1, 0.47, 0.20), normalized.max(0)));
        const zero = float(1).sub(smoothstep(0, 0.018, normalized.abs())).mul(0.28);
        rgb.assign(mix(rgb, vec3(0.67, 0.77, 0.82), zero));
      }).Else(() => {
        If(shader.quantity.equal(1), () => { normalized.assign(sample.y); }).Else(() => { normalized.assign(sample.z); });
        normalized.assign(normalized.div(shader.colorScale.mul(shader.colorScale)).sqrt().clamp(0, 1));
        rgb.assign(mix(vec3(0.024, 0.05, 0.07), vec3(0.15, 0.8, 0.66), normalized));
      });
      If(shader.grid.greaterThan(0), () => {
        const distance = xy.add(0.5).fract().sub(0.5).abs();
        const line = float(1).sub(smoothstep(0.004, 0.012, distance.x.min(distance.y))).mul(0.10);
        const axis = float(1).sub(smoothstep(0.008, 0.02, xy.x.abs().min(xy.y.abs()))).mul(0.30);
        rgb.assign(mix(rgb, vec3(0.8), line.max(axis)));
      });
      return rgb;
    })();
    this.surface = new Mesh(new PlaneGeometry(EXTENT * 2, EXTENT * 2, QUALITY.medium, QUALITY.medium), material);
    this.surface.frustumCulled = false; this.scene.add(this.surface);
    // Equilibrium plane: visible through troughs in 3D; it marks physical z = 0.
    const zeroPlane = new Mesh(new PlaneGeometry(10, 10), new MeshBasicNodeMaterial({ color: '#8ea3b5',
      wireframe: true, transparent: true, opacity: 0.15, depthWrite: false, side: DoubleSide }));
    zeroPlane.name = 'zero-plane'; this.scene.add(zeroPlane);
  }
  setState(state: SceneState, restoreCamera = false): void {
    const switched = this.lastMode !== state.mode || !this.controls;
    this.lastState = state;
    this.lastMode = state.mode;
    this.mode.value = state.mode === '3d' ? 1 : 0;
    this.surface.visible = state.polarization === 'transverse';
    this.particles.setState(state);
    if (switched || restoreCamera) {
      this.controls?.dispose();
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableRotate = state.mode === '3d';
      this.controls.enableDamping = false;
      this.controls.minDistance = 0.1; this.controls.maxDistance = 150;
      this.controls.minZoom = 0.25; this.controls.maxZoom = 8;
      this.controls.screenSpacePanning = true;
      this.controls.addEventListener('change', () => {
        if (this.restoring) return;
        const oldTarget = this.controls.target.clone();
        this.controls.target.clampScalar(-100, 100);
        this.camera.position.add(this.controls.target.clone().sub(oldTarget));
        this.onCameraChange({ position: this.camera.position.toArray() as [number, number, number],
          target: this.controls.target.toArray() as [number, number, number], zoom: this.camera.zoom });
      });
      this.restoreCamera(state.mode === '3d' ? state.camera : state.camera2d);
    }
    const geometryKey = `${state.mode}-${state.display.quality}`;
    if (geometryKey !== this.lastQuality) {
      this.surface.geometry.dispose();
      const segments = state.mode === '2d' ? 1 : QUALITY[state.display.quality];
      this.surface.geometry = new PlaneGeometry(10, 10, segments, segments);
      this.lastQuality = geometryKey;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, state.display.quality === 'low' ? 1 : 2));
    }
    this.scene.getObjectByName('zero-plane')!.visible = state.mode === '3d' && state.polarization === 'transverse' && state.display.grid;
    this.particleGrid.visible = state.polarization === 'longitudinal' && state.display.grid;
    this.sectionLine.visible = state.display.section;
    this.sectionLine.position.y = state.display.sectionY;
    this.updateMarkers(); this.resize();
  }
  private restoreCamera(state: CameraState): void {
    this.restoring = true;
    this.camera.position.fromArray(state.position); this.camera.zoom = state.zoom;
    this.controls.target.fromArray(state.target); this.camera.updateProjectionMatrix(); this.controls.update();
    this.restoring = false;
  }
  resetCamera(): void { this.restoreCamera(this.lastState.mode === '3d' ? CAMERA_3D : CAMERA_2D);
    this.onCameraChange({ position: this.camera.position.toArray() as [number, number, number],
      target: this.controls.target.toArray() as [number, number, number], zoom: this.camera.zoom }); }
  cameraState(): CameraState { return { position: this.camera.position.toArray() as [number, number, number],
    target: this.controls.target.toArray() as [number, number, number], zoom: this.camera.zoom }; }
  private updateMarkers(): void {
    for (const marker of this.markers) { this.scene.remove(marker); marker.geometry.dispose();
      (marker.material as MeshBasicNodeMaterial).dispose(); }
    this.markers = [];
    this.lastState.waves.forEach((wave, i) => {
      if (wave.type !== 'circular' || !wave.enabled || wave.amplitude === 0) return;
      for (const [geometry, color] of [[new CircleGeometry(MASK_RADIUS, 32), '#10161e'],
        [new RingGeometry(MASK_RADIUS, MASK_RADIUS + 0.024, 32), WAVE_COLORS[i]]] as const) {
        const marker = new Mesh(geometry, new MeshBasicNodeMaterial({ color, depthTest: false, side: DoubleSide }));
        marker.position.set(wave.x, wave.y, 0.015); marker.renderOrder = 5; this.scene.add(marker); this.markers.push(marker);
      }
    });
  }
  resize(): void {
    if (!this.host.clientWidth || !this.host.clientHeight) return;
    const width = this.host.clientWidth, height = this.host.clientHeight, aspect = width / height;
    this.renderer.setSize(width, height);
    this.perspective.aspect = aspect; this.perspective.updateProjectionMatrix();
    const halfY = aspect >= 1 ? 5.85 : 5.85 / aspect, halfX = halfY * aspect;
    this.orthographic.left = -halfX; this.orthographic.right = halfX;
    this.orthographic.top = halfY; this.orthographic.bottom = -halfY; this.orthographic.updateProjectionMatrix();
  }
  render(time: number): void {
    if (this.validationRunning) return;
    if (this.lastState.polarization === 'longitudinal') this.particles.render(this.lastState, time);
    else this.shader.update(this.lastState, time);
    this.controls.update(); this.renderer.render(this.scene, this.camera);
    const size = this.renderer.getSize(new Vector2());
    for (const { element, position } of this.labels) {
      const projected = position.clone().project(this.camera);
      element.hidden = projected.z < -1 || projected.z > 1;
      element.style.transform = `translate(${(projected.x + 1) * size.x / 2}px, ${(1 - projected.y) * size.y / 2}px) translate(-50%, -50%)`;
    }
  }

  async validate(states: SceneState[]): Promise<ValidationReport> {
    if (this.validationRunning) throw new Error('Перевірка вже триває.');
    this.validationRunning = true;
    const width = 37, height = 31;
    const target = new RenderTarget(width, height, { type: FloatType, minFilter: NearestFilter,
      magFilter: NearestFilter, depthBuffer: false });
    const testScene = new Scene();
    const material = new MeshBasicNodeMaterial();
    const field = this.shader.diagnosticField;
    material.outputNode = Fn(() => field(uv().sub(0.5).mul(10)))();
    const mesh = new Mesh(new PlaneGeometry(2, 2), material); testScene.add(mesh);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
    let maxAbsoluteError = 0, maxRelativeError = 0, samples = 0, passed = true;
    const cases: ValidationReport['cases'] = [];
    try {
      for (const state of states) {
        const detail: ValidationReport['cases'][number] = { index: cases.length, error: 0, maskErrors: 0 };
        cases.push(detail);
        this.shader.update(state, state.playback.time);
        this.renderer.setRenderTarget(target); this.renderer.render(testScene, camera);
        const pixels = await this.renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        // Three's WebGPU readback retains the 256-byte row padding; WebGL readback is tightly packed.
        const rowStride = this.backend === 'WebGPU' ? Math.ceil(width * 16 / 256) * 64 : width * 4;
        // Readback orientation is bottom-to-top in WebGL and top-to-bottom in WebGPU.
        for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
          const x = ((col + 0.5) / width - 0.5) * 10;
          const y = ((this.backend === 'WebGPU' ? height - row - 0.5 : row + 0.5) / height - 0.5) * 10;
          const expected = sampleField(state, x, y), offset = row * rowStride + col * 4;
          const masked = pixels[offset + 3] > 0.5;
          if ((expected === null) !== masked) { passed = false; detail.maskErrors++; continue; }
          if (!expected) continue;
          const scale = Math.max(1e-6, state.waves.reduce((sum, w) => sum + (w.enabled ? w.amplitude : 0), 0));
          for (const [channel, reference] of [expected.displacement, expected.meanSquare, expected.windowMean].entries()) {
            const actual = pixels[offset + channel];
            const normalizedError = Math.abs(actual - reference) / (channel === 0 ? scale : scale ** 2);
            if (normalizedError > detail.error) { detail.error = normalizedError; detail.worst = { x, y, channel, expected: reference, actual }; }
            maxAbsoluteError = Math.max(maxAbsoluteError, normalizedError);
            if (Math.abs(reference) > (channel === 0 ? scale : scale ** 2) * 0.01)
              maxRelativeError = Math.max(maxRelativeError, Math.abs(actual - reference) / Math.abs(reference));
            if (!Number.isFinite(actual) || normalizedError > 0.0005 + 0.0005 * Math.abs(reference) / (channel === 0 ? scale : scale ** 2)) passed = false;
          }
          samples++;
        }
      }
      return { backend: this.backend, samples, maxAbsoluteError, maxRelativeError, passed, cases };
    } finally {
      this.renderer.setRenderTarget(null); this.validationRunning = false;
      mesh.geometry.dispose(); material.dispose(); target.dispose();
    }
  }
  dispose(): void {
    this.observer.disconnect(); this.controls?.dispose();
    this.scene.traverse(object => { if (object instanceof Mesh || object instanceof Line || object instanceof LineSegments) {
      object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(m => m.dispose()); } });
    this.renderer.dispose(); this.labelLayer.remove(); this.renderer.domElement.remove();
  }
}
