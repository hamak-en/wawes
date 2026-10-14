import './style.css';
import { defaultScene, validateScene, newWave, presetScene, PRESETS, MAX_WAVES, LIMITS, colorScaleFor } from './state';
import type { SceneState, Wave, PresetId } from './state';
import { decodeScene, UrlStore } from './url';
import { WaveRenderer, WAVE_COLORS } from './render/renderer';
import { drawSection } from './plot';
import { sampleField } from './physics/model';
import { validationScenes } from './validation';

const app = document.querySelector<HTMLDivElement>('#app')!;
const icons = {
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 1-1a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0"/></svg>',
  panel: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>',
};
app.innerHTML = `
  <header class="app-header">
    <label class="preset-picker" for="presets"><span>Навчальні сцени</span><select id="presets"><option value="" disabled>Оберіть сцену</option>${PRESETS.map(p => `<option value="${p.id}" title="${p.description}">${p.label}</option>`).join('')}</select></label>
    <div class="header-controls">
      <div class="playback-controls"><button id="play-pause" class="play-button" aria-label="Пауза">Ⅱ</button><label class="playback-label" for="playback-rate">Темп<select id="playback-rate"><option value="0">0×</option><option value="0.1">0,1×</option><option value="0.25">0,25×</option><option value="0.5">0,5×</option><option value="1">1×</option><option value="2">2×</option></select></label></div>
      <div class="time-controls"><button id="reset-time" class="icon-button" title="Час t = 0" aria-label="Скинути час">↺</button><div class="time-readout"><span>ЧАС</span><output id="time">0.00</output><span>с</span></div></div>
      <div class="step-controls"><label class="step-label" for="time-step">Δt, с<input id="time-step" type="number" min="0.001" max="1" step="0.001"></label><button id="step" class="button ghost" title="Крок часу (→)">Крок →</button></div>
    <div class="view-toggle" role="group" aria-label="Режим візуалізації"><button id="mode-2d">2D <span>поле</span></button><button id="mode-3d">3D <span>поверхня</span></button></div>
    <div class="header-actions">
      <button id="panels" class="icon-button" title="Показати / сховати панелі (H)" aria-label="Панелі керування">${icons.panel}</button>
      <button id="copy-link" class="button accent" aria-label="Копіювати посилання">${icons.link}<span>Копіювати посилання</span></button>
    </div>
    </div>
  </header>
  <div class="workspace">
    <aside class="sidebar" aria-label="Налаштування сцени">
      <section class="panel-block">
        <div class="section-heading"><h2>Джерела хвиль</h2><span id="wave-count" class="tiny-label"></span></div>
        <div id="waves"></div>
        <div class="add-buttons"><button id="add-circular" class="button ghost">＋ Кругова</button><button id="add-plane" class="button ghost">＋ Плоска</button></div>
      </section>
      <section class="panel-block">
        <div class="section-heading"><h2>Середовище</h2></div>
        <label class="control-label" for="wave-speed">Швидкість хвилі <span>м/с</span></label>
        <div class="range-row"><input id="wave-speed" type="range" min="0" max="3" step="any"><input id="wave-speed-number" aria-label="Швидкість хвилі, м/с" type="number" min="0" step="any"></div>
        <p class="muted small">ρ = 1 кг/м² · T = <span id="tension">1</span> Н/м<br>Нескінченна мембрана, без відбиттів.</p>
      </section>
      <section class="panel-block display-block">
        <div class="section-heading"><h2>Відображення</h2></div>
        <label for="quantity" class="control-label">Фізична величина</label>
        <select id="quantity"><option value="displacement">Миттєве зміщення u · м</option><option value="meanSquare">Середній квадрат ⟨u²⟩ · м²</option><option value="windowMean">Середній квадрат у вікні · м²</option></select>
        <div id="average-control"><label class="control-label" for="average-window">Вікно усереднення τ <span>с</span></label><input id="average-window" type="number" min="0.01" max="20" step="0.01"></div>
        <div class="two-controls"><label class="control-label" for="color-scale">Шкала u · авто<span>± мм<input id="color-scale" type="number" readonly></span></label><label class="control-label" for="height-scale">Висота g<span>×<input id="height-scale" type="number" min="1" max="500" step="1"></span></label></div>
        <p class="muted small">Найбільша активна амплітуда + 4 мм.</p>
        <label for="quality" class="control-label">Деталізація поверхні</label><select id="quality"><option value="low">Низька · 128 × 128</option><option value="medium">Середня · 256 × 256</option><option value="high">Висока · 512 × 512</option></select>
        <label class="check-row"><input id="grid" type="checkbox">Координатна сітка та рівень z = 0</label>
        <label class="check-row"><input id="section" type="checkbox">Графік перерізу</label>
        <p id="sampling-warning" class="notice" hidden></p>
      </section>
      <section class="panel-block utility-block"><button id="export" class="button ghost">Експорт JSON</button><button id="import" class="button ghost">Імпорт JSON</button><input id="import-file" type="file" accept="application/json,.json" hidden></section>
      <details class="panel-block help"><summary>Про модель і керування</summary><p>Плоскі та кругові гармонічні хвилі додаються за принципом суперпозиції. Кругові хвилі описує функція Ганкеля; амплітуда A задана на відстані 1 м. Диски r &lt; 0,05 м виключені з поля.</p><p>Колір показує фізичне зміщення. Висота 3D збільшена у g разів; для середнього квадрата висота показує g√⟨u²⟩. ⟨u²⟩ вимірюється в м², це не потік енергії.</p><p>Параметри змінюють стаціонарне поле без перехідного процесу. Для реальної мембрани потрібні малі фізичні нахили.</p><p>3D: перетягування — обертання, права кнопка / Shift — зміщення, колесо — масштаб. 2D: перетягування правою кнопкою — зміщення, колесо — масштаб.</p><p>Пробіл — пауза · → — один крок · H — панелі.</p><button id="validate" class="button ghost">Перевірити фізику на GPU</button><p id="validation-result" class="small muted" role="status"></p><a href="https://github.com/hamak-en/wawes" target="_blank" rel="noreferrer">Код і документація ↗</a></details>
    </aside>
    <main class="main-stage">
      <section class="visualization" aria-label="Візуалізація інтерференції">
        <div class="view-meta"><span class="live-dot"></span><span id="field-label">u(x, y, t)</span></div>
        <div id="viewport"><div id="loading" class="loading">Готуємо поле хвиль…</div></div>
        <div class="view-bottom"><div class="color-legend"><div id="legend-bar" class="legend-bar"></div><div class="legend-ticks"><span id="legend-low">−4 мм</span><span id="legend-zero">0</span><span id="legend-high">+4 мм</span></div></div><div class="view-tools"><span id="backend" class="backend-tag">Ініціалізація</span><span id="fps">— FPS</span><button id="reset-camera" class="text-button">↺ Камера</button></div></div>
      </section>
      <section id="section-panel" class="section-panel"><div class="plot-heading"><h2>Переріз <span>u(x, y₀, t)</span></h2><div class="plot-controls"><label for="section-y">y₀, м<input id="section-y" type="number" min="-5" max="5" step="0.1"></label><label class="check-row"><input id="contributions" type="checkbox">Окремі хвилі</label></div></div><div id="plot-legend" class="plot-legend"></div><canvas id="section-canvas" aria-label="Графік миттєвих внесків хвиль та їх суми вздовж x"></canvas></section>
    </main>
  </div><div id="toast" class="toast" role="status" aria-live="polite" hidden></div>`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
let scene = defaultScene();
let currentPreset: PresetId | null = 'sources';
let restoredError = '';
if (location.hash) {
  try { scene = decodeScene(location.hash); currentPreset = null; }
  catch { restoredError = 'Посилання на сцену некоректне. Відкрито початковий приклад.'; }
}
let renderer: WaveRenderer | undefined;
let time = scene.playback.time;
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string): void {
  const element = $('#toast'); element.textContent = message; element.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.hidden = true; }, 5500);
}
function snapshot(): SceneState { return { ...scene, playback: { ...scene.playback, time } }; }
const url = new UrlStore(snapshot, toast);
function setValue(selector: string, value: string | number): void { $<HTMLInputElement>(selector).value = String(value); }
function setChecked(selector: string, value: boolean): void { $<HTMLInputElement>(selector).checked = value; }

function numericWaveControl(w: Wave, property: string, label: string, unit: string, min: number, max: number, step: number, value: number): string {
  const extendable = property === 'amplitude' || property === 'frequency';
  const sliderMax = extendable ? Math.max(max, Math.ceil(value)) : max;
  return `<label class="control-label" for="${w.id}-${property}">${label}<span>${unit}</span></label><div class="range-row"><input id="${w.id}-${property}" data-property="${property}" type="range" min="${min}" max="${sliderMax}" step="${extendable ? 'any' : step}" value="${value}"><input aria-label="${label} хвилі ${scene.waves.indexOf(w) + 1}, ${unit}" data-property="${property}" type="number" min="${min}" ${extendable ? 'step="any"' : `max="${max}" step="${step}"`} value="${value}"></div>`;
}
function renderWaves(): void {
  $('#waves').innerHTML = scene.waves.map((w, i) => `<article class="wave-card ${w.enabled ? '' : 'disabled'}" data-wave="${w.id}" style="--wave-color:${WAVE_COLORS[i]}"><div class="wave-card-heading"><label class="wave-enabled"><input data-property="enabled" type="checkbox" ${w.enabled ? 'checked' : ''}><span class="wave-dot"></span><strong>Хвиля ${i + 1}</strong></label><div><button data-action="duplicate" class="mini-button" title="Дублювати хвилю ${i + 1}" aria-label="Дублювати хвилю ${i + 1}">⧉</button><button data-action="delete" class="mini-button delete" title="Видалити хвилю ${i + 1}" aria-label="Видалити хвилю ${i + 1}">×</button></div></div><select data-property="type" aria-label="Тип хвилі ${i + 1}"><option value="circular" ${w.type === 'circular' ? 'selected' : ''}>Кругова · точкове джерело</option><option value="plane" ${w.type === 'plane' ? 'selected' : ''}>Плоска · заданий напрямок</option></select>${numericWaveControl(w, 'amplitude', 'Амплітуда A', w.type === 'circular' ? 'мм на r = 1 м' : 'мм', 0, 5, 0.05, Number((w.amplitude * 1000).toFixed(6)))}${numericWaveControl(w, 'frequency', 'Частота f', 'Гц', 0.1, 2, 0.01, w.frequency)}<p class="wavelength">λ = <span data-wavelength>${(scene.speed / w.frequency).toFixed(3)}</span> м</p>${numericWaveControl(w, 'phase', 'Фаза φ при t = 0', '°', 0, 360, 1, Number((w.phase * 180 / Math.PI).toFixed(4)))}${w.type === 'plane' ? numericWaveControl(w, 'direction', 'Напрямок θ', '°', 0, 360, 1, Number((w.direction * 180 / Math.PI).toFixed(4))) : `<div class="two-controls"><label class="control-label">x, м<input data-property="x" type="number" min="-5" max="5" step="0.1" value="${w.x}"></label><label class="control-label">y, м<input data-property="y" type="number" min="-5" max="5" step="0.1" value="${w.y}"></label></div>`}</article>`).join('');
  if (!scene.waves.length) $('#waves').innerHTML = '<p class="empty-state">Поле спокійне. Додайте хвилю, щоб почати.</p>';
  $('#wave-count').textContent = `${scene.waves.length} / ${MAX_WAVES}`;
  for (const selector of ['#add-circular', '#add-plane']) $<HTMLButtonElement>(selector).disabled = scene.waves.length >= MAX_WAVES;
  renderPlotLegend();
}
function renderPlotLegend(): void {
  $('#plot-legend').innerHTML = '<span class="sum-key">━ Сума</span>' + (scene.display.contributions ? scene.waves.map((w, i) =>
    `<span style="color:${WAVE_COLORS[i]};opacity:${w.enabled ? 1 : 0.35}">━ Хвиля ${i + 1}</span>`).join('') : '');
}
function refresh(): void {
  scene.display.colorScale = colorScaleFor(scene.waves);
  document.body.classList.toggle('panels-hidden', !scene.display.panels);
  $('#panels').setAttribute('aria-pressed', String(scene.display.panels));
  $('#mode-2d').setAttribute('aria-pressed', String(scene.mode === '2d'));
  $('#mode-3d').setAttribute('aria-pressed', String(scene.mode === '3d'));
  setValue('#presets', currentPreset ?? '');
  $<HTMLInputElement>('#wave-speed').max = String(Math.max(3, scene.speed));
  setValue('#wave-speed', scene.speed); setValue('#wave-speed-number', scene.speed);
  $('#tension').textContent = (scene.speed ** 2).toFixed(2);
  setValue('#quantity', scene.display.quantity); setValue('#average-window', scene.display.averageWindow);
  $('#average-control').hidden = scene.display.quantity !== 'windowMean';
  setValue('#color-scale', Number((scene.display.colorScale * 1000).toPrecision(12))); setValue('#height-scale', scene.display.heightScale);
  setValue('#quality', scene.display.quality); setChecked('#grid', scene.display.grid); setChecked('#section', scene.display.section);
  setChecked('#contributions', scene.display.contributions); setValue('#section-y', scene.display.sectionY);
  $('#section-panel').hidden = !scene.display.section;
  setValue('#time-step', scene.playback.step);
  const select = $<HTMLSelectElement>('#playback-rate');
  if (![...select.options].some(option => Number(option.value) === scene.playback.rate)) {
    select.add(new Option(`${scene.playback.rate}×`, String(scene.playback.rate)));
  }
  setValue('#playback-rate', scene.playback.rate);
  $('#play-pause').textContent = scene.playback.paused ? '▶' : 'Ⅱ';
  $('#play-pause').setAttribute('aria-label', scene.playback.paused ? 'Відтворити' : 'Пауза');
  $('#play-pause').setAttribute('title', scene.playback.paused ? 'Відтворити (Пробіл)' : 'Пауза (Пробіл)');
  const instantaneous = scene.display.quantity === 'displacement';
  $('#field-label').textContent = instantaneous ? 'u(x, y, t) · миттєве зміщення' : scene.display.quantity === 'meanSquare' ? '⟨u²⟩ · нескінченний час' : `⟨u²⟩τ · τ = ${scene.display.averageWindow} с`;
  $('#legend-bar').classList.toggle('variance', !instantaneous);
  const scale = scene.display.colorScale * 1000;
  const scaleText = Number(scale.toPrecision(8));
  $('#legend-low').textContent = instantaneous ? `−${scaleText} мм` : '0';
  $('#legend-zero').textContent = instantaneous ? '0' : `${(scale ** 2 / 4).toFixed(2)} мм²`;
  $('#legend-high').textContent = instantaneous ? `+${scaleText} мм` : `${Number((scale ** 2).toPrecision(8))} мм²`;
  scene.waves.forEach(w => { const el = document.querySelector(`[data-wave="${w.id}"] [data-wavelength]`); if (el) el.textContent = (scene.speed / w.frequency).toFixed(3); });
  refreshSamplingNotice();
}
function refreshSamplingNotice(): void {
  const smallestWavelength = Math.min(...scene.waves.filter(w => w.enabled && w.amplitude > 0).map(w => scene.speed / w.frequency));
  const viewport = $('#viewport');
  const resolution = scene.mode === '3d'
    ? { low: 128, medium: 256, high: 512 }[scene.display.quality] / 10
    : Math.min(viewport.clientWidth, viewport.clientHeight) / 11.7 * scene.camera2d.zoom
      * Math.min(devicePixelRatio, scene.display.quality === 'low' ? 1 : 2);
  const notice = $('#sampling-warning'); notice.hidden = scene.speed === 0 || resolution * smallestWavelength >= 12;
  notice.textContent = scene.mode === '3d'
    ? 'Короткі хвилі не розрізняються за поточної деталізації. Підвищте деталізацію або зменште частоту.'
    : 'Короткі хвилі не розрізняються за поточного масштабу. Наблизьте поле або зменште частоту.';
}
function changed(physics = false, rebuild = false): void {
  if (physics) currentPreset = null;
  scene.playback.time = time;
  if (rebuild) renderWaves();
  refresh(); if (ready) renderer?.setState(scene); url.schedule();
}
function replaceScene(next: SceneState, preset: PresetId | null = null): void {
  scene = next; time = next.playback.time; currentPreset = preset;
  renderWaves(); refresh(); if (ready) renderer?.setState(scene, true); url.flush();
}
function togglePause(): void { scene.playback.paused = !scene.playback.paused; changed(); url.flush(); }
function step(): void { scene.playback.paused = true; time = Math.min(LIMITS.time[1], time + scene.playback.step); changed(); url.flush(); }

$('#waves').addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  const card = target.closest<HTMLElement>('[data-wave]'), property = target.dataset.property;
  if (!card || !property) return;
  const wave = scene.waves.find(w => w.id === card.dataset.wave)!;
  if (property === 'enabled') { wave.enabled = target.checked; changed(true, true); return; }
  if (property === 'type') { wave.type = target.value as Wave['type']; changed(true, true); return; }
  if (!target.validity.valid || target.value === '') return;
  let value = Number(target.value); if (!Number.isFinite(value)) return;
  if (property === 'amplitude') value /= 1000;
  if (property === 'phase' || property === 'direction') value *= Math.PI / 180;
  if ((property === 'amplitude' || property === 'frequency') && value > LIMITS[property][1]) return;
  const key = property as 'amplitude' | 'frequency' | 'phase' | 'direction' | 'x' | 'y';
  wave[key] = value;
  card.querySelectorAll<HTMLInputElement>(`[data-property="${property}"]`).forEach(input => {
    if (input !== target) {
      if (input.type === 'range' && (property === 'amplitude' || property === 'frequency'))
        input.max = String(Math.max(property === 'amplitude' ? 5 : 2, Math.ceil(Number(target.value))));
      input.value = target.value;
    }
  });
  changed(true);
});
$('#waves').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (!button) return;
  const id = button.closest<HTMLElement>('[data-wave]')!.dataset.wave;
  if (button.dataset.action === 'delete') scene.waves = scene.waves.filter(w => w.id !== id);
  else {
    if (scene.waves.length >= MAX_WAVES) { toast(`Дозволено до ${MAX_WAVES} хвиль.`); return; }
    scene.waves.push({ ...scene.waves.find(w => w.id === id)!, id: crypto.randomUUID() });
  }
  changed(true, true); url.flush();
});
$('#presets').addEventListener('change', event => {
  const id = (event.target as HTMLSelectElement).value as PresetId;
  if (!PRESETS.some(preset => preset.id === id)) return;
  const next = presetScene(id);
  next.mode = scene.mode; next.display.panels = scene.display.panels;
  replaceScene(next, id);
});
for (const type of ['circular', 'plane'] as const) $(`#add-${type}`).addEventListener('click', () => {
  if (scene.waves.length >= MAX_WAVES) return;
  scene.waves.push(newWave(type)); changed(true, true); url.flush();
});
for (const mode of ['2d', '3d'] as const) $(`#mode-${mode}`).addEventListener('click', () => { scene.mode = mode; changed(); url.flush(); });

function numberInput(selector: string, min: number, max: number, apply: (value: number) => void, physics = false): void {
  $<HTMLInputElement>(selector).addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (!input.value || !input.validity.valid) return;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < min || value > max) return;
    apply(value); changed(physics);
  });
}
numberInput('#wave-speed', ...LIMITS.speed, value => { scene.speed = value; }, true);
numberInput('#wave-speed-number', ...LIMITS.speed, value => { scene.speed = value; }, true);
numberInput('#height-scale', ...LIMITS.heightScale, value => { scene.display.heightScale = value; });
numberInput('#average-window', ...LIMITS.window, value => { scene.display.averageWindow = value; });
numberInput('#time-step', ...LIMITS.step, value => { scene.playback.step = value; });
numberInput('#section-y', ...LIMITS.position, value => { scene.display.sectionY = value; });
$('#quantity').addEventListener('change', event => { scene.display.quantity = (event.target as HTMLSelectElement).value as SceneState['display']['quantity']; changed(); });
$('#quality').addEventListener('change', event => { scene.display.quality = (event.target as HTMLSelectElement).value as SceneState['display']['quality']; changed(); });
$('#playback-rate').addEventListener('change', event => { scene.playback.rate = Number((event.target as HTMLSelectElement).value); changed(); });
for (const key of ['grid', 'section', 'contributions'] as const) $(`#${key}`).addEventListener('change', event => {
  scene.display[key] = (event.target as HTMLInputElement).checked; changed(); renderPlotLegend();
});
$('#play-pause').addEventListener('click', togglePause); $('#step').addEventListener('click', step);
$('#reset-time').addEventListener('click', () => { time = 0; changed(); url.flush(); });
$('#reset-camera').addEventListener('click', () => { renderer?.resetCamera(); url.flush(); });
$('#panels').addEventListener('click', () => { scene.display.panels = !scene.display.panels; changed(); url.flush(); });
$('#copy-link').addEventListener('click', async () => {
  url.flush();
  try { await navigator.clipboard.writeText(location.href); toast('Посилання скопійовано. Пауза зберігає точний кадр.'); }
  catch {
    // A selectable dialog also works offline and in browsers without the Clipboard API.
    const dialog = document.createElement('dialog'); dialog.className = 'link-dialog';
    const label = document.createElement('label'); label.textContent = 'Скопіюйте посилання на сцену';
    const input = document.createElement('textarea'); input.value = location.href; input.readOnly = true; label.append(input);
    const close = document.createElement('button'); close.textContent = 'Закрити'; close.className = 'button accent';
    close.addEventListener('click', () => dialog.close()); dialog.append(label, close); document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove()); dialog.showModal(); input.select();
  }
});
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(validateScene(snapshot()), null, 2)], { type: 'application/json' });
  const link = document.createElement('a'), objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl; link.download = 'wawes-scene.json'; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
});
$('#import').addEventListener('click', () => $<HTMLInputElement>('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 9000) throw new Error('JSON-файл перевищує 9000 байтів.');
    const next = validateScene(JSON.parse(await file.text()));
    if (!next.playback.paused) next.playback.time = 0;
    replaceScene(next); toast('Сцену імпортовано.');
  } catch (error) { toast(error instanceof Error ? `Не вдалося імпортувати: ${error.message}` : 'Не вдалося імпортувати сцену.'); }
  input.value = '';
});
$('#validate').addEventListener('click', async () => {
  if (!renderer) return;
  const button = $<HTMLButtonElement>('#validate'); button.disabled = true;
  $('#validation-result').textContent = 'Порівнюємо числові поля GPU та CPU…';
  try {
    const report = await renderer.validate(validationScenes());
    $('#validation-result').textContent = `${report.passed ? '✓ Перевірку пройдено' : '✕ Є розбіжності'} · ${report.backend} · ${report.samples} точок · максимальна нормована похибка ${report.maxAbsoluteError.toExponential(2)}.`;
  } catch (error) { $('#validation-result').textContent = `Перевірка недоступна: ${error instanceof Error ? error.message : 'помилка GPU'}`; }
  finally { button.disabled = false; }
});
document.addEventListener('change', () => url.flush());
document.addEventListener('pointerup', () => url.flush());
document.addEventListener('keydown', event => {
  if ((event.target as HTMLElement).matches('input, select, textarea, button, summary') || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.code === 'Space') { event.preventDefault(); togglePause(); }
  if (event.code === 'ArrowRight') { event.preventDefault(); step(); }
  if (event.key.toLowerCase() === 'h') $('#panels').click();
});
window.addEventListener('hashchange', () => {
  try { replaceScene(location.hash ? decodeScene(location.hash) : defaultScene()); }
  catch { toast('Некоректне посилання. Поточну сцену збережено.'); }
});
window.addEventListener('pagehide', () => url.flush());
document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); if (document.hidden) url.flush(); });

renderWaves(); refresh(); if (restoredError) toast(restoredError);
let lastFrame = performance.now(), fpsStart = lastFrame, frames = 0, lastPlot = 0;
let ready = false;
async function start(): Promise<void> {
  try {
    renderer = new WaveRenderer($('#viewport'), camera => {
      if (scene.mode === '3d') scene.camera = camera; else scene.camera2d = camera;
      refreshSamplingNotice();
      url.schedule();
    }, new URLSearchParams(location.search).get('backend') === 'webgl');
    await renderer.init(scene); renderer.setState(scene, true); $('#loading').remove(); $('#backend').textContent = renderer.backend;
    url.flush(); ready = true; lastFrame = fpsStart = performance.now();
    renderer.renderer.setAnimationLoop(() => {
      const now = performance.now(), dt = Math.max(0, (now - lastFrame) / 1000); lastFrame = now;
      if (document.hidden) return;
      if (!scene.playback.paused) {
        time = Math.min(LIMITS.time[1], time + dt * scene.playback.rate);
        if (time >= LIMITS.time[1]) { scene.playback.paused = true; changed(); url.flush(); }
      }
      renderer!.render(time); frames++;
      if (now - fpsStart >= 1000) {
        const fps = frames * 1000 / (now - fpsStart); $('#fps').textContent = `${fps.toFixed(0)} FPS`;
        $('#fps').classList.toggle('slow', fps < 30); frames = 0; fpsStart = now;
      }
      if (now - lastPlot > 66) {
        $('#time').textContent = time.toFixed(2);
        if (scene.display.section) {
          drawSection($<HTMLCanvasElement>('#section-canvas'), scene, time);
        }
        lastPlot = now;
      }
    });
  } catch (error) {
    renderer?.dispose(); renderer = undefined;
    const loading = document.createElement('div'); loading.className = 'loading error';
    loading.textContent = 'Не вдалося запустити графіку. Потрібен браузер з WebGPU або WebGL 2. Спробуйте сучасний Chrome, Edge, Firefox або Safari.';
    $('#viewport').append(loading); $('#backend').textContent = 'GPU недоступний';
    console.error(error);
  }
}
void start();
window.addEventListener('resize', refreshSamplingNotice);

// Explicit QA mode exposes state/readback for automated tests, never any server or browser-local persistence.
if (new URLSearchParams(location.search).has('qa')) {
  Object.assign(window, { wawes: {
    get ready() { return ready; }, get state() { return snapshot(); }, get backend() { return renderer?.backend; },
    get camera() { return renderer?.cameraState(); },
    load: (next: unknown) => replaceScene(validateScene(next)),
    sample: (x: number, y: number) => sampleField(snapshot(), x, y),
    validate: () => renderer!.validate(validationScenes()),
  } });
}
