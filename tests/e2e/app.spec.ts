import { test, expect } from '@playwright/test';
import type { SceneState } from '../../src/state';
import type { ValidationReport } from '../../src/render/renderer';
import type { FieldSample } from '../../src/physics/model';
import { readFile } from 'node:fs/promises';

declare global {
  interface Window {
    wawes: { ready: boolean; state: SceneState; backend: string; camera: SceneState['camera'];
      load: (state: SceneState) => void; sample: (x: number, y: number) => FieldSample | null;
      validate: () => Promise<ValidationReport> };
  }
}

test.beforeEach(async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/?qa=1${info.project.name === 'webgl' ? '&backend=webgl' : ''}`);
  await page.waitForFunction(() => window.wawes?.ready);
  expect(await page.evaluate(() => window.wawes.backend)).toBe(info.project.name === 'webgl' ? 'WebGL 2' : 'WebGPU');
  (page as typeof page & { appErrors: string[] }).appErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as typeof page & { appErrors: string[] }).appErrors).toEqual([]);
});

test('GPU fields match the CPU before conversion to color or height', async ({ page }) => {
  const report = await page.evaluate(() => window.wawes.validate());
  const { cases: _cases, ...summary } = report; console.log(JSON.stringify(summary));
  expect(report.passed).toBe(true); expect(report.samples).toBeGreaterThan(12000);
  expect(report.maxAbsoluteError).toBeLessThan(0.0005);
  await page.getByRole('button', { name: '3D поверхня' }).click();
  await expect(page.locator('#mode-3d')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#quantity').selectOption('meanSquare');
  await page.locator('#quantity').selectOption('windowMean');
  await page.locator('#average-window').fill('0.63');
  await page.waitForTimeout(300);
  await expect(page.locator('#field-label')).toContainText('τ = 0.63');
});

test('source controls add, duplicate, disable, edit and remove waves', async ({ page }) => {
  const historyLength = await page.evaluate(() => history.length);
  await page.locator('#play-pause').click();
  await page.getByRole('button', { name: '＋ Плоска', exact: true }).click();
  await expect(page.locator('.wave-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Дублювати хвилю 3', exact: true }).click();
  await expect(page.locator('.wave-card')).toHaveCount(4);
  await page.locator('.wave-card').last().locator('[data-property=enabled]').uncheck();
  expect(await page.evaluate(() => window.wawes.state.waves[3].enabled)).toBe(false);
  await page.locator('.wave-card').first().locator('input[type=number][data-property=amplitude]').fill('2');
  expect(await page.evaluate(() => window.wawes.state.waves[0].amplitude)).toBe(0.002);
  await page.getByRole('button', { name: 'Видалити хвилю 2', exact: true }).click();
  await expect(page.locator('.wave-card')).toHaveCount(3);
  await page.getByLabel('Навчальні сцени').selectOption('opposite');
  expect(Math.abs((await page.evaluate(() => window.wawes.sample(0.13, 0.27)))!.displacement)).toBeLessThan(1e-12);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});

test('a paused frame, parameters and both cameras restore in an independent browser context', async ({ page, browser }) => {
  await page.locator('#play-pause').click();
  await page.locator('#step').click();
  await page.getByRole('button', { name: '3D поверхня' }).click();
  const box = (await page.locator('#viewport canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 63, box.y + box.height / 2 + 25, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, -120);
  await page.mouse.down({ button: 'right' }); await page.mouse.move(box.x + box.width / 2 + 93, box.y + box.height / 2 + 15, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  await page.locator('#mode-2d').click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -120);
  await page.mouse.down({ button: 'right' }); await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 15, { steps: 3 });
  await page.mouse.up({ button: 'right' }); await page.locator('#mode-3d').click();
  await page.locator('#height-scale').fill('143');
  await page.locator('#section-y').fill('-2'); await page.locator('#quantity').selectOption('windowMean');
  await page.locator('#average-window').fill('0.77');
  await page.locator('#waves').click(); // Ends the number interaction and flushes URL.
  const state = await page.evaluate(() => window.wawes.state);
  const field = await page.evaluate(() => window.wawes.sample(0.17, -0.91));
  expect(state.camera.position).not.toEqual([9, -11, 10]);
  const context = await browser.newContext(), other = await context.newPage();
  await other.goto(page.url()); await other.waitForFunction(() => window.wawes?.ready);
  expect(await other.evaluate(() => window.wawes.state)).toEqual(state);
  const camera = await other.evaluate(() => window.wawes.camera);
  camera.position.forEach((v, i) => expect(v).toBeCloseTo(state.camera.position[i], 10));
  camera.target.forEach((v, i) => expect(v).toBeCloseTo(state.camera.target[i], 10)); expect(camera.zoom).toBe(state.camera.zoom);
  expect(await other.evaluate(() => window.wawes.sample(0.17, -0.91))).toEqual(field);
  await other.locator('#mode-2d').click();
  const flatCamera = await other.evaluate(() => window.wawes.camera);
  flatCamera.position.forEach((v, i) => expect(v).toBeCloseTo(state.camera2d.position[i], 10));
  flatCamera.target.forEach((v, i) => expect(v).toBeCloseTo(state.camera2d.target[i], 10)); expect(flatCamera.zoom).toBe(state.camera2d.zoom);
  await context.close();
});

test('playing URLs freeze settings at zero time, invalid URLs recover, and JSON files round-trip', async ({ page }) => {
  await page.locator('#wave-speed-number').fill('1.5'); await page.locator('#waves').click();
  const urlTime = await page.evaluate(() => JSON.parse(atob(location.hash.slice(7).replaceAll('-', '+').replaceAll('_', '/'))).playback.time);
  expect(urlTime).toBe(0);
  await page.locator('#play-pause').click();
  const state = await page.evaluate(() => window.wawes.state);
  const downloaded = page.waitForEvent('download'); await page.locator('#export').click();
  const download = await downloaded;
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(state);
  await page.locator('#import-file').setInputFiles({ name: 'scene.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  expect(await page.evaluate(() => window.wawes.state)).toEqual(state);
  await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  expect(await page.evaluate(() => window.wawes.state)).toEqual(state);
  await expect(page.locator('#toast')).toContainText('Не вдалося імпортувати');
  await page.goto(page.url().split('#')[0] + '#scene=broken!'); await page.reload(); await page.waitForFunction(() => window.wawes?.ready);
  await expect(page.locator('#toast')).toContainText('Посилання на сцену некоректне');
  await expect(page.locator('.wave-card')).toHaveCount(2);
});

test('presentation mode, keyboard controls and mobile layout work', async ({ page }) => {
  await expect(page.locator('#fullscreen')).toHaveCount(0);
  await expect(page.locator('#fit-section')).toHaveCount(0);
  await page.locator('#viewport canvas').focus(); await page.keyboard.press('Space');
  await page.keyboard.press('f');
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await page.evaluate(() => window.wawes.state.playback.paused)).toBe(true);
  const time = await page.evaluate(() => window.wawes.state.playback.time);
  await page.keyboard.press('ArrowRight'); expect(await page.evaluate(() => window.wawes.state.playback.time)).toBeCloseTo(time + 0.01, 10);
  const section = page.locator('#section-panel');
  const sectionBox = (await section.boundingBox())!;
  expect(sectionBox.y + sectionBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.keyboard.press('h'); await expect(page.locator('.sidebar')).toBeHidden();
  await expect(section).toBeVisible();
  const expandedSectionBox = (await section.boundingBox())!;
  expect(expandedSectionBox.y + expandedSectionBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.keyboard.press('h'); await expect(page.locator('.sidebar')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('top-bar-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('#mode-3d')).toBeVisible(); await expect(page.locator('#play-pause')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('top-bar-mobile.png') });
});

test('larger numeric fields update both the color scale and the shareable scene', async ({ page, browser }) => {
  await page.locator('#play-pause').click();
  const wave = page.locator('.wave-card').first();
  const amplitude = wave.locator('input[type=number][data-property=amplitude]');
  const frequency = wave.locator('input[type=number][data-property=frequency]');
  expect(await amplitude.getAttribute('max')).toBeNull();
  expect(await frequency.getAttribute('max')).toBeNull();
  await amplitude.fill('20.125'); await frequency.fill('12.3456');
  await expect(amplitude).toHaveValue('20.125'); await expect(frequency).toHaveValue('12.3456');
  await expect(page.locator('#legend-low')).toHaveText('−24.125 мм');
  await expect(page.locator('#legend-high')).toHaveText('+24.125 мм');
  await expect(page.locator('#color-scale')).toHaveValue('24.125');
  expect(await page.locator('#color-scale').evaluate((input: HTMLInputElement) => input.readOnly)).toBe(true);
  expect(Number(await wave.locator('input[type=range][data-property=amplitude]').getAttribute('max'))).toBeGreaterThanOrEqual(20.125);
  expect(Number(await wave.locator('input[type=range][data-property=frequency]').getAttribute('max'))).toBeGreaterThanOrEqual(12.3456);
  await page.locator('#viewport canvas').click();
  const state = await page.evaluate(() => window.wawes.state);
  expect(state.waves[0].amplitude).toBe(0.020125);
  expect(state.waves[0].frequency).toBe(12.3456);
  await page.screenshot({ path: test.info().outputPath('larger-inputs.png') });
  const context = await browser.newContext(), other = await context.newPage();
  await other.goto(page.url()); await other.waitForFunction(() => window.wawes?.ready);
  expect(await other.evaluate(() => window.wawes.state)).toEqual(state);
  await expect(other.locator('#legend-high')).toHaveText('+24.125 мм');
  await context.close();
  await wave.locator('[data-property=enabled]').uncheck();
  await expect(page.locator('#legend-high')).toHaveText('+5 мм');
});

test('scrolling the sidebar leaves the visualization and main column in place', async ({ page }) => {
  const sidebar = page.locator('.sidebar');
  const box = (await sidebar.boundingBox())!, canvas = (await page.locator('#viewport').boundingBox())!;
  expect(await sidebar.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.mouse.move(box.x + box.width / 2, box.y + 150); await page.mouse.wheel(0, 700);
  await expect.poll(() => sidebar.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const after = (await page.locator('#viewport').boundingBox())!;
  expect(after.y).toBe(canvas.y);
  expect(await page.locator('.main-stage').evaluate(element => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: test.info().outputPath('sidebar-scroll.png') });
});

test('speed accepts zero, small decimals and values above the slider range', async ({ page }) => {
  const input = page.locator('#wave-speed-number');
  for (const speed of [5, 0.001, 0]) {
    await input.fill(String(speed));
    expect(await page.evaluate(() => window.wawes.state.speed)).toBe(speed);
    await expect(page.locator('#wave-speed')).toHaveValue(String(speed));
  }
  await page.locator('#play-pause').click(); // Flush the edited scene to the shareable URL.
  await expect(page.locator('#tension')).toHaveText('0.00');
  await expect(page.locator('#sampling-warning')).toBeHidden();
  await page.reload(); await page.waitForFunction(() => window.wawes?.ready);
  await expect(input).toHaveValue('0');
  expect(await page.evaluate(() => window.wawes.state.speed)).toBe(0);
});

test('longitudinal particles, projections, presets and shared state work', async ({ page, browser }) => {
  await page.locator('#play-pause').click();
  await page.getByLabel('Тип коливань').selectOption('longitudinal');
  await expect(page.locator('#gain-label')).toHaveText('Рух частинок g');
  await expect(page.locator('#section-formula')).toHaveText('uₓ(x, y₀, t)');
  await expect(page.locator('#membrane-description')).toBeHidden();
  await expect(page.locator('#longitudinal-medium')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('longitudinal-circular.png') });
  await page.getByLabel('Навчальні сцени').selectOption('inPhase');
  expect(await page.evaluate(() => window.wawes.state.polarization)).toBe('longitudinal');
  await page.locator('#play-pause').click();
  await page.locator('#reset-time').click();
  expect(await page.evaluate(() => window.wawes.sample(0, 0)?.displacement)).toBeCloseTo(0.002, 10);
  const wave = page.locator('.wave-card').first();
  await wave.locator('input[type=number][data-property=direction]').fill('90');
  await page.locator('#viewport canvas').click();
  expect(await page.evaluate(() => window.wawes.sample(0, 0)?.displacement)).toBeCloseTo(0.001, 10);
  await page.screenshot({ path: test.info().outputPath('longitudinal-2d.png') });
  await expect(page.locator('#quantity')).toBeHidden();
  await page.locator('#mode-3d').click();
  await page.locator('#step').click();
  await page.screenshot({ path: test.info().outputPath('longitudinal-3d.png') });
  const state = await page.evaluate(() => window.wawes.state);
  const context = await browser.newContext(), other = await context.newPage();
  await other.goto(page.url()); await other.waitForFunction(() => window.wawes?.ready);
  expect(await other.evaluate(() => window.wawes.state)).toEqual(state);
  await expect(other.getByLabel('Тип коливань')).toHaveValue('longitudinal');
  await context.close();
  await page.getByLabel('Тип коливань').selectOption('transverse');
  await expect(page.locator('#gain-label')).toHaveText('Висота g');
  await expect(page.locator('#membrane-description')).toBeVisible();
});

test('all longitudinal views render, step and restore their controls', async ({ page }) => {
  await page.getByLabel('Тип коливань').selectOption('longitudinal');
  await page.getByLabel('Вигляд поздовжньої хвилі').selectOption('tracer');
  await page.locator('#play-pause').click();
  await page.screenshot({ path: test.info().outputPath('view-symmetry-trails.png') });
  await page.getByLabel('Навчальні сцени').selectOption('standing');
  await page.locator('#play-pause').click(); await page.locator('#reset-time').click();
  for (const view of ['particles', 'spring', 'arrows', 'tracer']) {
    await page.getByLabel('Вигляд поздовжньої хвилі').selectOption(view);
    if (view === 'tracer') {
      await page.locator('#tracer-x').fill('0.3'); await page.locator('#tracer-y').fill('-0.2');
    }
    await page.locator('#step').click();
    await page.locator('.sidebar').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: test.info().outputPath(`view-${view}.png`) });
    await expect(page.locator('#quantity')).toBeHidden();
    await expect(page.locator('#height-scale')).toBeEnabled();
  }
  await page.locator('#step').click(); // Persist point coordinates and paused time before reload.
  const state = await page.evaluate(() => window.wawes.state);
  await page.reload(); await page.waitForFunction(() => window.wawes?.ready);
  expect(await page.evaluate(() => window.wawes.state)).toEqual(state);
  await expect(page.getByLabel('Вигляд поздовжньої хвилі')).toHaveValue('tracer');
  await expect(page.locator('#tracer-x')).toHaveValue('0.3');
  await expect(page.locator('#tracer-y')).toHaveValue('-0.2');
  await page.locator('#mode-3d').click();
  await page.getByLabel('Вигляд поздовжньої хвилі').selectOption('tracer');
  await page.locator('#step').click();
  await page.screenshot({ path: test.info().outputPath('view-trajectories-3d.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: test.info().outputPath('view-mobile.png') });
});

test('averaging modes are available only for transverse waves, including legacy scenes', async ({ page }) => {
  await page.locator('#quantity').selectOption('windowMean');
  await expect(page.locator('#average-window')).toBeVisible();
  await page.getByLabel('Тип коливань').selectOption('longitudinal');
  await expect(page.locator('#quantity-controls')).toBeHidden();
  await expect(page.locator('#average-window')).toBeHidden();
  expect(await page.evaluate(() => window.wawes.state.display.quantity)).toBe('displacement');
  for (const view of ['particles', 'spring', 'arrows', 'tracer']) {
    await page.locator('#longitudinal-view').selectOption(view);
    await expect(page.locator('#quantity')).toBeHidden();
  }
  await page.evaluate(() => { const scene=window.wawes.state; scene.display.quantity='meanSquare'; window.wawes.load(scene); });
  expect(await page.evaluate(() => window.wawes.state.display.quantity)).toBe('displacement');
  await expect(page.locator('#legend-high')).toContainText('мм');
  await page.getByLabel('Тип коливань').selectOption('transverse');
  await expect(page.locator('#quantity')).toBeVisible();
  await page.locator('#quantity').selectOption('windowMean');
  await expect(page.locator('#average-window')).toBeVisible();
});
