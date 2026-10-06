import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: { rollupOptions: { input: {
    landing: fileURLToPath(new URL('./index.html', import.meta.url)),
    app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
  } } },
});
