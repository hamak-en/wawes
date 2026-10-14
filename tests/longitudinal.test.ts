import { describe, expect, it } from 'vitest';
import { hankel1 } from '../src/physics/bessel';
import { longitudinalCompression, prepareLongitudinal, sampleLongitudinal } from '../src/physics/longitudinal';
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

it('defaults older links to particles and rejects invalid view or tracked coordinates', () => {
  const scene = defaultScene();
  const { longitudinalView: _view, tracerX: _x, tracerY: _y, ...oldDisplay } = scene.display;
  const restored = validateScene({ ...scene, display: oldDisplay });
  expect(restored.display.longitudinalView).toBe('particles');
  expect(validateScene({ ...scene, display: { ...scene.display, longitudinalView: 'compression' } }).display.longitudinalView).toBe('particles');
  expect(restored.display.tracerX).toBe(0); expect(restored.display.tracerY).toBe(0);
  expect(() => validateScene({ ...scene, display: { ...scene.display, longitudinalView: 'invalid' } })).toThrow();
  for (const coordinate of [-5.1, 5.1, NaN, Infinity])
    expect(() => validateScene({ ...scene, display: { ...scene.display, tracerX: coordinate } })).toThrow();
});

it('compression is minus the physical displacement divergence for plane and circular waves', () => {
  for (const type of ['plane', 'circular'] as const) {
    const scene = defaultScene(); scene.polarization = 'longitudinal';
    scene.waves = [{ ...newWave(type), direction: 0.7, phase: 0.4 }];
    const x = 0.73, y = 0.41, time = 0.23, h = 1e-5;
    const xp = sampleLongitudinal(scene, x+h, y, time)!, xm = sampleLongitudinal(scene, x-h, y, time)!;
    const yp = sampleLongitudinal(scene, x, y+h, time)!, ym = sampleLongitudinal(scene, x, y-h, time)!;
    const expected = -(xp.displacement-xm.displacement+yp.displacementY-ym.displacementY)/(2*h);
    expect(longitudinalCompression(prepareLongitudinal(scene, time)[0], x, y)![0]).toBeCloseTo(expected, 10);
    scene.speed = 0;
    expect(longitudinalCompression(prepareLongitudinal(scene, time)[0], 0, 0)).toEqual([0, 0]);
  }
});

it('arrow tips and tracked particles use the full displacement vector, with all views restoring in URLs', () => {
  const scene = defaultScene(); scene.polarization = 'longitudinal';
  scene.waves = [{ ...newWave('plane'), direction: 0.73, phase: 0.4 }];
  const particles = new LongitudinalParticles(), matrix = new Matrix4();
  for (const view of ['particles', 'spring', 'arrows', 'tracer'] as const) {
    scene.display.longitudinalView = view; scene.display.tracerX = 0.3; scene.display.tracerY = -0.2;
    expect(decodeScene(encodeScene(scene)).display).toEqual(scene.display);
    particles.setState(scene); particles.render(scene, 0.17);
    if (view === 'arrows') {
      particles.arrows.getMatrixAt(0, matrix);
      const expected = sampleLongitudinal(scene, -5, -5, 0.17)!;
      expect(matrix.elements[12]).toBe(-5); expect(matrix.elements[13]).toBe(-5);
      expect(matrix.elements[0]).toBeCloseTo(scene.display.heightScale * expected.displacement, 6);
      expect(matrix.elements[1]).toBeCloseTo(scene.display.heightScale * expected.displacementY, 6);
    }
    if (view === 'tracer') {
      const expected = sampleLongitudinal(scene, 0.3, -0.2, 0.17)!;
      expect(particles.tracked.position.x).toBeCloseTo(0.3 + scene.display.heightScale * expected.displacement, 10);
      expect(particles.tracked.position.y).toBeCloseTo(-0.2 + scene.display.heightScale * expected.displacementY, 10);
      const trail = particles.trail.geometry.getAttribute('position');
      expect(trail.getX(trail.count-1)).toBeCloseTo(particles.tracked.position.x, 6);
      expect(trail.getY(trail.count-1)).toBeCloseTo(particles.tracked.position.y, 6);
    }
    if (view === 'spring') expect(particles.spring.geometry.drawRange.count).toBeGreaterThan(0);
  }
  scene.display.longitudinalView = 'tracer'; scene.waves = [newWave('circular')];
  scene.display.tracerX = scene.display.tracerY = 0;
  particles.setState(scene); particles.render(scene, 0);
  expect(particles.tracked.visible).toBe(false); expect(particles.trail.visible).toBe(false);
  particles.group.traverse(object => {
    if ('geometry' in object) (object.geometry as { dispose(): void }).dispose();
    if ('material' in object) (object.material as { dispose(): void }).dispose();
  });
});

it('spring links cover the plane and trails remain visible when the selected particle is at a symmetry node', () => {
  const scene = defaultScene(); scene.polarization = 'longitudinal';
  const renderer = new LongitudinalParticles();
  scene.display.longitudinalView = 'spring'; renderer.setState(scene); renderer.render(scene, 0.17);
  const spring = renderer.spring.geometry.getAttribute('position');
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (let i=0; i<renderer.spring.geometry.drawRange.count; i++) {
    minX=Math.min(minX,spring.getX(i)); maxX=Math.max(maxX,spring.getX(i));
    minY=Math.min(minY,spring.getY(i)); maxY=Math.max(maxY,spring.getY(i));
  }
  expect(maxX-minX).toBeGreaterThan(9); expect(maxY-minY).toBeGreaterThan(9);
  scene.display.longitudinalView = 'tracer'; renderer.setState(scene); renderer.render(scene, 0.17);
  expect(renderer.tracked.position.x).toBeCloseTo(0, 12);
  expect(renderer.tracked.position.y).toBeCloseTo(0, 12);
  expect(renderer.trails.visible).toBe(true);
  expect(renderer.trails.geometry.drawRange.count).toBeGreaterThan(0);
  scene.speed=0; scene.display.longitudinalView='tracer'; renderer.setState(scene); renderer.render(scene,0.17);
  expect(renderer.trails.geometry.drawRange.count).toBe(0);
  renderer.group.traverse(object => {
    if ('geometry' in object) (object.geometry as { dispose(): void }).dispose();
    if ('material' in object) (object.material as { dispose(): void }).dispose();
  });
});


it('normalizes old longitudinal averaging scenes while preserving transverse modes', () => {
  for (const quantity of ['meanSquare','windowMean'] as const) {
    const scene=defaultScene(); scene.display.quantity=quantity;
    expect(validateScene(scene).display.quantity).toBe(quantity);
    scene.polarization='longitudinal';
    expect(validateScene(scene).display.quantity).toBe('displacement');
    expect(decodeScene(encodeScene(scene)).display.quantity).toBe('displacement');
  }
});
