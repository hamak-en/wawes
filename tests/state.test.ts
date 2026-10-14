import { describe, expect, it } from 'vitest';
import { colorScaleFor, defaultScene, validateScene } from '../src/state';
import { decodeScene, encodeScene } from '../src/url';

describe('amplitude-derived display scale and extended numeric inputs', () => {
  it('uses the largest active amplitude plus 4 mm and updates when waves are disabled or removed', () => {
    const scene = defaultScene();
    scene.waves[0].amplitude = 0.0215;
    scene.waves[1].amplitude = 0.04;
    expect(colorScaleFor(scene.waves)).toBeCloseTo(0.044, 12);
    scene.waves[1].enabled = false;
    expect(colorScaleFor(scene.waves)).toBeCloseTo(0.0255, 12);
    expect(colorScaleFor([])).toBe(0.004);
  });

  it('restores larger fractional amplitudes and frequencies without clamping them to slider defaults', () => {
    const scene = defaultScene(); scene.playback.paused = true;
    scene.waves[0].amplitude = 12.3456789; // 12345.6789 mm.
    scene.waves[0].frequency = 1234.56789;
    const restored = decodeScene(encodeScene(scene));
    expect(restored.waves).toEqual(scene.waves);
    expect(restored.display.colorScale).toBeCloseTo(12.3496789, 10);
  });

  it('recalculates old manually stored color scales from their source amplitudes', () => {
    const scene = defaultScene(); scene.display.colorScale = 0.004;
    scene.waves[0].amplitude = 0.01275;
    expect(validateScene(scene).display.colorScale).toBeCloseTo(0.01675, 12);
  });

  it('continues rejecting negative, non-finite and unsupported numeric magnitudes', () => {
    for (const amplitude of [-1, Infinity, NaN, Number.MAX_VALUE]) {
      const scene = defaultScene(); scene.waves[0].amplitude = amplitude;
      expect(() => validateScene(scene)).toThrow();
    }
    for (const frequency of [0, -1, Infinity, NaN, Number.MAX_VALUE]) {
      const scene = defaultScene(); scene.waves[0].frequency = frequency;
      expect(() => validateScene(scene)).toThrow();
    }
  });
});
