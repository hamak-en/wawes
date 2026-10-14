export const MAX_WAVES = 8;
export const MASK_RADIUS = 0.05;
export const EXTENT = 5;
export const LIMITS = {
  amplitude: [0, Number.MAX_SAFE_INTEGER], frequency: [0.1, Number.MAX_SAFE_INTEGER], speed: [0, Number.MAX_VALUE],
  position: [-5, 5], heightScale: [1, 500],
  playback: [0, 2], step: [0.001, 1], time: [0, 86400], window: [0.01, 20],
} as const;

export interface Wave {
  id: string;
  type: 'plane' | 'circular';
  enabled: boolean;
  amplitude: number;
  frequency: number;
  phase: number;
  direction: number;
  x: number;
  y: number;
}
export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
}
export interface SceneState {
  version: 1;
  waves: Wave[];
  speed: number;
  mode: '2d' | '3d';
  polarization: 'transverse' | 'longitudinal';
  camera: CameraState;
  camera2d: CameraState;
  display: {
    quantity: 'displacement' | 'meanSquare' | 'windowMean';
    colorScale: number;
    heightScale: number;
    quality: 'low' | 'medium' | 'high';
    grid: boolean;
    section: boolean;
    sectionY: number;
    panels: boolean;
    contributions: boolean;
    averageWindow: number;
  };
  playback: { paused: boolean; time: number; rate: number; step: number };
}

export const CAMERA_3D: CameraState = { position: [9, -11, 10], target: [0, 0, 0], zoom: 1 };
export const CAMERA_2D: CameraState = { position: [0, 0, 12], target: [0, 0, 0], zoom: 1 };

export function colorScaleFor(waves: readonly Wave[]): number {
  return waves.reduce((max, wave) => wave.enabled ? Math.max(max, wave.amplitude) : max, 0) + 0.004;
}

export function newWave(type: Wave['type'] = 'circular', id: string = crypto.randomUUID()): Wave {
  return { id, type, enabled: true, amplitude: 0.001, frequency: 1, phase: 0, direction: 0, x: 0, y: 0 };
}
export function defaultScene(): SceneState {
  return {
    version: 1,
    waves: [{ ...newWave('circular', 'wave-1'), x: -1 }, { ...newWave('circular', 'wave-2'), x: 1 }],
    speed: 1, mode: '2d', polarization: 'transverse', camera: structuredClone(CAMERA_3D), camera2d: structuredClone(CAMERA_2D),
    display: { quantity: 'displacement', colorScale: 0.005, heightScale: 100, quality: 'medium', grid: true,
      section: true, sectionY: 0, panels: true, contributions: true, averageWindow: 1 },
    playback: { paused: false, time: 0, rate: 1, step: 0.01 },
  };
}

export const PRESETS = [
  { id: 'sources', label: 'Два джерела', description: 'Дві кругові хвилі утворюють інтерференційні смуги.' },
  { id: 'inPhase', label: 'Однакові фази', description: 'Дві однакові плоскі хвилі: амплітуда суми дорівнює 2A.' },
  { id: 'opposite', label: 'Протилежні фази', description: 'Однакові хвилі зі зсувом π повністю компенсують одна одну.' },
  { id: 'standing', label: 'Стояча хвиля', description: 'Зустрічні хвилі: нерухомі вузли на відстані λ/2.' },
  { id: 'beats', label: 'Биття', description: 'Частоти 1 і 1,1 Гц: повільна зміна амплітуди з частотою 0,1 Гц.' },
] as const;
export type PresetId = typeof PRESETS[number]['id'];
export function presetScene(id: PresetId): SceneState {
  const state = defaultScene();
  if (id !== 'sources') {
    state.waves = [newWave('plane', 'wave-1'), newWave('plane', 'wave-2')];
    if (id === 'opposite') state.waves[1].phase = Math.PI;
    if (id === 'standing') state.waves[1].direction = Math.PI;
    if (id === 'beats') { state.waves[1].frequency = 1.1; state.playback.rate = 0.5; }
  }
  return state;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Очікується об’єкт сцени.');
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`Число має бути в межах ${min}…${max}.`);
  return Object.is(value, -0) ? 0 : value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Некоректний логічний параметр.');
  return value;
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('Невідомий параметр сцени.');
  return value as T;
}
function camera(value: unknown, topDown = false): CameraState {
  const c = object(value);
  const vector = (v: unknown, bound: number): [number, number, number] => {
    if (!Array.isArray(v) || v.length !== 3) throw new Error('Некоректна камера.');
    return v.map(n => number(n, -bound, bound)) as [number, number, number];
  };
  const position = vector(c.position, 250), target = vector(c.target, 100);
  const distance = Math.hypot(...position.map((v, i) => v - target[i]));
  if (distance < 0.1 || distance > 150 || (topDown && (Math.abs(position[0] - target[0]) > 1e-6 ||
      Math.abs(position[1] - target[1]) > 1e-6 || position[2] - target[2] < 0.1)))
    throw new Error('Некоректне положення камери.');
  return { position, target, zoom: number(c.zoom, 0.25, 8) };
}

/** Reconstruct only known properties. Imported state never reaches the DOM as markup. */
export function validateScene(value: unknown): SceneState {
  const s = object(value);
  if (s.version !== 1) throw new Error('Непідтримувана версія сцени.');
  if (!Array.isArray(s.waves) || s.waves.length > MAX_WAVES) throw new Error(`Дозволено до ${MAX_WAVES} хвиль.`);
  const ids = new Set<string>();
  const waves = s.waves.map(value => {
    const w = object(value);
    if (typeof w.id !== 'string' || !/^[\w-]{1,48}$/.test(w.id) || ids.has(w.id)) throw new Error('Некоректний ідентифікатор хвилі.');
    ids.add(w.id);
    return { id: w.id, type: choice(w.type, ['plane', 'circular']), enabled: boolean(w.enabled),
      amplitude: number(w.amplitude, ...LIMITS.amplitude), frequency: number(w.frequency, ...LIMITS.frequency),
      phase: number(w.phase, 0, Math.PI * 2), direction: number(w.direction, 0, Math.PI * 2),
      x: number(w.x, ...LIMITS.position), y: number(w.y, ...LIMITS.position) };
  });
  const d = object(s.display), p = object(s.playback);
  return { version: 1, waves, speed: number(s.speed, ...LIMITS.speed), mode: choice(s.mode, ['2d', '3d']),
    polarization: s.polarization === undefined ? 'transverse' : choice(s.polarization, ['transverse', 'longitudinal']),
    camera: camera(s.camera), camera2d: camera(s.camera2d, true),
    display: { quantity: choice(d.quantity, ['displacement', 'meanSquare', 'windowMean']),
      colorScale: colorScaleFor(waves), heightScale: number(d.heightScale, ...LIMITS.heightScale),
      quality: choice(d.quality, ['low', 'medium', 'high']), grid: boolean(d.grid), section: boolean(d.section),
      sectionY: number(d.sectionY, ...LIMITS.position), panels: boolean(d.panels), contributions: boolean(d.contributions),
      averageWindow: number(d.averageWindow, ...LIMITS.window) },
    playback: { paused: boolean(p.paused), time: number(p.time, ...LIMITS.time), rate: number(p.rate, ...LIMITS.playback),
      step: number(p.step, ...LIMITS.step) } };
}
