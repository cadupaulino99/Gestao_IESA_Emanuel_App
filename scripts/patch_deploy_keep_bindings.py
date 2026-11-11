#!/usr/bin/env python3
from pathlib import Path
p = Path('scripts/deploy-worker-api.mjs')
t = p.read_text()
old = '''const nextBindings = [];
for (const b of bindings.filter((x) => x && x.name)) {
  if (b.type === 'secret_text') {
    const text = ENV_SECRET[b.name];
    if (!text) {
      fail(`O binding "${b.name}" é um Secret e o upload exige o valor, mas ele não está no ambiente.`,
        `  → export ${b.name}=<valor>  (ou WORKER_SECRET_${b.name}) antes de correr este script.\n  → Sem isto o deploy removeria o segredo do Worker.`);
    }
    nextBindings.push({ type: 'secret_text', name: b.name, text });
  } else {
    nextBindings.push({ ...b });
  }
}
if (!nextBindings.some((b) => b.name === 'PROJECT_ID')) {
  nextBindings.push({ type: 'plain_text', name: 'PROJECT_ID', text: PROJECT_ID });
}

const COMPAT = settings?.compatibility_date || '2026-01-01';
const form = new FormData();
form.append(
  'metadata',
  new Blob([JSON.stringify({ main_module: 'ai-worker.js', compatibility_date: COMPAT, bindings: nextBindings })],
    { type: 'application/json' })
);'''

new = '''const nextBindings = [];
let missingSecretValues = [];
for (const b of bindings.filter((x) => x && x.name)) {
  if (b.type === 'secret_text') {
    const text = ENV_SECRET[b.name];
    if (text) {
      nextBindings.push({ type: 'secret_text', name: b.name, text });
    } else {
      // Valor não está no CI — preservar o secret já existente no Worker
      missingSecretValues.push(b.name);
    }
  } else {
    nextBindings.push({ ...b });
  }
}
if (!nextBindings.some((b) => b.name === 'PROJECT_ID')) {
  nextBindings.push({ type: 'plain_text', name: 'PROJECT_ID', text: PROJECT_ID });
}

const COMPAT = settings?.compatibility_date || '2026-01-01';
const metadata = {
  main_module: 'ai-worker.js',
  compatibility_date: COMPAT,
  bindings: nextBindings,
};
// Cloudflare: mantém secrets já no Worker quando o CI não tem o valor em claro
if (missingSecretValues.length) {
  metadata.keep_bindings = ['secret_text'];
  console.log(`→ Preservar secrets existentes (keep_bindings): ${missingSecretValues.join(', ')}`);
}
const form = new FormData();
form.append(
  'metadata',
  new Blob([JSON.stringify(metadata)], { type: 'application/json' })
);'''

if old not in t:
    raise SystemExit('deploy block not found')
p.write_text(t.replace(old, new))
print('OK')
