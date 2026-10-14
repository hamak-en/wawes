import type { SceneState, Wave } from '../state';
import { MASK_RADIUS } from '../state';
import { hankel0 } from './bessel';

export const TAU = Math.PI * 2;
export type Complex = [number, number];
export interface PreparedWave {
  wave: Wave;
  k: number;
  coefficient: Complex;
}
export function sinc(x: number): number { return Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x; }

export function prepareWaves(scene: SceneState, time: number): PreparedWave[] {
  return scene.waves.map(wave => {
    // The propagating harmonic solution is undefined at c = 0; display a resting field.
    if (scene.speed === 0) return { wave: { ...wave, enabled: false }, k: 1, coefficient: [0, 0] as Complex };
    const k = TAU * wave.frequency / scene.speed;
    // Reduce time in double precision per frequency, preserving late paused frames on float32 GPUs.
    const phase = wave.phase - TAU * ((time * wave.frequency) % 1);
    const amplitude = wave.enabled ? wave.amplitude : 0;
    let re = amplitude * Math.cos(phase), im = amplitude * Math.sin(phase);
    if (wave.type === 'circular') {
      const [j, y] = hankel0(k), norm = j * j + y * y;
      [re, im] = [(re * j + im * y) / norm, (im * j - re * y) / norm];
    }
    return { wave, k, coefficient: [re, im] };
  });
}
export function contribution(p: PreparedWave, x: number, y: number): Complex | null {
  const { wave: w, k, coefficient: [a, b] } = p;
  if (!w.enabled || w.amplitude === 0) return [0, 0];
  let real: number, imaginary: number;
  if (w.type === 'circular') {
    const r = Math.hypot(x - w.x, y - w.y);
    if (r < MASK_RADIUS) return null;
    [real, imaginary] = hankel0(k * r);
  } else {
    const angle = k * (Math.cos(w.direction) * x + Math.sin(w.direction) * y);
    real = Math.cos(angle); imaginary = Math.sin(angle);
  }
  return [a * real - b * imaginary, a * imaginary + b * real];
}
export interface FieldSample {
  displacement: number;
  meanSquare: number;
  windowMean: number;
  contributions: number[];
}
export function samplePrepared(prepared: PreparedWave[], x: number, y: number, averageWindow: number): FieldSample | null {
  const values = prepared.map(w => contribution(w, x, y));
  if (values.some(v => v === null)) return null;
  const complex = values as Complex[];
  let displacement = 0, meanSquare = 0, windowMean = 0;
  for (let i = 0; i < complex.length; i++) {
    const [a, b] = complex[i], f = prepared[i].wave.frequency;
    displacement += a;
    meanSquare += (a * a + b * b) / 2;
    windowMean += (a * a + b * b + (a * a - b * b) * sinc(TAU * f * averageWindow)) / 2;
    for (let j = i + 1; j < complex.length; j++) {
      const [c, d] = complex[j], f2 = prepared[j].wave.frequency;
      if (f === f2) meanSquare += a * c + b * d;
      windowMean += (a * c + b * d) * sinc(Math.PI * (f - f2) * averageWindow)
        + (a * c - b * d) * sinc(Math.PI * (f + f2) * averageWindow);
    }
  }
  return { displacement, meanSquare: Math.max(0, meanSquare), windowMean: Math.max(0, windowMean),
    contributions: complex.map(v => v[0]) };
}
export function sampleField(scene: SceneState, x: number, y: number, time = scene.playback.time): FieldSample | null {
  return samplePrepared(prepareWaves(scene, time), x, y, scene.display.averageWindow);
}

/** Energy is distinct from displacement variance. This CPU inspection helper uses spatial differences. */
export function energyAt(scene: SceneState, x: number, y: number, time: number): { energy: number; flux: Complex; meanFlux: Complex } | null {
  const prepared = prepareWaves(scene, time), h = 1e-5;
  let ut = 0, ux = 0, uy = 0;
  const groups = new Map<number, { u: Complex; dx: Complex; dy: Complex }>();
  for (const p of prepared) {
    const u = contribution(p, x, y), xp = contribution(p, x + h, y), xm = contribution(p, x - h, y);
    const yp = contribution(p, x, y + h), ym = contribution(p, x, y - h);
    if (!u || !xp || !xm || !yp || !ym) return null;
    const dx: Complex = [(xp[0] - xm[0]) / (2 * h), (xp[1] - xm[1]) / (2 * h)];
    const dy: Complex = [(yp[0] - ym[0]) / (2 * h), (yp[1] - ym[1]) / (2 * h)];
    ut += TAU * p.wave.frequency * u[1]; ux += dx[0]; uy += dy[0];
    const group = groups.get(p.wave.frequency) ?? { u: [0, 0], dx: [0, 0], dy: [0, 0] };
    for (const index of [0, 1] as const) { group.u[index] += u[index]; group.dx[index] += dx[index]; group.dy[index] += dy[index]; }
    groups.set(p.wave.frequency, group);
  }
  const tension = scene.speed ** 2; // ρ = 1 kg/m² is fixed.
  const meanFlux: Complex = [0, 0];
  for (const [f, g] of groups) {
    meanFlux[0] += tension * Math.PI * f * (g.u[0] * g.dx[1] - g.u[1] * g.dx[0]);
    meanFlux[1] += tension * Math.PI * f * (g.u[0] * g.dy[1] - g.u[1] * g.dy[0]);
  }
  return { energy: (ut * ut + tension * (ux * ux + uy * uy)) / 2, flux: [-tension * ut * ux, -tension * ut * uy], meanFlux };
}
