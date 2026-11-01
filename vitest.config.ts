import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // Funções puras correm em 'node' (rápido); os testes de componentes
    // declaram `// @vitest-environment jsdom` no topo do ficheiro.
    environment: 'node',
    globals: true, // o auto-cleanup do Testing Library precisa do afterEach global
    /* v1.19.0 (P3): também os testes do Worker (Cloudflare) — até aqui o
       ficheiro mais crítico do sistema só tinha `node --check` no CI. */
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'worker/**/*.test.js', 'scripts/**/*.test.mjs'],
    setupFiles: ['src/test/setup.ts'],
    reporters: ['default'],
  },
});
