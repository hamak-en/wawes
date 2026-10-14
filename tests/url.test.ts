import { describe, expect, it } from 'vitest';
import { encodeScene, decodeScene, MAX_FRAGMENT_LENGTH } from '../src/url';
import { defaultScene, newWave, validateScene } from '../src/state';

describe('portable scene links', () => {
  it('round-trips every paused-frame setting, including both cameras, waves and display controls', () => {
    const scene = defaultScene(); scene.mode = '3d'; scene.playback = { paused: true, time: 1234.56789, rate: 0.25, step: 0.03 };
    scene.camera = { position: [3, -9, 11], target: [0.5, 0.1, -0.2], zoom: 1.4 };
    scene.camera2d = { position: [1, -2, 12], target: [1, -2, 0], zoom: 2 };
    scene.display.quantity = 'windowMean'; scene.display.averageWindow = 0.77; scene.display.sectionY = -2;
    scene.display.heightScale = 143; scene.display.colorScale = 0.005; scene.display.quality = 'high';
    scene.display.panels = false; scene.display.grid = false; scene.display.contributions = false; scene.display.section = false;
    scene.waves[1].enabled = false; scene.waves.push({ ...newWave('plane', 'plane'), direction: 0.7, phase: 5.2 });
    expect(decodeScene(encodeScene(scene))).toEqual(scene);
  });
  it('always restores playing scenes at t=0 without changing phase definitions', () => {
    const scene = defaultScene(); scene.playback.time = 83; scene.waves[1].phase = 0.25;
    const restored = decodeScene(encodeScene(scene));
    expect(restored.playback.time).toBe(0); expect(restored.playback.paused).toBe(false);
    expect(restored.waves[1].phase).toBe(0.25); expect(scene.playback.time).toBe(83);
  });
  it('fits eight full-precision waves inside the declared URL budget without compression', () => {
    const scene = defaultScene(); scene.waves = Array.from({ length: 8 }, (_, i) => ({ ...newWave('circular'),
      phase: Math.PI / (i + 1), direction: Math.PI / (i + 2), frequency: 0.1 + i / 7, x: i / 8, y: i === 0 ? 0 : -i / 11 }));
    expect(encodeScene(scene).length).toBeLessThan(MAX_FRAGMENT_LENGTH);
    expect(decodeScene(encodeScene(scene)).waves).toEqual(scene.waves);
  });
  it('rejects malformed encoding, oversized input, unknown versions, non-finite values and duplicate IDs', () => {
    for (const fragment of ['#scene=!', '#scene=123', '#other=test', '#scene=' + 'A'.repeat(13000)]) expect(() => decodeScene(fragment)).toThrow();
    const scene = defaultScene();
    expect(() => validateScene({ ...scene, version: 2 })).toThrow();
    expect(() => validateScene({ ...scene, speed: NaN })).toThrow();
    expect(() => validateScene({ ...scene, speed: '1' })).toThrow();
    expect(() => validateScene({ ...scene, waves: [...scene.waves, scene.waves[0]] })).toThrow();
    expect(() => validateScene({ ...scene, waves: Array(9).fill(scene.waves[0]) })).toThrow();
    expect(() => validateScene({ ...scene, camera: { ...scene.camera, position: scene.camera.target } })).toThrow();
    expect(() => validateScene({ ...scene, camera2d: { ...scene.camera2d, position: [1, 1, 12] } })).toThrow();
    for (const key of ['amplitude', 'frequency', 'phase', 'x'] as const) {
      const bad = defaultScene(); bad.waves[0][key] = Infinity; expect(() => validateScene(bad)).toThrow();
    }
  });
  it('preserves zero and speeds outside the original slider range', () => {
    for (const speed of [0, 0.001, 5, 123.456]) {
      const scene = defaultScene(); scene.speed = speed;
      expect(decodeScene(encodeScene(scene)).speed).toBe(speed);
    }
    expect(() => validateScene({ ...defaultScene(), speed: -1 })).toThrow();
  });
  it('drops unrecognized imported properties and rejects markup in IDs', () => {
    const scene = defaultScene();
    expect(validateScene({ ...scene, arbitrary: '<script>' })).toEqual(scene);
    scene.waves[0].id = '<img src=x>'; expect(() => validateScene(scene)).toThrow();
  });
});
