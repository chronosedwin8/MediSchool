import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    coverage: { provider: 'v8', include: ['src/modules/**', 'src/common/**'], reporter: ['text-summary', 'html'] },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
