import {
  InstancedMesh, SphereGeometry, MeshBasicNodeMaterial, Matrix4, Color, Group, Mesh,
  BufferGeometry, Float32BufferAttribute, Line, LineSegments, LineBasicMaterial, Vector3,
  DoubleSide,
} from 'three/webgpu';
import type { SceneState } from '../state';
import { longitudinalContribution, prepareLongitudinal } from '../physics/longitudinal';
import type { VectorAmplitude } from '../physics/longitudinal';
import { TAU } from '../physics/model';

type Point = { x: number; y: number; values: VectorAmplitude[] | null };
type Phases = number[][];
function phasesAt(scene: SceneState, time: number): Phases {
  return scene.waves.map(w => { const a = -TAU * ((time * w.frequency) % 1); return [Math.cos(a), Math.sin(a)]; });
}
function displacement(values: VectorAmplitude[], phases: Phases): [number, number] {
  let x = 0, y = 0;
  values.forEach((v, i) => { x += v[0][0] * phases[i][0] - v[0][1] * phases[i][1];
    y += v[1][0] * phases[i][0] - v[1][1] * phases[i][1]; });
  return [x, y];
}
function arrowGeometry(): BufferGeometry {
  // An arrow begins at its equilibrium anchor and points along local +x.
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0,-0.018,0, 0.72,-0.018,0, 0.72,0.018,0,
    0,-0.018,0, 0.72,0.018,0, 0,0.018,0,
    0.68,-0.07,0, 1,0,0, 0.68,0.07,0,
  ], 3));
  return geometry;
}

/** Cache spatial phasors; animation rotates phases rather than reevaluating Bessel functions. */
export class LongitudinalParticles {
  readonly group = new Group();
  readonly mesh = new InstancedMesh(new SphereGeometry(0.032, 8, 6), new MeshBasicNodeMaterial({ transparent: true }), 41 * 41);
  readonly arrows = new InstancedMesh(arrowGeometry(), new MeshBasicNodeMaterial({ side: DoubleSide }), 41 * 41);
  readonly spring = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: '#ffffff', vertexColors: true }));
  readonly trail = new Line(new BufferGeometry(), new LineBasicMaterial({ color: '#ffd36e', transparent: true, opacity: 1, depthTest: false }));
  readonly trails = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, opacity: 0.8, depthTest: false }));
  readonly tracked = new Mesh(new SphereGeometry(0.085, 12, 8), new MeshBasicNodeMaterial({ color: '#ffd36e' }));
  readonly anchor = new Mesh(new SphereGeometry(0.045, 8, 6), new MeshBasicNodeMaterial({ color: '#b4c8d5', transparent: true, opacity: 0.5 }));
  private key = '';
  private points: Point[] = [];
  private side = 0;
  private tracerValues: VectorAmplitude[] | null = null;
  private matrix = new Matrix4();
  private color = new Color();
  private blue = new Color('#5ea6f5');
  private orange = new Color('#ffb079');
  constructor() {
    this.mesh.frustumCulled = this.arrows.frustumCulled = this.spring.frustumCulled = this.trail.frustumCulled = this.trails.frustumCulled = false;
    this.spring.geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(41 * 40 * 2 * 12 * 2 * 3), 3));
    this.spring.geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(41 * 40 * 2 * 12 * 2 * 3), 3));
    this.trails.geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(41 * 41 * 24 * 2 * 3), 3));
    this.trails.geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(41 * 41 * 24 * 2 * 3), 3));
    this.trails.renderOrder = 6; this.trail.renderOrder = 8;
    this.mesh.renderOrder = this.arrows.renderOrder = 2;
    this.tracked.position.z = this.anchor.position.z = 0.04;
    this.group.add(this.mesh, this.arrows, this.spring, this.trails, this.trail, this.tracked, this.anchor);
  }
  setState(scene: SceneState): void {
    const view = scene.display.longitudinalView;
    this.group.visible = scene.polarization === 'longitudinal';
    this.mesh.visible = ['particles', 'spring', 'tracer'].includes(view);
    this.mesh.material.opacity = view === 'tracer' ? 0.6 : 1;
    this.arrows.visible = view === 'arrows'; this.spring.visible = view === 'spring';
    this.trails.visible = view === 'tracer';
    this.trail.visible = this.tracked.visible = this.anchor.visible = view === 'tracer';
    if (!this.group.visible) return;
    const prepared = prepareLongitudinal(scene, 0);
    const samplePoint = (x: number, y: number): Point => {
      const values = prepared.map(p => longitudinalContribution(p, x, y));
      return { x, y, values: values.some(v => v === null) ? null : values as VectorAmplitude[] };
    };
    const key = JSON.stringify([scene.speed, scene.waves, scene.display.quality, view === 'spring', scene.display.sectionY]);
    if (key !== this.key) {
      this.key = key; this.points = [];
      this.side = (view === 'spring' ? { low: 13, medium: 17, high: 21 } : { low: 19, medium: 29, high: 41 })[scene.display.quality];
      for (let row = 0; row < this.side; row++) for (let col = 0; col < this.side; col++)
        this.points.push(samplePoint(-5 + col * 10 / (this.side - 1), -5 + row * 10 / (this.side - 1)));
      this.mesh.count = this.arrows.count = this.points.filter(p => p.values !== null).length;
    }
    this.tracerValues = samplePoint(scene.display.tracerX, scene.display.tracerY).values;
  }

  render(scene: SceneState, time: number): void {
    if (!this.group.visible) return;
    const phases = phasesAt(scene, time), gain = scene.display.heightScale;
    let index = 0;
    const centers: (Vector3 | null)[] = [];
    const pointColors: (Color | null)[] = [];
    if (this.mesh.visible || this.arrows.visible) this.points.forEach(point => {
      if (!point.values) { centers.push(null); pointColors.push(null); return; }
      const [dx, dy] = displacement(point.values, phases);
      const px = point.x + gain * dx, py = point.y + gain * dy;
      centers.push(new Vector3(px, py, 0));
      if (this.mesh.visible) {
        this.matrix.makeTranslation(px, py, 0); this.mesh.setMatrixAt(index, this.matrix);
      }
      if (this.arrows.visible) {
        const length = gain * Math.hypot(dx, dy), angle = Math.atan2(dy, dx), c = Math.cos(angle), s = Math.sin(angle);
        const width = Math.min(1, length / 0.2);
        this.matrix.set(c*length, -s*width, 0, point.x, s*length, c*width, 0, point.y, 0,0,1,0.02, 0,0,0,1);
        this.arrows.setMatrixAt(index, this.matrix);
      }
      const value = Math.max(-1, Math.min(1, dx / scene.display.colorScale));
      this.color.set('#bdcbd2').lerp(value < 0 ? this.blue : this.orange, Math.abs(value));
      pointColors.push(this.color.clone());
      (this.arrows.visible ? this.arrows : this.mesh).setColorAt(index++, this.color);
    });
    for (const mesh of [this.mesh, this.arrows]) if (mesh.visible) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (this.spring.visible) {
      const vertices: Vector3[] = [];
      const colors = this.spring.geometry.getAttribute('color');
      const interpolated = new Color();
      const colorAt = (a: Color, b: Color, f: number, index: number) => {
        interpolated.copy(a).lerp(b, f); colors.setXYZ(index, interpolated.r, interpolated.g, interpolated.b);
      };
      const connect = (i: number, neighbor: number) => {
        const a = centers[i], b = centers[neighbor]; if (!a || !b) return;
        const dx = b.x-a.x, dy = b.y-a.y, length = Math.hypot(dx,dy), nx = length ? -dy/length : 0, ny = length ? dx/length : 1;
        let previous = a;
        for (let j = 1; j <= 12; j++) {
          const f = j/12, coil = 0.06 * Math.sin(f * Math.PI * 2);
          const next = new Vector3(a.x+dx*f+nx*coil, a.y+dy*f+ny*coil, 0);
          colorAt(pointColors[i]!, pointColors[neighbor]!, (j-1)/12, vertices.length);
          colorAt(pointColors[i]!, pointColors[neighbor]!, f, vertices.length+1);
          vertices.push(previous, next); previous = next;
        }
      };
      for (let row = 0; row < this.side; row++) for (let col = 0; col < this.side; col++) {
        const i = row * this.side + col;
        if (col+1 < this.side) connect(i, i+1);
        if (row+1 < this.side) connect(i, i+this.side);
      }
      colors.needsUpdate = true;
      this.spring.geometry.setFromPoints(vertices); this.spring.geometry.setDrawRange(0, vertices.length);
    }
    if (scene.display.longitudinalView === 'tracer') {
      const minFrequency = Math.min(...scene.waves.filter(w => w.enabled && w.amplitude > 0).map(w => w.frequency));
      const duration = Number.isFinite(minFrequency) ? 1/minFrequency : 1;
      const historyPhases = Array.from({ length: 25 }, (_, i) => phasesAt(scene, time-duration+i/24*duration));
      const attribute = this.trails.geometry.getAttribute('position');
      const colors = this.trails.geometry.getAttribute('color');
      let vertex = 0;
      for (let pointIndex = 0; pointIndex < this.points.length; pointIndex++) {
        const point = this.points[pointIndex];
        if (!point.values) continue;
        let [previousX, previousY] = displacement(point.values, historyPhases[0]);
        for (let i = 1; i < historyPhases.length; i++) {
          const [x, y] = displacement(point.values, historyPhases[i]);
          if (Math.hypot(x-previousX, y-previousY) > 1e-12) {
            const color = pointColors[pointIndex]!;
            const fade = 0.35 + 0.65*i/24;
            colors.setXYZ(vertex, color.r*fade, color.g*fade, color.b*fade);
            colors.setXYZ(vertex+1, color.r*fade, color.g*fade, color.b*fade);
            attribute.setXYZ(vertex++, point.x+gain*previousX, point.y+gain*previousY, 0.06);
            attribute.setXYZ(vertex++, point.x+gain*x, point.y+gain*y, 0.06);
          }
          previousX = x; previousY = y;
        }
      }
      attribute.needsUpdate = colors.needsUpdate = true; this.trails.geometry.setDrawRange(0, vertex);
      const values = this.tracerValues;
      this.trail.visible = this.tracked.visible = this.anchor.visible = values !== null;
      if (values) {
        const [dx, dy] = displacement(values, phases);
        this.tracked.position.set(scene.display.tracerX+gain*dx, scene.display.tracerY+gain*dy, 0.04);
        this.anchor.position.set(scene.display.tracerX, scene.display.tracerY, 0.02);
        const positions = Array.from({ length: 97 }, (_, i) => {
          const [x, y] = displacement(values, phasesAt(scene, time-duration+i/96*duration));
          return new Vector3(scene.display.tracerX+gain*x, scene.display.tracerY+gain*y, 0.09);
        });
        this.trail.geometry.setFromPoints(positions);
      }
    }
  }
}
