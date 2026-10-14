import { defaultScene, newWave, presetScene } from './state';
import type { SceneState } from './state';

/** Deliberately asymmetric cases catch readback flips and sign/phase mistakes. */
export function validationScenes(): SceneState[] {
  const scenes = ['sources', 'inPhase', 'opposite', 'standing', 'beats'].map(id => presetScene(id as 'sources'));
  const edge = defaultScene(); edge.speed = 0.5; edge.playback.time = 86400;
  edge.display.averageWindow = 0.017;
  edge.waves = [
    { ...newWave('circular', 'edge-1'), frequency: 2, x: -4.73, y: 3.09, phase: 1.7 },
    { ...newWave('circular', 'edge-2'), frequency: 0.1, x: 0.91, y: -1.37, phase: 4.1, amplitude: 0.005 },
    { ...newWave('plane', 'edge-3'), frequency: 1.1, direction: 0.73, phase: 0.41 },
  ];
  scenes.push(edge);
  const minimum = defaultScene(); minimum.speed = 3;
  minimum.waves = [{ ...newWave('circular', 'minimum'), frequency: 0.1, x: 0.003, y: -0.011 }];
  scenes.push(minimum);
  const mask = defaultScene(); mask.waves = [{ ...newWave('circular', 'mask'), x: 0, y: 0 }]; scenes.push(mask);
  const disabled = defaultScene(); disabled.waves[0].enabled = false; disabled.waves[1].amplitude = 0; scenes.push(disabled);
  const full = defaultScene(); full.waves = Array.from({ length: 8 }, (_, i) => ({ ...newWave(i % 2 ? 'plane' : 'circular', `full-${i}`),
    phase: i * 0.7, direction: i * 0.4, x: i / 2 - 2, y: i % 3 - 1, frequency: 0.3 + i * 0.2 })); scenes.push(full);
  const empty = defaultScene(); empty.waves = []; scenes.push(empty);
  const larger = defaultScene(); larger.speed = 0.75;
  larger.waves = [
    { ...newWave('plane', 'larger-plane'), amplitude: 0.025, frequency: 12.3456, direction: 0.93, phase: 4.5 },
    { ...newWave('circular', 'larger-circular'), amplitude: 0.075, frequency: 7.25, x: 0.7, y: -0.1 },
  ];
  scenes.push(larger);
  scenes.forEach((scene, i) => { scene.playback.paused = true; if (scene !== edge) scene.playback.time = 0.137 + i * 0.061; });
  return scenes;
}
