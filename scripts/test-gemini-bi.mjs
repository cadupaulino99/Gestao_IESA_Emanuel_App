#!/usr/bin/env node
/**
 * test-gemini-bi.mjs — teste de bancada da leitura do BI
 * ------------------------------------------------------------------
 * Chama o Gemini EXACTAMENTE como o Worker chama (mesmo prompt, mesmo
 * sistema de instruções, mesma configuração), mas a partir da sua máquina.
 * Serve para provar se o problema está:
 *   (a) no Gemini/visão        → este teste também falha
 *   (b) no Worker/Cloudflare   → este teste passa, mas a app falha
 *   (c) na app/APK             → este teste e o Worker passam
 *
 * Uso:
 *   export GEMINI_API_KEY=AIza...
 *   node scripts/test-gemini-bi.mjs [caminho/para/foto-do-bi.jpg]
 *
 * Sem argumento usa scripts/testdata/exemplo-bi-angola.jpg (BI fictício).
 * Corre cada imagem em 3 modos para comparar qualidade:
 *   1. sem mediaResolution   (como estava na v1.7.x — o bug)
 *   2. MEDIA_RESOLUTION_HIGH (corrigido)
 *   3. HIGH + responseSchema (corrigido + saída estruturada)
 *
 * Não precisa de `npm install`: usa apenas Node ≥ 18 (fetch nativo).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('✗ Falta a chave. Corra:  export GEMINI_API_KEY=AIza...\n  (chave em https://aistudio.google.com/apikey)');
  process.exit(1);
}

/* Alinhado com GEMINI_MODELS em worker/ai-worker.js */
const MODELS = (process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.6-flash,gemini-2.5-flash')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const DEFAULT_IMAGE = resolve(import.meta.dirname || '.', 'testdata/exemplo-bi-angola.jpg');
const imagePath = resolve(process.argv[2] || DEFAULT_IMAGE);
if (!existsSync(imagePath)) {
  console.error(`✗ Imagem não encontrada: ${imagePath}`);
  process.exit(1);
}

const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };
const mimeType = MIME_BY_EXT[extname(imagePath).toLowerCase()] || 'image/jpeg';
const data = readFileSync(imagePath).toString('base64');

const SYS_EXTRACTOR =
  'Voce e um extrator de dados de documentos angolanos (IESA - Igreja Evangelica Sinodal de Angola). ' +
  'Devolva APENAS JSON valido, sem texto extra, exatamente com as chaves pedidas. Use null quando um dado ' +
  'nao estiver visivel ou legivel. Datas sempre em AAAA-MM-DD. Telefones no formato +244XXXXXXXXX quando ' +
  'possivel. Nao invente dados: se duvidar, use null.';

const REGRAS = [
  'A fotografia pode estar rodada 90 ou 180 graus: leia-a na orientacao correta.',
  'Transcreva APENAS o que estiver realmente visivel e legivel na imagem.',
  'NUNCA invente, deduza ou complete dados (nomes, numeros, datas, moradas).',
  'Se um campo nao estiver visivel ou estiver ilegivel, devolva null nesse campo.',
  'Datas SEMPRE em AAAA-MM-DD (ex.: 1990-03-07).',
  'Mantenha a ortografia e os acentos originais do documento.',
].join(' ');

const PROMPT_BI = `${REGRAS} Este documento e um BILHETE DE IDENTIDADE (BI) da Republica de Angola — pode ser a frente, o verso, o modelo antigo ou o novo modelo. Extraia: name (nome completo, ignorando o campo "Filiacao"), documentNumber (numero do BI, apenas digitos, sem espacos), birthDate (data de nascimento), address (residencia/morada), gender ("M" ou "F"), issueDate (data de emissao). Se a imagem nao for um BI angolano, devolva todos os campos a null.`;

const SCHEMA_MEMBER_BI = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', nullable: true },
    documentNumber: { type: 'STRING', nullable: true },
    birthDate: { type: 'STRING', nullable: true },
    address: { type: 'STRING', nullable: true },
    gender: { type: 'STRING', nullable: true, enum: ['M', 'F', null] },
    issueDate: { type: 'STRING', nullable: true },
  },
  propertyOrdering: ['name', 'documentNumber', 'birthDate', 'address', 'gender', 'issueDate'],
};

async function post(model, body) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let j = null;
  try { j = JSON.parse(txt); } catch { /* não-JSON */ }
  if (!r.ok) {
    const e = new Error(j?.error?.message || txt.slice(0, 300) || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

async function run(model, body) {
  return post(model, body).catch(async (first) => {
    if (first.status !== 400 && first.status !== 404) throw first;
    let last = first;
    for (const m of MODELS) {
      if (m === model) continue;
      try {
        return { json: await post(m, body), model: m };
      } catch (e) { last = e; }
    }
    throw last;
  }).then((r) => (r.json ? r : { json: r, model }));
}

const textOf = (j) => (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();

function parseJson(txt) {
  try { return JSON.parse(txt); } catch { /* continua */ }
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* continua */ } }
  return null;
}

const imagePart = (extra) => ({ inlineData: { mimeType, data }, ...(extra || {}) });

const CASES = [
  {
    name: '1) v1.7.x — sem mediaResolution, texto ANTES da imagem (o comportamento antigo)',
    body: {
      contents: [{ parts: [{ text: PROMPT_BI }, imagePart()] }],
      systemInstruction: { parts: [{ text: SYS_EXTRACTOR }] },
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    },
  },
  {
    name: '2) corrigido — imagem primeiro + MEDIA_RESOLUTION_HIGH',
    body: {
      contents: [{ parts: [imagePart({ mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } }), { text: PROMPT_BI }] }],
      systemInstruction: { parts: [{ text: SYS_EXTRACTOR }] },
      generationConfig: { responseMimeType: 'application/json', mediaResolution: 'MEDIA_RESOLUTION_HIGH' },
    },
  },
  {
    name: '3) corrigido + responseSchema (saída estruturada garantida)',
    body: {
      contents: [{ parts: [imagePart({ mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } }), { text: PROMPT_BI }] }],
      systemInstruction: { parts: [{ text: SYS_EXTRACTOR }] },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_MEMBER_BI,
        mediaResolution: 'MEDIA_RESOLUTION_HIGH',
      },
    },
  },
];

console.log(`\n🔎 Imagem: ${imagePath}`);
console.log(`   MIME: ${mimeType} · ${(data.length / 1024).toFixed(0)} KB em base64`);
console.log(`   Modelos: ${MODELS.join(' → ')}\n`);
console.log('─'.repeat(78));

let exitCode = 0;
for (const c of CASES) {
  process.stdout.write(`\n${c.name}\n`);
  const t0 = Date.now();
  try {
    const { json, model } = await run(MODELS[0], c.body);
    const txt = textOf(json);
    const parsed = parseJson(txt);
    const ms = Date.now() - t0;
    const usage = json?.usageMetadata || {};
    console.log(`   modelo: ${model} · ${ms} ms · tokens: ${usage.totalTokenCount ?? '?'} (imagem: ${usage.promptTokensDetails?.imageTokenCount ?? '?'})`);
    if (parsed) {
      console.log('   ✓ JSON:');
      console.log('   ' + JSON.stringify(parsed, null, 2).split('\n').join('\n   '));
      const filled = Object.values(parsed).filter((v) => v !== null && v !== '' && v !== undefined).length;
      console.log(`   → ${filled} de ${Object.keys(parsed).length} campos preenchidos`);
    } else {
      console.log('   ✗ Não devolveu JSON válido. Texto cru:');
      console.log('   ' + txt.slice(0, 400).split('\n').join('\n   '));
      exitCode = 1;
    }
    const fr = json?.promptFeedback?.blockReason;
    if (fr) { console.log(`   ⚠ promptFeedback.blockReason: ${fr}`); exitCode = 1; }
    if (!json?.candidates?.length) { console.log('   ⚠ Sem candidatos na resposta.'); exitCode = 1; }
  } catch (e) {
    console.log(`   ✗ ERRO${e.status ? ` (HTTP ${e.status})` : ''}: ${e.message}`);
    if (e.status === 400 && /api key/i.test(e.message)) console.log('   → GEMINI_API_KEY inválida. Crie outra em https://aistudio.google.com/apikey.');
    if (e.status === 400 && /model/i.test(e.message)) console.log('   → Modelo indisponível nesta chave. Troque GEMINI_MODELS ou actualize a lista no Worker.');
    if (e.status === 403) console.log('   → Chave sem permissão/quota. Verifique https://aistudio.google.com/apikey e a faturação.');
    if (e.status === 429) console.log('   → Quota esgotada. Aguarde ou use outra chave.');
    exitCode = 1;
  }
  console.log('─'.repeat(78));
}

console.log(`\n${exitCode === 0 ? '✅ Todos os modos responderam.' : '⚠ Houve falhas — veja acima.'}`);
console.log('Se (1) falha/ler pouco e (2)/(3) leem tudo → a correção do Worker resolve.\n');
process.exit(exitCode);
