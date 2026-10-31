#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ═══════════════════════════════════════════════════════════════════════════
   v1.19.0 (P3) — VERIFICADOR ESTÁTICO DAS REGRAS (firestore.rules/storage.rules)
   ───────────────────────────────────────────────────────────────────────────
   As regras são a AUTORIDADE de segurança do sistema e não tinham testes: o
   emulador do Firebase exige Java e o deploy é manual, portanto um erro de
   sintaxe (ou uma função mal escrita) só aparecia no deploy — ou pior, ficava
   em silêncio a permitir o que devia negar.

   Este script não substitui o emulador; faz as verificações baratas que
   apanham os defeitos que ESTE repositório já teve:
     · parêntesis/chavetas desequilibrados (cortar-e-colar em 770 linhas);
     · chamadas a funções que NÃO existem (o Firestore só avisa no deploy);
     · funções definidas e nunca usadas — foi assim que `isValidMemberCreate`
       passou meses desligado (v1.18: os deploys avisavam «Unused function»);
     · blocos `match` duplicados para o mesmo caminho (havia DOIS
       `match /settings/{…}`: editar um não mudava nada — removido na v1.19);
     · blocos `match` sem nenhuma regra `allow` (colecção ficaria inacessível);
     · `allow` com operações desconhecidas (typos do tipo `allow createa:`);
     · cabeçalho em falta (`rules_version`, `service …`).

   Uso:  npm run lint:rules            (passo «Regras» no CI)
   Testes: scripts/__tests__/checkRules.test.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

const BUILTIN_CALLS = new Set(['get', 'exists']);
const KEYWORDS = new Set(['if', 'return', 'match', 'allow', 'service', 'function', 'rules_version', 'in', 'is', 'true', 'false', 'null']);
const ALLOW_OPS = new Set(['read', 'write', 'create', 'update', 'delete', 'get', 'list']);

/** Tira comentários e mascara strings (mantendo posições/linhas) para análise segura. */
export function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const lineStarts = [0];
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '\n') { out += c; i++; lineStarts.push(out.length); continue; }
    if (c === '/' && next === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && next === '*') {
      i += 2; out += '  ';
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') { out += '\n'; i++; lineStarts.push(out.length); } else { out += ' '; i++; }
      }
      i += 2; out += '  ';
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c; out += ' '; i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === '\n') { out += '\n'; i++; lineStarts.push(out.length); } else { out += ' '; i++; }
      }
      out += ' '; i++;
      continue;
    }
    out += c; i++;
  }
  return { masked: out, lineStarts };
}

function lineOf(index, lineStarts) {
  let lo = 0;
  for (let l = 0; l < lineStarts.length; l++) {
    if (lineStarts[l] <= index) lo = l; else break;
  }
  return lo + 1;
}

/** Localiza os blocos `match <caminho> { … }` (incl. wildcard `{id}` e aninhados). */
export function findMatchBlocks(masked) {
  const blocks = [];
  const re = /\bmatch\b/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    let i = m.index + 5;
    while (i < masked.length && /\s/.test(masked[i])) i++;
    const pathStart = i;
    // caminho, com eventuais wildcards {…} pelo meio
    while (i < masked.length) {
      if (masked[i] === '{') {
        const close = masked.indexOf('}', i);
        if (close < 0) break;
        i = close + 1;
        continue;
      }
      if (/\s/.test(masked[i])) break;
      i++;
    }
    const path = masked.slice(pathStart, i).trim();
    while (i < masked.length && masked[i] !== '{') i++;
    if (i >= masked.length || !path) continue;
    let depth = 0;
    let end = -1;
    for (let j = i; j < masked.length; j++) {
      if (masked[j] === '{') depth++;
      else if (masked[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    blocks.push({
      path,
      /** caminho normalizado: `{adminId}` → `{}` (para detectar duplicados) */
      key: path.replace(/\{[^}]*\}/g, '{}'),
      start: m.index,
      bodyStart: i,
      end,
      body: masked.slice(i, end < 0 ? masked.length : end),
    });
  }
  return blocks;
}

/**
 * Analisa o texto de um ficheiro .rules.
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkRules(src, filename = 'rules') {
  const errors = [];
  const warnings = [];
  const { masked, lineStarts } = stripCommentsAndStrings(src);
  const at = (idx) => `${filename}:${lineOf(idx, lineStarts)}`;

  /* 1) equilíbrio de (), {}, [] */
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') stack.push({ c, i });
    else if (c === ')' || c === ']' || c === '}') {
      const top = stack.pop();
      if (!top || top.c !== pairs[c]) {
        errors.push(`${at(i)}: «${c}» a mais ou fora do sítio.`);
        break;
      }
    }
  }
  if (stack.length) {
    errors.push(`${at(stack[0].i)}: «${stack[0].c}» nunca fecha (faltam ${stack.length}).`);
  }

  /* 2) funções definidas vs. chamadas */
  const defined = new Map();
  for (const fm of masked.matchAll(/\bfunction\s+([A-Za-z_]\w*)\s*\(/g)) defined.set(fm[1], fm.index);
  const called = new Map();
  for (const cm of masked.matchAll(/([.])?\b([A-Za-z_]\w*)\s*\(/g)) {
    if (cm[1] === '.') continue;                       // método: x.size(), d.keys()
    const name = cm[2];
    if (KEYWORDS.has(name)) continue;
    /* A DEFINIÇÃO («function foo(…)») também casa com o padrão de chamada —
       sem este corte, nenhuma função parecia «nunca usada». */
    if (/\bfunction\s+$/.test(masked.slice(Math.max(0, cm.index - 16), cm.index))) continue;
    if (!called.has(name)) called.set(name, cm.index);
  }
  for (const [name, idx] of called) {
    if (defined.has(name) || BUILTIN_CALLS.has(name)) continue;
    errors.push(`${at(idx)}: chama «${name}()», que não está definida neste ficheiro.`);
  }
  for (const [name, idx] of defined) {
    if (!called.has(name)) {
      warnings.push(`${at(idx)}: «${name}()» está definida mas NUNCA é usada — foi assim que um validador ficou meses desligado (v1.18).`);
    }
  }

  /* 3) blocos match: duplicados e sem allow */
  const seen = new Map();
  for (const b of findMatchBlocks(masked)) {
    if (seen.has(b.key)) {
      errors.push(`${at(b.start)}: bloco «match ${b.path}» DUPLICADO (já existe na linha ${lineOf(seen.get(b.key).start, lineStarts)}). ` +
        'O Firestore avalia os dois e basta um allow para conceder — editar só um não muda nada.');
    } else {
      seen.set(b.key, b);
    }
    if (!/\ballow\b/.test(b.body)) {
      warnings.push(`${at(b.start)}: «match ${b.path}» não tem nenhuma regra allow — o deny por omissão aplica-se (colecção inacessível).`);
    }
  }

  /* 4) operações em allow */
  for (const am of masked.matchAll(/\ballow\s+([^:;{}]+):/g)) {
    for (const raw of am[1].split(',')) {
      const op = raw.trim();
      if (!op) continue;
      if (!ALLOW_OPS.has(op)) {
        errors.push(`${at(am.index)}: operação desconhecida «allow ${op}:» (válidas: read, write, create, update, delete, get, list).`);
      }
    }
  }

  /* 5) cabeçalho */
  if (!/^\s*rules_version\s*=/m.test(src)) warnings.push(`${filename}: falta «rules_version = '2';» no topo.`);
  if (!/\bservice\s+(cloud\.firestore|firebase\.storage)\b/.test(masked)) {
    warnings.push(`${filename}: não encontrei nenhum bloco «service cloud.firestore» ou «service firebase.storage».`);
  }

  return { errors, warnings };
}

/** CLI: verifica os ficheiros passados (por omissão, os dois do projecto). */
export function main(argv = process.argv.slice(2)) {
  const files = argv.length ? argv : ['firestore.rules', 'storage.rules'];
  let bad = 0;
  for (const f of files) {
    let src;
    try {
      src = fs.readFileSync(f, 'utf8');
    } catch (e) {
      console.error(`✗ ${f}: não consegui ler (${e.message})`);
      bad++;
      continue;
    }
    const { errors, warnings } = checkRules(src, f);
    for (const w of warnings) console.log(`⚠ ${w}`);
    for (const e of errors) console.error(`✗ ${e}`);
    if (errors.length) {
      bad++;
      console.error(`✗ ${f}: ${errors.length} erro(s).`);
    } else {
      console.log(`✓ ${f}: ${src.split('\n').length} linhas, ${errors.length} erros${warnings.length ? `, ${warnings.length} aviso(s)` : ''}.`);
    }
  }
  if (bad) process.exitCode = 1;
  return bad;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
