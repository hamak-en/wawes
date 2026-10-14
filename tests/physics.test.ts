import { describe, expect, it } from 'vitest';
import fixture from './fixtures/hankel0.json';
import { hankel0, doubleArithmetic, hankelSmall, hankelLarge } from '../src/physics/bessel';
import type { Arithmetic } from '../src/physics/bessel';
import { energyAt, sampleField, TAU } from '../src/physics/model';
import { defaultScene, newWave, presetScene } from '../src/state';

describe('full Hankel function', () => {
  it('matches independent system j0/y0 across the entire operating range, including the branch and zeros', () => {
    for (const [x, j, y] of fixture.samples) {
      const actual = hankel0(x);
      expect(Math.abs(actual[0] - j)).toBeLessThan(2e-14);
      expect(Math.abs(actual[1] - y)).toBeLessThan(2e-14);
    }
  });
  it('keeps the shared expressions accurate when every arithmetic operation uses float32', () => {
    const f = Math.fround;
    const math: Arithmetic<number> = {
      ...doubleArithmetic, constant: f, add: (a, b) => f(a + b), sub: (a, b) => f(a - b),
      mul: (a, b) => f(a * b), div: (a, b) => f(a / b), sin: x => f(Math.sin(x)), cos: x => f(Math.cos(x)),
      log: x => f(Math.log(x)), sqrt: x => f(Math.sqrt(x)),
    };
    for (const [x, j, y] of fixture.samples) {
      const actual = x <= 5 ? hankelSmall(f(x), math) : hankelLarge(f(x), math);
      expect(Math.hypot(actual[0] - j, actual[1] - y) / Math.hypot(j, y)).toBeLessThan(2e-5);
    }
  });
  it('satisfies the radial Helmholtz equation outside the source', () => {
    const k = TAU;
    for (const r of [0.05, 0.2, 1, 4]) {
      const h = 1e-5, u = hankel0(k * r), left = hankel0(k * (r - h)), right = hankel0(k * (r + h));
      for (const channel of [0, 1]) {
        const second = (left[channel] - 2 * u[channel] + right[channel]) / h ** 2;
        const first = (right[channel] - left[channel]) / (2 * h);
        expect(Math.abs(second + first / r + k * k * u[channel]) / (Math.abs(second) + Math.abs(first / r) + Math.abs(k * k * u[channel]))).toBeLessThan(3e-6);
      }
    }
  });
  it('rejects its singular or nonphysical arguments', () => {
    for (const x of [0, -1, Infinity, NaN]) expect(() => hankel0(x)).toThrow();
  });
});

describe('membrane physics', () => {
  it('has the plane-wave amplitude, period, wavelength and direction specified by the model', () => {
    const scene = defaultScene(); scene.speed = 2;
    scene.waves = [{ ...newWave('plane', 'test'), frequency: 0.5, direction: Math.PI / 2 }];
    const value = (x: number, y: number, t: number) => sampleField(scene, x, y, t)!.displacement;
    expect(value(0, 0, 0)).toBeCloseTo(0.001, 12);
    expect(value(0, 0, 1)).toBeCloseTo(-0.001, 12);
    expect(value(0, 4, 0)).toBeCloseTo(0.001, 12);
    expect(value(5, 0, 0)).toBeCloseTo(0.001, 12);
    expect(value(0, 1, 0.5)).toBeCloseTo(0.001, 12);
  });
  it('doubles identical in-phase waves and cancels opposite phases everywhere', () => {
    for (const x of [-4.7, 0, 0.13, 2.3]) for (const y of [-2, 0, 4]) for (const time of [0, 0.19, 2.7]) {
      expect(sampleField(presetScene('inPhase'), x, y, time)!.displacement).toBeCloseTo(0.002 * Math.cos(TAU * (x - time)), 12);
      expect(sampleField(presetScene('opposite'), x, y, time)!.displacement).toBeCloseTo(0, 12);
      expect(sampleField(presetScene('opposite'), x, y, time)!.meanSquare).toBeCloseTo(0, 15);
    }
  });
  it('produces standing-wave nodes at odd quarter wavelengths', () => {
    const scene = presetScene('standing');
    for (const time of [0, 0.17, 0.61]) for (const x of [-1.25, -0.25, 0.25, 0.75, 1.25])
      expect(sampleField(scene, x, 0, time)!.displacement).toBeCloseTo(0, 12);
    expect(sampleField(scene, 0.13, 0, 0.19)!.displacement).toBeCloseTo(0.002 * Math.cos(TAU * 0.13) * Math.cos(TAU * 0.19), 12);
  });
  it('matches the analytic beats identity at nearby but distinct frequencies', () => {
    const scene = presetScene('beats');
    for (const x of [-2.4, 0, 1.1]) for (const t of [0, 2.3, 5, 8.1]) {
      const expected = 0.002 * Math.cos(Math.PI * 0.1 * (x - t)) * Math.cos(TAU * 1.05 * (x - t));
      expect(sampleField(scene, x, 0, t)!.displacement).toBeCloseTo(expected, 12);
    }
  });
  it('normalizes circular amplitude and phase at one meter and remains radially symmetric', () => {
    const scene = defaultScene(); scene.waves = [{ ...newWave('circular', 'circle'), phase: 0.7, frequency: 0.1, x: 0.2, y: -0.7 }];
    for (const t of [0, 0.5, 10]) expect(sampleField(scene, 1.2, -0.7, t)!.displacement).toBeCloseTo(0.001 * Math.cos(0.7 - TAU * 0.1 * t), 12);
    expect(sampleField(scene, 2.2, -0.7, 0.19)!.displacement).toBeCloseTo(sampleField(scene, 0.2, 1.3, 0.19)!.displacement, 12);
  });
  it('cancels symmetric circular sources on the symmetry axis, with no false global cancellation', () => {
    const scene = defaultScene(); scene.waves[1].phase = Math.PI;
    for (const y of [-4.7, 0, 2.3]) for (const t of [0, 0.1, 0.7]) expect(sampleField(scene, 0, y, t)!.displacement).toBeCloseTo(0, 12);
    expect(Math.abs(sampleField(scene, 0.2, 0.5, 0.17)!.displacement)).toBeGreaterThan(1e-5);
  });
  it('masks only enabled, nonzero circular sources and defines the empty field as zero', () => {
    const scene = defaultScene();
    expect(sampleField(scene, -1, 0)).toBeNull(); expect(sampleField(scene, -0.96, 0)).toBeNull();
    scene.waves[0].enabled = false; expect(sampleField(scene, -1, 0)).not.toBeNull();
    scene.waves[1].amplitude = 0; expect(sampleField(scene, 1, 0)!.displacement).toBe(0);
    scene.waves = []; expect(sampleField(scene, 0, 0)).toEqual({ displacement: 0, meanSquare: 0, windowMean: 0, contributions: [] });
  });
  it('keeps interference within exact frequency groups and removes different-frequency cross terms', () => {
    const scene = presetScene('inPhase'); expect(sampleField(scene, 0, 0)!.meanSquare).toBeCloseTo(2e-6, 14);
    scene.waves[1].frequency = 1.000000001;
    expect(sampleField(scene, 0, 0)!.meanSquare).toBeCloseTo(1e-6, 14);
    expect(sampleField(scene, 0, 0, 21)!.meanSquare).toBeCloseTo(1e-6, 14);
  });
  it('matches symmetric finite-window quadrature, including beats and circular phases', () => {
    for (const scene of [presetScene('beats'), defaultScene()]) {
      scene.display.averageWindow = 0.63;
      const t = 1.37, expected = sampleField(scene, 0.21, -0.3, t)!.windowMean;
      const n = 4000, dt = scene.display.averageWindow / n;
      let integrated = 0;
      for (let i = 0; i < n; i++) integrated += sampleField(scene, 0.21, -0.3, t - scene.display.averageWindow / 2 + (i + 0.5) * dt)!.displacement ** 2 / n;
      expect(Math.abs(expected - integrated)).toBeLessThan(1e-12);
    }
  });
  it('conserves circular radiated power and gives zero standing-wave mean flux', () => {
    const scene = defaultScene(); scene.waves = [newWave('circular', 'circle')];
    const power = [0.06, 0.2, 1, 4].map(r => 2 * Math.PI * r * energyAt(scene, r, 0, 0.13)!.meanFlux[0]);
    expect(power[0]).toBeGreaterThan(0);
    for (const p of power) expect(Math.abs(p / power[0] - 1)).toBeLessThan(2e-7);
    const standing = energyAt(presetScene('standing'), 0.25, 0, 0)!;
    expect(Math.abs(standing.meanFlux[0])).toBeLessThan(1e-12);
    expect(standing.energy).toBeGreaterThan(1e-6);
  });
});

 it('shows a finite resting field at zero propagation speed', () => {
  const scene = defaultScene(); scene.speed = 0;
  for (const [x, y] of [[0, 0], [-1, 0], [2, 3]]) {
    const sample = sampleField(scene, x, y, 2)!;
    expect(sample.displacement).toBe(0);
    expect(sample.meanSquare).toBe(0);
    expect(sample.windowMean).toBe(0);
  }
});
