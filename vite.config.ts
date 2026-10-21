import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // base relativo: garante que os assets carregam dentro da WebView do
    // Capacitor (https://localhost) e em qualquer subpasta de hosting web.
    base: './',
    plugins: [
      react(),
      tailwindcss(),
    ],
    // Versao da app injetada no bundle (lida pelo aviso de atualizacao)
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
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
