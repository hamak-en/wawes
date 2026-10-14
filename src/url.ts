import { validateScene } from './state';
import type { SceneState } from './state';

export const MAX_FRAGMENT_LENGTH = 12000;
export const MAX_JSON_BYTES = 9000;

/** UTF-8 JSON + base64url, without compression: bounded, portable and synchronously flushable. */
export function encodeScene(scene: SceneState): string {
  const snapshot = validateScene(scene);
  if (!snapshot.playback.paused) snapshot.playback.time = 0;
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  if (bytes.length > MAX_JSON_BYTES) throw new Error('Сцена перевищує дозволений розмір.');
  const data = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const fragment = `#scene=${data}`;
  if (fragment.length > MAX_FRAGMENT_LENGTH) throw new Error('Посилання надто довге.');
  return fragment;
}
export function decodeScene(fragment: string): SceneState {
  if (fragment.length > MAX_FRAGMENT_LENGTH || !/^#scene=[A-Za-z0-9_-]+$/.test(fragment))
    throw new Error('Некоректне або завелике посилання на сцену.');
  const encoded = fragment.slice(7).replaceAll('-', '+').replaceAll('_', '/');
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); }
  catch { throw new Error('Не вдалося прочитати посилання на сцену.'); }
  if (bytes.length > MAX_JSON_BYTES) throw new Error('Сцена перевищує дозволений розмір.');
  const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const scene = validateScene(parsed);
  if (!scene.playback.paused) scene.playback.time = 0;
  return scene;
}

export class UrlStore {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private getScene: () => SceneState, private onError: (message: string) => void) {}
  schedule(): void {
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => this.flush(), 150);
  }
  flush(): void {
    clearTimeout(this.timer); this.timer = undefined;
    try {
      const fragment = encodeScene(this.getScene());
      if (location.hash !== fragment) history.replaceState(null, '', location.pathname + location.search + fragment);
    } catch (error) { this.onError(error instanceof Error ? error.message : 'Не вдалося зберегти посилання.'); }
  }
  dispose(): void { clearTimeout(this.timer); }
}
