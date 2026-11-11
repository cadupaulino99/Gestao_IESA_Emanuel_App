#!/usr/bin/env python3
from pathlib import Path

# deploy-worker-api.mjs — always ensure R2 binding
p = Path('scripts/deploy-worker-api.mjs')
t = p.read_text()
needle = '''if (!nextBindings.some((b) => b.name === 'PROJECT_ID')) {
  nextBindings.push({ type: 'plain_text', name: 'PROJECT_ID', text: PROJECT_ID });
}'''
insert = '''if (!nextBindings.some((b) => b.name === 'PROJECT_ID')) {
  nextBindings.push({ type: 'plain_text', name: 'PROJECT_ID', text: PROJECT_ID });
}
// Garantir R2 — se o GET settings não devolver o binding, o PUT anterior podia tirá-lo
if (!nextBindings.some((b) => b.name === 'POSTERS_BUCKET')) {
  nextBindings.push({ type: 'r2_bucket', name: 'POSTERS_BUCKET', bucket_name: 'iesa-event-posters' });
  console.log('→ Binding R2 forçado: POSTERS_BUCKET → iesa-event-posters');
} else {
  // Normalizar tipo/nome do bucket
  const idx = nextBindings.findIndex((b) => b.name === 'POSTERS_BUCKET');
  if (idx >= 0) {
    nextBindings[idx] = { type: 'r2_bucket', name: 'POSTERS_BUCKET', bucket_name: 'iesa-event-posters' };
  }
  console.log('→ Binding R2 presente: POSTERS_BUCKET → iesa-event-posters');
}'''
if needle in t and 'Binding R2 forçado' not in t:
    t = t.replace(needle, insert)
    p.write_text(t)
    print('deploy script R2 force')
else:
    print('deploy script skip or already')

# worker health + version
w = Path('worker/ai-worker.js')
wt = w.read_text()
wt = wt.replace("const WORKER_VERSION = '2.13.0';", "const WORKER_VERSION = '2.13.1';")
wt = wt.replace(
    "const WORKER_BUILD = '2026-11-11 (R2 cartazes /admin/upload-poster + /media)';",
    "const WORKER_BUILD = '2026-11-11 (R2 binding forçado + health.r2)';",
)
old_cfg = '''        config: {
          GEMINI_API_KEY: !!env.GEMINI_API_KEY,
          FIREBASE_SA_JSON: !!env.FIREBASE_SA_JSON,
          PROJECT_ID: env.PROJECT_ID || null,
        },'''
new_cfg = '''        config: {
          GEMINI_API_KEY: !!env.GEMINI_API_KEY,
          FIREBASE_SA_JSON: !!env.FIREBASE_SA_JSON,
          PROJECT_ID: env.PROJECT_ID || null,
          POSTERS_BUCKET: !!env.POSTERS_BUCKET,
        },
        r2: {
          bound: !!env.POSTERS_BUCKET,
          binding: 'POSTERS_BUCKET',
          bucket: 'iesa-event-posters',
        },'''
if old_cfg in wt:
    wt = wt.replace(old_cfg, new_cfg)
    print('health r2')
else:
    print('WARN health cfg')

# routes list
if "'/admin/upload-poster'" not in wt:
    wt = wt.replace(
        "'/admin/delete-signup-account',",
        "'/admin/delete-signup-account',\n          '/admin/upload-poster',\n          '/media/*',",
    )
    print('routes')
w.write_text(wt)
print('DONE')
