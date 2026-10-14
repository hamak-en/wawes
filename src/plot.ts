import type { SceneState } from './state';
import { prepareWaves, samplePrepared } from './physics/model';
import { prepareLongitudinal, sampleLongitudinalPrepared } from './physics/longitudinal';
import { WAVE_COLORS } from './render/renderer';

export function drawSection(canvas: HTMLCanvasElement, scene: SceneState, time: number): { clipped: boolean; max: number } {
  const width = canvas.clientWidth, height = canvas.clientHeight, dpr = Math.min(devicePixelRatio, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const left = 53, right = width - 18, top = 13, bottom = height - 28, middle = (top + bottom) / 2;
  const longitudinal = scene.polarization === 'longitudinal';
  const scale = scene.display.colorScale, prepared = longitudinal ? prepareLongitudinal(scene, time) : prepareWaves(scene, time), count = Math.max(240, Math.floor(width));
  const values = Array.from({ length: count + 1 }, (_, i) => (longitudinal ? sampleLongitudinalPrepared : samplePrepared)(prepared, (i / count - 0.5) * 10,
    scene.display.sectionY, scene.display.averageWindow));
  const max = values.reduce((m, v) => Math.max(m, Math.abs(v?.displacement ?? 0)), 0);
  ctx.font = '12px system-ui'; ctx.textBaseline = 'middle'; ctx.strokeStyle = '#293542'; ctx.lineWidth = 1;
  for (const value of [-1, 0, 1]) {
    const y = middle - value * (bottom - top) / 2;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.fillStyle = '#9cabbc'; ctx.textAlign = 'right'; ctx.fillText(`${Number((value * scale * 1000).toPrecision(3))}`, left - 9, y);
  }
  for (const x of [-5, -2.5, 0, 2.5, 5]) {
    const px = left + (x / 10 + 0.5) * (right - left);
    ctx.fillStyle = '#9cabbc'; ctx.textAlign = 'center'; ctx.fillText(`${x}`, px, bottom + 16);
  }
  ctx.textAlign = 'left'; ctx.fillText('мм', 5, top); ctx.textAlign = 'right'; ctx.fillText('x, м', width - 4, height - 8);
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
  const line = (color: string, contribution?: number) => {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = contribution === undefined ? 2.4 : 1.2;
    ctx.globalAlpha = contribution === undefined ? 1 : 0.65;
    let started = false;
    values.forEach((value, i) => {
      if (!value) { started = false; return; }
      const u = contribution === undefined ? value.displacement : value.contributions[contribution];
      const x = left + i / count * (right - left), y = middle - u / scale * (bottom - top) / 2;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }); ctx.stroke();
  };
  if (scene.display.contributions) scene.waves.forEach((wave, i) => { if (wave.enabled) line(WAVE_COLORS[i], i); });
  line('#eef7f6'); ctx.restore();
  return { clipped: max > scale, max };
}
