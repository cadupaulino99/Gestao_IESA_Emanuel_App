#!/usr/bin/env node
/**
 * worker-health.mjs — diz qual versão do Cloudflare Worker está publicada.
 *
 *   node scripts/worker-health.mjs
 *
 * Saída esperada (Worker novo):
 *   { ok: true, version: '2.0.0', vision: true, routes: [...], config: {...} }
 *
 * Se devolver 404 "Rota nao encontrada" → o Worker no ar é ANTERIOR à v2.0.0
 * e não tem as rotas de leitura do BI. Publique-o de novo:
 *   npx wrangler deploy --config worker/wrangler.toml
 */
const URL = process.env.WORKER_URL || 'https://iesa-ai.cadupaulino99.workers.dev';

try {
  const r = await fetch(`${URL}/__health`);
  const txt = await r.text();
  let j = null;
  try { j = JSON.parse(txt); } catch { /* não-JSON */ }
  console.log(`GET ${URL}/__health → HTTP ${r.status}`);
  if (j) {
    console.log(JSON.stringify(j, null, 2));
    if (j.version) {
      console.log(`\n✅ Worker no ar: v${j.version} (build ${j.build || '?'})`);
      console.log(j.vision ? '✅ Tem leitura de documentos (visão).' : '❌ SEM leitura de documentos.');
      const cfg = j.config || {};
      if (cfg.GEMINI_API_KEY === false) console.log('❗ Falta o segredo GEMINI_API_KEY.');
      if (cfg.FIREBASE_SA_JSON === false) console.log('❗ Falta o segredo FIREBASE_SA_JSON.');
      if (!cfg.PROJECT_ID) console.log('❗ Falta a variável PROJECT_ID.');
      process.exit(0);
    }
  } else {
    console.log(txt.slice(0, 400));
  }
  console.log('\n❌ O Worker no ar é ANTIGO (sem /__health). Re-publique worker/ai-worker.js.');
  process.exit(1);
} catch (e) {
  console.error(`❌ Não foi possível contactar ${URL}: ${e.message}`);
  process.exit(1);
}
