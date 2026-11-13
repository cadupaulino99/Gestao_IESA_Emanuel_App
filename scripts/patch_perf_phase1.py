#!/usr/bin/env python3
from pathlib import Path

# ── App.tsx ───────────────────────────────────────────────────────────────
p = Path('src/App.tsx')
t = p.read_text()

t = t.replace(
    "import Dashboard from './pages/Dashboard';",
    "const Dashboard = lazy(() => import('./pages/Dashboard'));",
)

old_qc = 'const queryClient = new QueryClient();'
new_qc = '''const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Igreja local: dados mudam pouco; evita refetch ao mudar de separador
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});'''
if old_qc in t:
    t = t.replace(old_qc, new_qc)
    print('QueryClient defaults')
else:
    print('WARN QueryClient')

old_fb = '''const PageFallback = () => (
  <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
  </div>
);'''
new_fb = '''const PageFallback = () => (
  <div className="mx-auto w-full max-w-3xl space-y-4 p-4 py-10" aria-busy="true" aria-label="A carregar">
    <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
    </div>
    <div className="h-40 animate-pulse rounded-xl bg-muted" />
    <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
    </div>
  </div>
);'''
if old_fb in t:
    t = t.replace(old_fb, new_fb)
    print('PageFallback skeleton')
else:
    print('WARN PageFallback')

p.write_text(t)

# ── vite.config.ts ────────────────────────────────────────────────────────
v = Path('vite.config.ts')
vt = v.read_text()
if 'manualChunks' not in vt:
    vt = vt.replace(
        '''    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});''',
        '''    server: {
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
});''',
    )
    v.write_text(vt)
    print('vite manualChunks')
else:
    print('vite already chunked')

print('DONE')
