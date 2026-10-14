import type { SceneState, Wave } from '../state';
import { MASK_RADIUS } from '../state';
import { hankel0, hankel1 } from './bessel';
import { sampleComplex, TAU } from './model';
import type { Complex, FieldSample, PreparedWave } from './model';

export interface LongitudinalSample extends FieldSample { displacementY: number }
export type VectorAmplitude = [x: Complex, y: Complex];

/** Irrotational displacement in a homogeneous 2D medium. Circular displacement uses H₁. */
export function prepareLongitudinal(scene: SceneState, time: number): PreparedWave[] {
  return scene.waves.map(wave => {
    if (scene.speed === 0) return { wave: { ...wave, enabled: false }, k: 1, coefficient: [0, 0] as Complex };
    const k = TAU * wave.frequency / scene.speed;
    const phase = wave.phase - TAU * ((time * wave.frequency) % 1);
    const amplitude = wave.enabled ? wave.amplitude : 0;
    let re = amplitude * Math.cos(phase), im = amplitude * Math.sin(phase);
    if (wave.type === 'circular') {
      const [j, y] = hankel1(k), norm = j * j + y * y;
      [re, im] = [(re * j + im * y) / norm, (im * j - re * y) / norm];
    }
    return { wave, k, coefficient: [re, im] };
  });
}
export function longitudinalContribution(p: PreparedWave, x: number, y: number): VectorAmplitude | null {
  const { wave: w, k, coefficient: [a, b] } = p;
  if (!w.enabled || w.amplitude === 0) return [[0, 0], [0, 0]];
  let nx = Math.cos(w.direction), ny = Math.sin(w.direction), real: number, imaginary: number;
  if (w.type === 'circular') {
    const dx = x - w.x, dy = y - w.y, r = Math.hypot(dx, dy);
    if (r < MASK_RADIUS) return null;
    nx = dx / r; ny = dy / r;
    [real, imaginary] = hankel1(k * r);
  } else {
    const phase = k * (nx * x + ny * y);
    real = Math.cos(phase); imaginary = Math.sin(phase);
  }
  const re = a * real - b * imaginary, im = a * imaginary + b * real;
  return [[nx * re, nx * im], [ny * re, ny * im]];
}
export function sampleLongitudinalComplex(values: VectorAmplitude[], waves: readonly Wave[], window: number): LongitudinalSample {
  const frequencies = waves.map(w => w.frequency);
  const x = sampleComplex(values.map(v => v[0]), frequencies, window);
  const y = sampleComplex(values.map(v => v[1]), frequencies, window);
  return { ...x, displacementY: y.displacement, meanSquare: x.meanSquare + y.meanSquare, windowMean: x.windowMean + y.windowMean };
}
export function sampleLongitudinalPrepared(prepared: PreparedWave[], x: number, y: number, window: number): LongitudinalSample | null {
  const values = prepared.map(p => longitudinalContribution(p, x, y));
  if (values.some(v => v === null)) return null;
  return sampleLongitudinalComplex(values as VectorAmplitude[], prepared.map(p => p.wave), window);
}
export function sampleLongitudinal(scene: SceneState, x: number, y: number, time = scene.playback.time): LongitudinalSample | null {
  return sampleLongitudinalPrepared(prepareLongitudinal(scene, time), x, y, scene.display.averageWindow);
}


/** Linear compression −div(u), dimensionless. Positive means compression. */
export function longitudinalCompression(p: PreparedWave, x: number, y: number): Complex | null {
  const { wave: w, k, coefficient: [a, b] } = p;
  if (!w.enabled || w.amplitude === 0) return [0, 0];
  if (w.type === 'circular') {
    const r = Math.hypot(x - w.x, y - w.y);
    if (r < MASK_RADIUS) return null;
    const [j, y0] = hankel0(k * r);
    return [-k * (a * j - b * y0), -k * (a * y0 + b * j)];
  }
  const phase = k * (Math.cos(w.direction) * x + Math.sin(w.direction) * y);
  const re = a * Math.cos(phase) - b * Math.sin(phase), im = a * Math.sin(phase) + b * Math.cos(phase);
  return [k * im, -k * re];
}
export function compressionScale(scene: SceneState): number {
  return scene.speed === 0 ? 1 : Math.max(1e-9, scene.waves.reduce((sum, w) =>
    sum + (w.enabled ? w.amplitude * TAU * w.frequency / scene.speed : 0), 0));
}
