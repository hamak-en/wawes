import { defineConfig } from 'vite';
import { env } from 'node:process';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? (env.PAGES_BASE_PATH ?? (env.GITHUB_ACTIONS ? '/wawes/' : './')) : '/',
  build: { target: 'es2022' },
}));
