#!/usr/bin/env node
/**
 * deploy-worker-api.mjs — publica o Worker "iesa-ai" pela API da Cloudflare
 * ---------------------------------------------------------------------------
 * PORQUÊ ESTE FICHEIRO E NÃO O WRANGLER?
 *   O `wrangler deploy` APAGA os segredos do Worker que não estiverem no
 *   wrangler.toml. Como GEMINI_API_KEY e FIREBASE_SA_JSON são segredos (e não
 *   podem ir para o repositório), um deploy pelo Wrangler destrói-os.
 *
 *   Este script faz o contrário, em 4 passos seguros:
 *     1. lê os `bindings` ATUAIS do Worker (nomes e tipos — a Cloudflare nunca
 *        devolve os valores dos segredos, e é mesmo assim que tem de ser);
 *     2. se GEMINI_API_KEY ou FIREBASE_SA_JSON não existirem, PÁRA antes de
 *        publicar (publicar sem eles deixaria a IA morta);
 *     3. publica o código novo REENVIANDO os bindings existentes → os segredos
 *        sobrevivem;
 *     4. confirma o /__health no ar e volta a listar os bindings.
 *
 * USO
 *   export CLOUDFLARE_API_TOKEN=...        # Account / Workers Scripts / Edit
 *   export CLOUDFLARE_ACCOUNT_ID=...       # dashboard Cloudflare, coluna direita
 *   node scripts/deploy-worker-api.mjs              # publica
 *   node scripts/deploy-worker-api.mjs --check      # só inspeciona, não publica
 *
 *   --force   publica mesmo que falte um segredo (só para emergências)
 *
 * Não precisa de `npm install`: Node >= 18 (fetch nativo).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const WORKER_NAME = process.env.WORKER_NAME || 'iesa-ai';
const PROJECT_ID = process.env.PROJECT_ID || 'iesa-emanuel-xangongo';
const HEALTH_URL = process.env.HEALTH_URL || `https://${WORKER_NAME}.cadupaulino99.workers.dev/__health`;

const REQUIRED_SECRETS = ['GEMINI_API_KEY', 'FIREBASE_SA_JSON'];

/* Em 2026-10-23 estes dois bindings foram convertidos de plain_text para
   secret_text (cifrado). Este script mantém esse estado: qualquer upload envia-os
   como secret_text com o valor vindo do ambiente. NUNCA os grave como plain_text. */

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const FORCE = args.includes('--force');

if (!TOKEN || !ACCOUNT_ID) {
  console.error(`✗ Falta configuração. Defina:
    export CLOUDFLARE_API_TOKEN=...   (Cloudflare → My Profile → API Tokens
                                       → Account / Workers Scripts / Edit)
    export CLOUDFLARE_ACCOUNT_ID=...  (dashboard Cloudflare, coluna direita)`);
  process.exit(1);
}

const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`;
const H = { Authorization: `Bearer ${TOKEN}` };

function fail(msg, extra) {
  console.error(`\n✗ ${msg}`);
  if (extra) console.error(extra);
  process.exit(1);
}

async function cf(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const txt = await r.text();
  let j = null;
  try { j = JSON.parse(txt); } catch { /* não-JSON */ }
  if (!r.ok) {
    const e = new Error(j?.errors?.[0]?.message || j?.errors?.[0]?.code || txt.slice(0, 300) || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

console.log(`\n🔧 Worker: ${WORKER_NAME}  ·  conta: ${ACCOUNT_ID}`);
console.log(`   modo: ${CHECK_ONLY ? 'INSPEÇÃO (não publica)' : 'PUBLICAÇÃO'}\n`);
console.log('─'.repeat(72));

/* ── 0. O token funciona? ─────────────────────────────────────────────── */
try {
  const v = await cf('https://api.cloudflare.com/client/v4/user/tokens/verify');
  console.log(`✓ Token aceite (status: ${v?.result?.status || '?'}).`);
} catch (e) {
  fail(`Token da Cloudflare inválido ou sem permissões: ${e.message}`,
    '  → Crie um token com Account / Workers Scripts / Edit.');
}

/* ── 1. Que bindings existem agora? ───────────────────────────────────── */
let settings = null;
try {
  const s = await cf(`${API}/settings`);
  settings = s?.result || null;
} catch (e) {
  if (e.status === 404) fail(`O Worker "${WORKER_NAME}" não existe nesta conta.`,
    '  → Confirme o CLOUDFLARE_ACCOUNT_ID e o nome do Worker.');
  fail(`Não consegui ler as definições do Worker: ${e.message}`);
}

const bindings = settings?.bindings || [];
/* "secrets" = nomes que guardam material sensivel, esteja ele como secret_text
   (cifrado) ou como plain_text (visivel no painel — inseguro, mas funcional). */
const SENSITIVE_TYPES = ['secret_text', 'plain_text'];
const secretNames = bindings.filter((b) => SENSITIVE_TYPES.includes(b.type)).map((b) => b.name);
const asPlainText = bindings.filter((b) => b.type === 'plain_text' && REQUIRED_SECRETS.includes(b.name)).map((b) => b.name);

console.log(`✓ Bindings atuais do Worker (${bindings.length}):`);
if (bindings.length === 0) console.log('   (nenhum)');
/* NUNCA imprimir b.text: neste Worker as chaves foram gravadas como plain_text,
   ou seja, o valor viria para o ecrã/log em claro. Mostramos só nome e tipo. */
for (const b of bindings) console.log(`   · ${String(b.name).padEnd(22)} ${b.type}`);
console.log(`   main_module: ${settings?.main_module || '(n/d)'}  ·  compatibility_date: ${settings?.compatibility_date || '(n/d)'}`);

const missing = REQUIRED_SECRETS.filter((s) => !secretNames.includes(s));
if (missing.length) {
  console.log(`\n⚠ FALTAM segredos obrigatórios: ${missing.join(', ')}`);
  console.log('  Sem eles o Worker não fala com o Gemini nem com o Firestore.');
  console.log('  Crie-os ANTES de publicar:');
  console.log('    painel  → Workers & Pages → iesa-ai → Settings → Variables and Secrets → Add');
  console.log('    ou CLI  → npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml');
  if (!FORCE) fail('Publicação cancelada para não deixar o Worker sem chaves. (Use --force para ignorar.)');
  console.log('  --force ativo: a publicar mesmo assim.');
} else {
  console.log(`\n✓ Chaves obrigatórias presentes: ${REQUIRED_SECRETS.join(', ')} — serão preservadas.`);
}

if (asPlainText.length) {
  console.log(`\n⚠ SEGURANÇA: ${asPlainText.join(', ')} estão gravados como "plain_text".`);
  console.log('  Isso significa que o valor é LÉGEL por qualquer pessoa com acesso à conta');
  console.log('  Cloudflare (painel → Settings → Variables and Secrets) e aparece em qualquer');
  console.log('  exportação/listagem da API. Devem ser do tipo "Secret" (cifrado).');
  console.log('  Este script converte-os para secret_text depois de publicar o código.');
  console.log('  Ainda assim, por já terem estado expostos, as chaves DEVEM ser rodadas.');
}

if (CHECK_ONLY) {
  console.log('\n' + '─'.repeat(72));
  console.log('ℹ Modo --check: nada foi publicado.');
  process.exit(missing.length ? 1 : 0);
}

/* ── 2. Ler o código ──────────────────────────────────────────────────── */
const codePath = resolve(HERE, '../worker/ai-worker.js');
const code = readFileSync(codePath, 'utf8');
const versionMatch = code.match(/WORKER_VERSION\s*=\s*'([^']+)'/);
const version = versionMatch ? versionMatch[1] : '?';
console.log(`\n✓ Código lido: ${codePath}`);
console.log(`   ${code.length.toLocaleString('pt-PT')} bytes · WORKER_VERSION = ${version}`);

/* ── 3. Publicar, reenviando os bindings existentes ───────────────────── */
/* Mantém os segredos tal como estão; garante PROJECT_ID como variável simples. */
/* Reconstrói os bindings. REGRAS APRENDIDAS NA PRÁTICA (2026-10-23):
   1. O upload do script é PUT (POST devolve 405).
   2. Os bindings vão DENTRO do JSON de `metadata` — um campo `bindings` solto
      no multipart é IGNORADO e o Worker fica sem bindings nenhuns.
   3. Um binding `secret_text` no upload EXIGE a propriedade `text`
      (erro 10021 sem ela). Os valores vêm do ambiente — nunca do repositório.
      Sem eles no ambiente, o deploy é abortado ANTES de tocar no Worker. */
const ENV_SECRET = {
  GEMINI_API_KEY: process.env.WORKER_SECRET_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
  FIREBASE_SA_JSON: process.env.WORKER_SECRET_FIREBASE_SA_JSON || process.env.FIREBASE_SA_JSON,
};

const nextBindings = [];
for (const b of bindings.filter((x) => x && x.name)) {
  if (b.type === 'secret_text') {
    const text = ENV_SECRET[b.name];
    if (!text) {
      fail(`O binding "${b.name}" é um Secret e o upload exige o valor, mas ele não está no ambiente.`,
        `  → export ${b.name}=<valor>  (ou WORKER_SECRET_${b.name}) antes de correr este script.
  → Sem isto o deploy removeria o segredo do Worker.`);
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
);
form.append('ai-worker.js', new Blob([code], { type: 'application/javascript+module' }), 'ai-worker.js');

try {
  console.log('\n→ A publicar (PUT)…');
  await cf(API, { method: 'PUT', body: form });
  console.log('✓ Publicado.');
} catch (e) {
  fail(`A publicação falhou: ${e.message}`,
    '  → O token precisa de Account / Workers Scripts / EDIT (não só Read).');
}

/* ── 4. Verificar ─────────────────────────────────────────────────────── */
console.log('\n→ A confirmar…');
let healthy = false;
for (let i = 0; i < 6 && !healthy; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const r = await fetch(HEALTH_URL);
    const j = await r.json().catch(() => null);
    if (j?.version) {
      healthy = true;
      console.log(`✓ /__health → version ${j.version} (build ${j.build || '?'}) · vision: ${j.vision}`);
      console.log(`   rotas: ${(j.routes || []).length} · modelos: ${(j.models || []).join(' → ')}`);
      const cfg = j.config || {};
      console.log(`   GEMINI_API_KEY: ${cfg.GEMINI_API_KEY} · FIREBASE_SA_JSON: ${cfg.FIREBASE_SA_JSON} · PROJECT_ID: ${cfg.PROJECT_ID || '(em falta)'}`);
      if (cfg.GEMINI_API_KEY === false || cfg.FIREBASE_SA_JSON === false) {
        console.log('\n⚠ Um segredo ficou a false — reponha-o no painel da Cloudflare.');
      }
    }
  } catch { /* ainda a propagar */ }
}
if (!healthy) console.log(`\n⚠ ${HEALTH_URL} ainda não devolve versão — aguarde 1 min e repita o teste.`);

/* Confirmação final dos bindings */
try {
  const s2 = await cf(`${API}/settings`);
  const after = (s2?.result?.bindings || []).filter((b) => SENSITIVE_TYPES.includes(b.type)).map((b) => b.name);
  const lost = REQUIRED_SECRETS.filter((n) => secretNames.includes(n) && !after.includes(n));
  if (lost.length) {
    console.log(`\n✗ ATENÇÃO: o deploy removeu estes segredos: ${lost.join(', ')}`);
    console.log('  Reponha-os já no painel (Settings → Variables and Secrets).');
    process.exit(1);
  }
  console.log(`\n✓ Segredos depois do deploy: ${after.join(', ') || '(nenhum)'}`);
} catch { /* não bloqueia */ }

console.log('\n' + '─'.repeat(72));
console.log(healthy ? '✅ Worker no ar e com visão ativa.\n   Teste na app: Membros → Novo → 🪪 Bilhete de Identidade → Testar ligação'
                    : '⚠ Publicado, mas a verificação não confirmou — veja o painel da Cloudflare.');
process.exit(healthy ? 0 : 1);
