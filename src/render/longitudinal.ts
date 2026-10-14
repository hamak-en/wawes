import { InstancedMesh, SphereGeometry, MeshBasicNodeMaterial, Matrix4, Color } from 'three/webgpu';
import type { SceneState } from '../state';
import { longitudinalContribution, prepareLongitudinal, sampleLongitudinalComplex } from '../physics/longitudinal';
import type { VectorAmplitude } from '../physics/longitudinal';
import { TAU } from '../physics/model';

/** Cache spatial phasors so animation only rotates phases, never recalculates Bessel functions. */
export class LongitudinalParticles {
  readonly mesh = new InstancedMesh(new SphereGeometry(0.032, 8, 6), new MeshBasicNodeMaterial(), 41 * 41);
  private key = '';
  private points: { x: number; y: number; values: VectorAmplitude[] }[] = [];
  private matrix = new Matrix4();
  private color = new Color();
  private blue = new Color('#5ea6f5');
  private orange = new Color('#ffb079');
  private mint = new Color('#78eed7');
  constructor() { this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; }
  setState(scene: SceneState): void {
    this.mesh.visible = scene.polarization === 'longitudinal';
    if (!this.mesh.visible) return;
    const key = JSON.stringify([scene.speed, scene.waves, scene.display.quality]);
    if (key === this.key) return;
    this.key = key; this.points = [];
    const side = { low: 19, medium: 29, high: 41 }[scene.display.quality];
    const prepared = prepareLongitudinal(scene, 0);
    for (let row = 0; row < side; row++) for (let col = 0; col < side; col++) {
      const x = -5 + col * 10 / (side - 1), y = -5 + row * 10 / (side - 1);
      const values = prepared.map(p => longitudinalContribution(p, x, y));
      if (values.some(v => v === null)) continue;
      this.points.push({ x, y, values: values as VectorAmplitude[] });
    }
    this.mesh.count = this.points.length;
  }
  render(scene: SceneState, time: number): void {
    if (!this.mesh.visible) return;
    const phases = scene.waves.map(w => {
      const angle = -TAU * ((time * w.frequency) % 1); return [Math.cos(angle), Math.sin(angle)];
    });
    this.points.forEach((point, index) => {
      const values: VectorAmplitude[] = point.values.map((v, i) => v.map(([re, im]) =>
        [re * phases[i][0] - im * phases[i][1], re * phases[i][1] + im * phases[i][0]]) as VectorAmplitude);
      const sample = scene.display.quantity === 'displacement'
        ? { displacement: values.reduce((sum, v) => sum + v[0][0], 0),
            displacementY: values.reduce((sum, v) => sum + v[1][0], 0), meanSquare: 0, windowMean: 0 }
        : sampleLongitudinalComplex(values, scene.waves, scene.display.averageWindow);
      // Particles always show instantaneous displacement, also when their color shows a time average.
      this.matrix.makeTranslation(point.x + scene.display.heightScale * sample.displacement,
        point.y + scene.display.heightScale * sample.displacementY, 0);
      this.mesh.setMatrixAt(index, this.matrix);
      if (scene.display.quantity === 'displacement') {
        const value = Math.max(-1, Math.min(1, sample.displacement / scene.display.colorScale));
        this.color.set('#bdcbd2').lerp(value < 0 ? this.blue : this.orange, Math.abs(value));
      } else {
        const squared = scene.display.quantity === 'meanSquare' ? sample.meanSquare : sample.windowMean;
        this.color.set('#123040').lerp(this.mint, Math.min(1, Math.sqrt(squared) / scene.display.colorScale));
      }
      this.mesh.setColorAt(index, this.color);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
