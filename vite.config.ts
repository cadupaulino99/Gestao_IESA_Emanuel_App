import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import pkg from './package.json';

export default defineConfig(() => {
  return {
    // base absoluto: Firebase Hosting + Capacitor (origem https://localhost).
    // Com base './', rotas profundas no hosting quebram os assets (/finances/assets/...).
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
    ],
    // Versao da app injetada no bundle (lida pelo aviso de atualizacao)
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
