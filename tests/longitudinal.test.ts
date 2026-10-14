import { describe, expect, it } from 'vitest';
import { hankel1 } from '../src/physics/bessel';
import { sampleLongitudinal } from '../src/physics/longitudinal';
import { defaultScene, newWave, presetScene, validateScene } from '../src/state';
import { decodeScene, encodeScene } from '../src/url';
import fixture from './fixtures/hankel1.json';

describe('longitudinal waves', () => {
  it('matches independent J1/Y1 values, including the approximation branch and roots', () => {
    for (const [x, j, y] of fixture.samples) {
      const actual = hankel1(x);
      expect(Math.abs(actual[0] - j)).toBeLessThan(3e-13);
      expect(Math.abs(actual[1] - y) / Math.max(1, Math.abs(y))).toBeLessThan(3e-13);
    }
  });
  it('moves plane-wave particles parallel to propagation with the correct phase and wavelength', () => {
    const scene = defaultScene(); scene.polarization = 'longitudinal'; scene.speed = 2;
    const direction = 0.73, amplitude = 0.003, frequency = 0.5;
    scene.waves = [{ ...newWave('plane'), direction, amplitude, frequency }];
    for (const [x, y, time] of [[0, 0, 0], [2, -1, 0.37], [-3, 2, 1.2]]) {
      const sample = sampleLongitudinal(scene, x, y, time)!;
      const u = amplitude * Math.cos(Math.PI / 2 * (x * Math.cos(direction) + y * Math.sin(direction)) - Math.PI * time);
      expect(sample.displacement).toBeCloseTo(u * Math.cos(direction), 12);
      expect(sample.displacementY).toBeCloseTo(u * Math.sin(direction), 12);
      expect(sample.meanSquare).toBeCloseTo(amplitude ** 2 / 2, 14);
    }
  });
  it('normalizes circular radial displacement at 1m and masks the source', () => {
    const scene = defaultScene(); scene.polarization = 'longitudinal';
    scene.waves = [{ ...newWave('circular'), phase: 0.7, frequency: 0.3 }];
    for (const angle of [0, Math.PI / 2, 2.1]) {
      const sample = sampleLongitudinal(scene, Math.cos(angle), Math.sin(angle), 0)!;
      expect(sample.displacement).toBeCloseTo(0.001 * Math.cos(0.7) * Math.cos(angle), 12);
      expect(sample.displacementY).toBeCloseTo(0.001 * Math.cos(0.7) * Math.sin(angle), 12);
    }
    expect(sampleLongitudinal(scene, 0, 0)).toBeNull();
    scene.waves[0].enabled = false;
    expect(sampleLongitudinal(scene, 0, 0)!.displacement).toBe(0);
  });
  it('has no curl and satisfies the vector Helmholtz equation outside circular sources', () => {
    const scene = defaultScene(); scene.polarization = 'longitudinal';
    scene.waves = [newWave('circular')];
    const x = 0.71, y = 0.53, h = 1e-4, k = 2 * Math.PI;
    const u = sampleLongitudinal(scene, x, y, 0.13)!;
    const xp = sampleLongitudinal(scene, x+h, y, 0.13)!, xm = sampleLongitudinal(scene, x-h, y, 0.13)!;
    const yp = sampleLongitudinal(scene, x, y+h, 0.13)!, ym = sampleLongitudinal(scene, x, y-h, 0.13)!;
    expect(Math.abs((xp.displacementY-xm.displacementY-yp.displacement+ym.displacement)/(2*h))).toBeLessThan(1e-9);
    for (const key of ['displacement', 'displacementY'] as const) {
      const laplacian = (xp[key]+xm[key]+yp[key]+ym[key]-4*u[key])/(h*h);
      expect(Math.abs(laplacian+k*k*u[key])).toBeLessThan(1e-8);
    }
  });
  it('uses vector dot products for crossing-wave interference and time averages', () => {
    const scene = presetScene('inPhase'); scene.polarization = 'longitudinal';
    expect(sampleLongitudinal(scene, 0, 0)!.meanSquare).toBeCloseTo(2e-6, 14);
    scene.waves[1].direction = Math.PI / 2;
    expect(sampleLongitudinal(scene, 0, 0)!.meanSquare).toBeCloseTo(1e-6, 14);
    scene.waves[1].frequency = 1.1; scene.display.averageWindow = 0.63;
    const time = 0.7, steps = 2000;
    let quadrature = 0;
    for (let i=0; i<steps; i++) {
      const sample = sampleLongitudinal(scene, 0.3, -0.2, time + ((i+0.5)/steps-0.5)*0.63)!;
      quadrature += (sample.displacement**2 + sample.displacementY**2)/steps;
    }
    expect(sampleLongitudinal(scene, 0.3, -0.2, time)!.windowMean).toBeCloseTo(quadrature, 12);
  });
  it('preserves polarization in links and defaults old scenes to transverse', () => {
    const scene = defaultScene(); scene.polarization = 'longitudinal';
    expect(decodeScene(encodeScene(scene)).polarization).toBe('longitudinal');
    const { polarization: _old, ...legacy } = scene;
    expect(validateScene(legacy).polarization).toBe('transverse');
    expect(() => validateScene({ ...scene, polarization: 'unknown' })).toThrow();
    scene.speed = 0;
    const resting = sampleLongitudinal(scene, -1, 0)!;
    expect(resting.displacement).toBe(0); expect(resting.displacementY).toBe(0);
  });
});

import { Matrix4 } from 'three/webgpu';
import { LongitudinalParticles } from '../src/render/longitudinal';

it('renders cached longitudinal phasors at the same particle coordinates as the physical model', () => {
  const scene = defaultScene(); scene.polarization = 'longitudinal';
  scene.waves = [{ ...newWave('plane'), direction: 0.73, phase: 0.4 }];
  const particles = new LongitudinalParticles(), matrix = new Matrix4();
  particles.setState(scene);
  for (const time of [0, 0.17, 86400.13]) {
    particles.render(scene, time); particles.mesh.getMatrixAt(0, matrix);
    const expected = sampleLongitudinal(scene, -5, -5, time)!;
    expect(matrix.elements[12]).toBeCloseTo(-5 + scene.display.heightScale * expected.displacement, 5);
    expect(matrix.elements[13]).toBeCloseTo(-5 + scene.display.heightScale * expected.displacementY, 5);
    expect(matrix.elements[14]).toBe(0);
  }
  scene.waves = [newWave('circular')]; particles.setState(scene); particles.render(scene, 0.19);
  particles.mesh.getMatrixAt(0, matrix);
  const expected = sampleLongitudinal(scene, -5, -5, 0.19)!;
  expect(matrix.elements[12]).toBeCloseTo(-5 + scene.display.heightScale * expected.displacement, 5);
  scene.speed = 0; particles.setState(scene); particles.render(scene, 0.19); particles.mesh.getMatrixAt(0, matrix);
  expect(matrix.elements[12]).toBe(-5); expect(matrix.elements[13]).toBe(-5);
  particles.mesh.geometry.dispose(); particles.mesh.material.dispose();
});
