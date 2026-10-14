import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

export default defineConfig({
  testDir: './tests/e2e', timeout: 60000, fullyParallel: false, workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 },
    launchOptions: {
      ...(env.E2E_CHROME ? { executablePath: env.E2E_CHROME } : {}),
      args: env.E2E_CHROME ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [{ name: 'webgl' }, ...(env.E2E_WEBGPU ? [{ name: 'webgpu' }] : [])],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !env.CI },
});
