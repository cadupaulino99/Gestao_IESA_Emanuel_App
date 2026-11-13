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
    build: {
      // Code-splitting: vendors pesados em ficheiros separados (cache HTTP longo no Hosting)
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('jspdf') || id.includes('xlsx') || id.includes('sheetjs')) return 'vendor-export';
            if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'vendor-ui';
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router')) return 'vendor-react';
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
  };
});
