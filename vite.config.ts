import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] }, server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' } });
