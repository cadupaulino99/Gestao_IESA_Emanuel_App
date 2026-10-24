/**
 * AI Worker — Gestão IESA Emanuel (Xangongo)
 * ------------------------------------------------------------------
 * Substitui as Cloud Functions do Firebase (que exigem plano Blaze/cartão)
 * por um Cloudflare Worker GRATUITO (100k pedidos/dia, sem cartão).
 *
 * Endpoints (todos exigem utilizador autenticado no Firebase):
 *   POST /assistant/chat                 { prompt, context? }
 *   POST /assistant/financial-insights   { financialSummary }
 *   POST /assistant/draft-message        { memberName, occasion, tone? }
 *   POST /admin/create-auth-account      { email, tempPassword? }   (só admins)
 *
 * Segredos (Workers → Settings → Variables and Secrets):
 *   GEMINI_API_KEY    chave de https://aistudio.google.com/apikey
 *   FIREBASE_SA_JSON  conteúdo do ficheiro firebase-adminsdk-….json
 * Variável simples:
 *   PROJECT_ID        iesa-emanuel-xangongo
 */

/* VERSAO do codigo do Worker.
   IMPORTANTE: sempre que este ficheiro mudar, o Worker TEM de ser re-publicado
   (Cloudflare -> Workers -> iesa-ai -> Edit code -> colar -> Save and Deploy,
   ou `npm run deploy:worker`). O APK nao contem o Worker: se publicar so o APK,
   as rotas novas (ex.: /assistant/extract-member) NAO existem no servidor e a
   app recebe 404 "Rota nao encontrada".
   Consulte GET /__health para confirmar qual versao esta no ar. */
const WORKER_VERSION = '2.4.0';
const WORKER_BUILD = '2026-10-24 (gestao de admins: super, temp passwords, disable)';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const str2buf = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/* ------------------------------------------------------------------ */
/* 1. Verificar o ID token do Firebase (RS256)                          */
/*    Os tokens do Firebase SAO assinados pelo chaveiro securetoken    */
/*    (PEM em robot/v1/metadata/x509/...), NAO pelo JWKS do oauth2.     */
/*    Aceitamos os dois e refrescamos quando aparece um kid novo.      */
/* ------------------------------------------------------------------ */
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const FB_PEM_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CACHE_TTL = 6 * 3600 * 1000;
let jwksCache = { ts: 0, keys: {} };   // kid -> CryptoKey
let pemCache = { ts: 0, keys: {} };    // kid -> CryptoKey

const b64urlDecode = (s2) => atob(s2.replace(/-/g, '+').replace(/_/g, '/'));

function pemToDer(pem) {
  const b64 = pem.replace(/-----BEGIN CERTIFICATE-----/, '').replace(/-----END CERTIFICATE-----/, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/* Extrai o SubjectPublicKeyInfo (SPKI) de um certificado X.509 (DER) */
function extractSpki(der) {
  let i = 0;
  const rd = () => {
    const start = i;
    const tag = der[i++];
    let len = der[i++];
    if (len & 0x80) { const n = len & 0x7f; len = 0; for (let k = 0; k < n; k++) len = (len << 8) | der[i++]; }
    const at = i; i += len;
    return { tag, at, end: i, start };
  };
  const cert = rd();    // Certificate
  i = cert.at;          // entra no conteudo do certificado
  const tbs = rd();     // TBSCertificate
  i = tbs.at;           // entra no conteudo do TBS
  let t = rd();               // version [0] presente?
  if (t.tag === 0xa0) t = rd(); // serialNumber
  rd(); rd(); rd();           // signature, issuer, validity
  rd();                       // subject
  const spki = rd();          // subjectPublicKeyInfo
  return der.subarray(spki.start, spki.end);
}

async function importSpki(spki) {
  return crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function loadJwks(force) {
  if (!force && Date.now() - jwksCache.ts < CACHE_TTL && Object.keys(jwksCache.keys).length) return;
  const r = await fetch(JWKS_URL);
  const j = await r.json();
  const keys = {};
  for (const k of j.keys || []) {
    try {
      if (k.x5c && k.x5c[0]) {
        const der = Uint8Array.from(atob(k.x5c[0]), (c) => c.charCodeAt(0));
        keys[k.kid] = await importSpki(extractSpki(der));
      } else {
        keys[k.kid] = await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      }
    } catch { /* ignora chave que nao importa */ }
  }
  jwksCache = { ts: Date.now(), keys };
}

async function loadFbPem(force) {
  if (!force && Date.now() - pemCache.ts < CACHE_TTL && Object.keys(pemCache.keys).length) return;
  const r = await fetch(FB_PEM_URL);
  const j = await r.json();
  const keys = {};
  for (const [kid, pem] of Object.entries(j)) {
    try { keys[kid] = await importSpki(extractSpki(pemToDer(pem))); } catch { /* ignora */ }
  }
  pemCache = { ts: Date.now(), keys };
}

async function keyForKid(kid) {
  if (jwksCache.keys[kid]) return jwksCache.keys[kid];
  if (pemCache.keys[kid]) return pemCache.keys[kid];
  // kid desconhecido -> refresca os dois chaveiros (rotacao de chaves)
  await loadJwks(true);
  await loadFbPem(true);
  return jwksCache.keys[kid] || pemCache.keys[kid] || null;
}

async function verifyFirebaseIdToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('token malformado');
  const header = JSON.parse(b64urlDecode(parts[0]));
  const claims = JSON.parse(b64urlDecode(parts[1]));

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp < now) throw new Error('token expirado');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('emissor invalido');
  if (claims.aud !== projectId) throw new Error('audiencia invalida');

  if (!jwksCache.keys || !Object.keys(jwksCache.keys).length) await loadJwks(false);
  if (!pemCache.keys || !Object.keys(pemCache.keys).length) await loadFbPem(false);

  const key = await keyForKid(header.kid);
  if (!key) throw new Error('certificado desconhecido');

  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    str2buf(b64urlDecode(parts[2])),
    str2buf(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new Error('assinatura invalida');
  return claims; // { sub, email, ... }
}

/* ------------------------------------------------------------------ */
/* 2. Token OAuth da service account (para ler o Firestore)            */
/* ------------------------------------------------------------------ */
let saCache = { ts: 0, token: '', exp: 0 };

function pemToDerKey(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/* scope: datastore (Firestore) + identitytoolkit (criar/repor contas Auth).
   So com datastore, o signupNewUser falhava com PERMISSION_DENIED — foi a
   segunda causa do "nao me deixa atribuir credenciais". */
const SA_SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit';

async function saAccessToken(saJson) {
  if (saCache.token && Date.now() - saCache.ts < saCache.exp - 60 * 1000) return saCache.token;
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(str2buf(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(str2buf(JSON.stringify({
    iss: sa.client_email,
    scope: SA_SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDerKey(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, str2buf(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${b64url(sig)}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('falha ao obter token OAuth: ' + (j.error_description || j.error));
  saCache = { ts: Date.now(), token: j.access_token, exp: (j.expires_in || 3600) * 1000 };
  return saCache.token;
}

let roleCache = { ts: 0, map: {} };
const ROLE_TTL = 5 * 60 * 1000;

/* Rate limit simples por utilizador (por isolate): 60 pedidos de IA / 10 min.
   Nao e a prova de bala (isolates sao independentes), mas trava utilizacao descontrolada. */
const rateBuckets = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 10 * 60 * 1000;
function rateOk(email) {
  const now = Date.now();
  const b = rateBuckets.get(email);
  if (!b || now - b.start > RATE_WINDOW) {
    rateBuckets.set(email, { start: now, count: 1 });
    return true;
  }
  b.count += 1;
  return b.count <= RATE_LIMIT;
}

/* Sem admins hardcoded (auditoria 2026-10-24): o papel vem UNICAMENTE do
   documento admins/<email> no Firestore. O bootstrap das regras e auto-
   extinguivel e so permite CRIAR o primeiro documento — nao da papel nenhum
   no Worker. Quem receber 403 aqui resolve-se com um documento em admins. */
/* Super admin: flag isSuper no documento admins/<email> OU o email fundador
   (antes da migracao criar a flag). Gestao de admins (criar contas, reset,
   ativar/desativar) e EXCLUSIVA do super — tambem no servidor, nao so no UI. */
const SUPER_EMAIL = 'cadupaulino99@gmail.com';

async function getAdminDoc(email, env) {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (Date.now() - roleCache.ts > ROLE_TTL) roleCache = { ts: Date.now(), map: {} };
  if (roleCache.map[lower] !== undefined) return roleCache.map[lower];
  let out = null;
  try {
    const tok = await saAccessToken(env.FIREBASE_SA_JSON);
    const url = `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/admins/${lower}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    if (r.ok) {
      const doc = await r.json();
      const f = doc.fields || {};
      const str = (k) => (f[k] && f[k].stringValue) || null;
      const bool = (k) => (f[k] && f[k].booleanValue) || false;
      const num = (k) => (f[k] && Number(f[k].integerValue || f[k].doubleValue)) || 0;
      out = {
        role: str('role') || 'admin',
        isSuper: bool('isSuper') || lower === SUPER_EMAIL,
        disabled: bool('disabled'),
        mustChangePassword: bool('mustChangePassword'),
        tempPasswordIssuedAt: num('tempPasswordIssuedAt'),
      };
    }
  } catch { /* sem documento = sem papel */ }
  roleCache.map[lower] = out;
  return out;
}

async function getRole(email, env) {
  const d = await getAdminDoc(email, env);
  return d ? d.role : null;
}

/* PATCH cirúrgico num documento admins/<email> (updateMask = só estes campos). */
async function patchAdminDoc(env, email, fields) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const masks = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const fv = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'boolean') fv[k] = { booleanValue: v };
    else if (typeof v === 'number') fv[k] = { integerValue: String(v) };
    else fv[k] = { stringValue: String(v) };
  }
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/admins/${email.toLowerCase()}?${masks}`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: fv }) }
  );
  if (!r.ok) throw new Error('Falha ao atualizar o documento admins/' + email + ': ' + r.status);
  return r.json();
}

/* Identity Toolkit: localId de um email; e definir password / ativar / desativar. */
async function itGetLocalId(env, email) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const r = await fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ email: [email] }),
  });
  const j = await r.json();
  return j?.users?.[0]?.localId || null;
}

async function itSetAccount(env, payload) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const r = await fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/setAccountInfo', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'setAccountInfo falhou (' + r.status + ')');
  return j;
}

const TEMP_PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sem 0/O/1/l
function genTempPassword(len = 12) {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += TEMP_PASS_ALPHABET[buf[i] % TEMP_PASS_ALPHABET.length];
  return out;
}

/* ------------------------------------------------------------------ */
/* 3. Gemini                                                           */
/* ------------------------------------------------------------------ */

/* ─────────────────────────────────────────────────────────────────────────────
   ORDEM DOS MODELOS — ISTO ERA A CAUSA DA FALHA NA LEITURA DO BI
   ─────────────────────────────────────────────────────────────────────────────
   Medicoes reais em 2026-10-22 com a chave do projeto (BI de exemplo, 6 campos):

     gemini-3.8-flash      170.0 s  e  390.6 s   ← 6/6 campos, mas LENTISSIMO
     gemini-3.6-flash        3.0 s               ← 6/6 campos
     gemini-3.5-flash-lite   1.9 s               ← 6/6 campos
     gemini-3.1-flash-lite   2.2 s               ← 6/6 campos
     gemini-2.5-flash        HTTP 404 "no longer available to new users"

   O Worker usava gemini-3.8-flash. Um subrequest de um Worker da Cloudflare e
   cortado aos ~100 s (CPU/wall), portanto a chamada AO GEMINI NUNCA CHEGAVA AO
   FIM: a app recebia 5xx/502 e o utilizador via "falha na leitura". E como o
   fallback so existia para 400/404 de modelo, nao havia rede de seguranca.

   Regra: para OCR de documentos usa-se um modelo RAPIDO. Ha um relato publico
   de latencia extrema no Gemini 3 Flash ("API requests that would take seconds
   now take over 5 minutes"), o que bate certo com a medicao acima.

   NAO voltar a meter gemini-3.8-flash aqui sem medir primeiro (`npm run test:bi`).
   gemini-2.5-flash esta removido: devolve 404 em chaves novas e so queimava tempo.
   ───────────────────────────────────────────────────────────────────────────── */
const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

/* Timeout por tentativa. Tem de ficar ABAIXO do limite de subrequest da
   Cloudflare (~100 s), senao e a Cloudflare que desliga e o fallback nao corre.
   Com 45 s ha margem para 2 tentativas dentro do orcamento. */
const GEMINI_TIMEOUT_MS = 45_000;

/* Le a chave do header `x-goog-api-key` (v1beta), com timeout explicito. */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function geminiPost(env, model, body, timeoutMs = GEMINI_TIMEOUT_MS) {
  /* Em 429/503 (quota/pico de procura) tenta o MESMO modelo uma segunda vez
     com backoff de ~1,2 s antes de declarar falha e mudar de modelo. */
  for (let attempt = 0; ; attempt++) {
  let r;
  try {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
  } catch (e) {
    /* AbortError / TimeoutError: o modelo demorou demais. Marca como repetivel
       para que geminiWithFallback passe ao modelo seguinte em vez de rebentar. */
    const err = new Error(`Tempo esgotado ao falar com ${model} (>${Math.round(timeoutMs / 1000)}s).`);
    err.status = 408;
    err.model = model;
    err.retryable = true;
    throw err;
  }
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { /* HTML/pagina de erro */ }
  if (!r.ok) {
    const msg = j?.error?.message || txt.slice(0, 300) || `erro Gemini ${r.status}`;
    if ((r.status === 429 || r.status === 503) && attempt === 0) {
      await sleep(1200 + Math.random() * 800);
      continue;
    }
    const e = new Error(msg);
    e.status = r.status;
    e.model = model;
    throw e;
  }
  return j;
  }
}

/* Tenta os modelos por ordem. Faz fallback para: modelo inexistente/config
   invalida (400/404), timeout (408), quota (429) e erro do servidor (5xx) —
   que e exatamente o que acontecia com gemini-3.8-flash: a Cloudflare cortava a
   chamada aos ~100 s e a app ficava sem resposta nenhuma. */
function isRetryable(e) {
  if (e?.retryable) return true;
  const st = e?.status;
  return st === 400 || st === 404 || st === 408 || st === 429 || (st >= 500 && st <= 599);
}

async function geminiWithFallback(env, body) {
  let last = null;
  for (const model of GEMINI_MODELS) {
    try {
      const j = await geminiPost(env, model, body);
      return { json: j, model };
    } catch (e) {
      last = e;
      if (!isRetryable(e)) break;
    }
  }
  throw last || new Error('Sem modelo Gemini disponivel.');
}

const partsToText = (j) =>
  (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');

async function gemini(env, prompt, systemInstruction) {
  const { json: j, model } = await geminiWithFallback(env, {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
  });
  const t = partsToText(j);
  if (!t) throw new Error(`Resposta vazia do modelo ${model}.`);
  return t;
}

/* ------------------------------------------------------------------ */
/* 3b. Gemini com VISAO (documentos: BI, cartao de membro, comprovativos) */
/*                                                                     */
/* Tres correcoes face a versao anterior:                              */
/*  A) `mediaResolution: MEDIA_RESOLUTION_HIGH` — sem isto o Gemini 3   */
/*     aloca poucos tokens a imagem e NAO le o texto pequeno do BI      */
/*     (numero, data de emissao, morada). E o parametro oficial para     */
/*     "compreensao de documentos densos".                              */
/*  B) A imagem vai ANTES do texto — recomendacao oficial da Google      */
/*     para pedidos com uma imagem + prompt.                            */
/*  C) `responseSchema` — obriga o modelo a devolver exatamente as       */
/*     chaves/tipos pedidos (structured output). Acaba com o "a IA       */
/*     devolveu texto livre e o JSON.parse falhou".                     */
/* ------------------------------------------------------------------ */
async function geminiVision(env, prompt, systemInstruction, imageBase64, mimeType, responseSchema) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY nao esta definida no Worker (Settings -> Variables and Secrets).');
  if (!imageBase64 || typeof imageBase64 !== 'string') throw new Error('Imagem vazia ou em formato invalido.');

  /* Aceita base64 puro ou data URL ("data:image/jpeg;base64,....") — alguns
     clientes mandam o data URL inteiro e o Gemini rejeita-o. */
  let data = String(imageBase64).trim();
  let mime = mimeType || 'image/jpeg';
  const m = data.match(/^data:([^;,]+);base64,(.*)$/s);
  if (m) { mime = m[1]; data = m[2]; }
  data = data.replace(/\s+/g, '');

  const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (!SUPPORTED.includes(mime)) mime = 'image/jpeg';

  /* ~20 MB e o limite do pedido inline; base64 incha 33%. */
  if (data.length > 26_000_000) {
    throw new Error('Imagem demasiado grande para enviar (limite ~20 MB). Tire outra foto ou reduza a resolucao.');
  }

  const imagePart = {
    inlineData: { mimeType: mime, data },
    /* Per-part: garante alta resolucao mesmo que o global seja ignorado. */
    mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' },
  };

  const baseBody = {
    /* (B) imagem primeiro, prompt depois */
    contents: [{ parts: [imagePart, { text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
  };

  /* thinkingLevel 'low' — OCR de documentos nao precisa de raciocinio profundo e
     o nivel baixo corta a latencia. Medido: 6/6 campos em ~2-3 s nos flash-lite. */
  const THINK = { thinkingLevel: 'low' };
  const configs = [
    { responseMimeType: 'application/json', mediaResolution: 'MEDIA_RESOLUTION_HIGH', thinkingConfig: THINK, ...(responseSchema ? { responseSchema } : {}) },
    { responseMimeType: 'application/json', mediaResolution: 'MEDIA_RESOLUTION_HIGH', ...(responseSchema ? { responseSchema } : {}) },
    { responseMimeType: 'application/json', mediaResolution: 'MEDIA_RESOLUTION_HIGH' },
    { responseMimeType: 'application/json' },
    {},
  ];

  let lastErr = null;
  for (const generationConfig of configs) {
    try {
      const { json: j, model } = await geminiWithFallback(env, { ...baseBody, generationConfig });
      const txt = partsToText(j).trim();
      if (!txt) { lastErr = new Error(`Resposta vazia do modelo ${model}.`); continue; }
      try {
        return JSON.parse(txt);
      } catch {
        const found = txt.match(/\{[\s\S]*\}/);
        if (found) { try { return JSON.parse(found[0]); } catch { /* continua */ } }
        const e = new Error('A IA nao devolveu JSON valido.');
        e.raw = txt.slice(0, 300);
        throw e;
      }
    } catch (e) {
      lastErr = e;
      /* generationConfig invalido, modelo indisponivel, timeout ou 5xx:
         tenta a configuracao seguinte em vez de desistir. */
      if (isRetryable(e)) continue;
      throw e;
    }
  }
  throw lastErr || new Error('Falha desconhecida na leitura da imagem.');
}

/* Esquemas de saida (structured output). `nullable: true` para que o modelo
   possa dizer "nao vejo este campo" em vez de inventar. */
const SCHEMA_MEMBER_BI = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', nullable: true, description: 'Nome completo como esta no BI' },
    documentNumber: { type: 'STRING', nullable: true, description: 'Numero do Bilhete de Identidade' },
    birthDate: { type: 'STRING', nullable: true, description: 'Data de nascimento em AAAA-MM-DD' },
    address: { type: 'STRING', nullable: true, description: 'Residencia/morada' },
    gender: { type: 'STRING', nullable: true, enum: ['M', 'F', null], description: 'Sexo: M ou F' },
    issueDate: { type: 'STRING', nullable: true, description: 'Data de emissao em AAAA-MM-DD' },
  },
  propertyOrdering: ['name', 'documentNumber', 'birthDate', 'address', 'gender', 'issueDate'],
};

const SCHEMA_MEMBER_CARTAO = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', nullable: true },
    memberNumber: { type: 'STRING', nullable: true },
    baptismDate: { type: 'STRING', nullable: true, description: 'Data em AAAA-MM-DD' },
    groupCell: { type: 'STRING', nullable: true },
    phone: { type: 'STRING', nullable: true },
    notes: { type: 'STRING', nullable: true },
  },
  propertyOrdering: ['name', 'memberNumber', 'baptismDate', 'groupCell', 'phone', 'notes'],
};

const SCHEMA_RECEIPT = {
  type: 'OBJECT',
  properties: {
    amount: { type: 'NUMBER', nullable: true, description: 'Valor numerico em AOA, sem simbolos' },
    currency: { type: 'STRING', nullable: true },
    date: { type: 'STRING', nullable: true, description: 'Data em AAAA-MM-DD' },
    method: { type: 'STRING', nullable: true, enum: ['transferencia', 'deposito', 'multicaixa', 'outro', null] },
    bank: { type: 'STRING', nullable: true },
    payerName: { type: 'STRING', nullable: true },
    reference: { type: 'STRING', nullable: true },
    notes: { type: 'STRING', nullable: true },
  },
  propertyOrdering: ['amount', 'currency', 'date', 'method', 'bank', 'payerName', 'reference', 'notes'],
};

const SYS_EXTRACTOR = 'Voce e um extrator de dados de documentos angolanos (IESA - Igreja Evangelica Sinodal de Angola). Devolva APENAS JSON valido, sem texto extra, exatamente com as chaves pedidas. Use null quando um dado nao estiver visivel ou legivel. Datas sempre em AAAA-MM-DD. Telefones no formato +244XXXXXXXXX quando possivel. Nao invente dados: se duvidar, use null.';

const SYSTEM_ASSISTANT = `
Você é o Assistente Inteligente Especialista da Igreja Evangélica Sinodal de Angola (IESA) - Igreja Local de Emanuel em Xangongo.
Apoie a liderança (Pastores, Tesoureiros, Secretários, Administradores) com sabedoria, precisão e cordialidade cristã.
Competências: análise financeira/orçamental (Dízimos, Ofertas, Fundo de Construção, Obrigações Sinodais em AOA); orientação pastoral e bíblica; gestão de células e acolhimento; relatórios para assembleia/sínodo.
Responda de forma clara, estruturada, calorosa e focada na realidade de Angola.`;

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;

    /* --- Diagnostico PUBLICO (sem auth): diz qual versao do Worker esta no ar.
       Abra https://iesa-ai.<conta>.workers.dev/__health no browser.
       Se devolver 404 "Rota nao encontrada", o Worker publicado e ANTIGO
       (anterior a v2.0.0) e precisa de ser re-publicado. --- */
    if (path === '/__health' || path === '/health') {
      return json({
        ok: true,
        service: 'iesa-ai',
        version: WORKER_VERSION,
        build: WORKER_BUILD,
        vision: true,
        routes: [
          '/assistant/chat',
          '/assistant/financial-insights',
          '/assistant/draft-message',
          '/assistant/extract-member',
          '/assistant/extract-receipt',
          '/admin/create-auth-account',
          '/admin/reset-temp-password',
          '/admin/set-account-disabled',
        ],
        models: GEMINI_MODELS,
        config: {
          GEMINI_API_KEY: !!env.GEMINI_API_KEY,
          FIREBASE_SA_JSON: !!env.FIREBASE_SA_JSON,
          PROJECT_ID: env.PROJECT_ID || null,
        },
        time: new Date().toISOString(),
      });
    }

    try {
      /* --- auth comum --- */
      const authHeader = request.headers.get('Authorization') || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!idToken) return json({ error: 'Não autenticado.' }, 401);
      let claims;
      try {
        claims = await verifyFirebaseIdToken(idToken, env.PROJECT_ID);
      } catch (e) {
        return json({ error: 'Sessão inválida: ' + e.message }, 401);
      }
      const adminDoc = await getAdminDoc(claims.email, env);
      const role = adminDoc ? adminDoc.role : null;
      const isSuper = !!adminDoc && adminDoc.isSuper;

      /* Conta desativada: nada de IA nem de admin (o login na app tambem e
         bloqueado pelo AuthContext; isto e a segunda linha de defesa). */
      if (adminDoc && adminDoc.disabled) return json({ error: 'Conta desativada. Fale com o super administrador.', code: 'ACCOUNT_DISABLED' }, 403);
      /* Palavra-passe temporaria por trocar: so pode usar o sistema depois de a trocar. */
      if (adminDoc && adminDoc.mustChangePassword) return json({ error: 'Troque a palavra-passe temporaria antes de usar o sistema.', code: 'PASSWORD_CHANGE_REQUIRED' }, 403);

      /* --- gestão de admins: SÓ super admin (servidor, nao so UI) --- */
      if (path === '/admin/create-auth-account') {
        if (!isSuper) return json({ error: 'Só o super administrador pode criar contas.' }, 403);
        const { email, tempPassword, name, phone } = await request.json();
        if (!email) return json({ error: 'Email obrigatório.' }, 400);
        const pwd = tempPassword || genTempPassword();
        const sa = JSON.parse(env.FIREBASE_SA_JSON);
        const tok = await saAccessToken(env.FIREBASE_SA_JSON);
        const r = await fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ email, password: pwd, displayName: email.split('@')[0] }),
        });
        const j = await r.json();
        if (!r.ok) {
          if ((j.error?.message || '').includes('EMAIL_EXISTS')) {
            return json({ error: 'Já existe uma conta com este email. Use «Gerar nova palavra-passe temporária» na lista.', code: 'EMAIL_EXISTS' }, 409);
          }
          return json({ error: j.error?.message || 'erro' }, 500);
        }
        void sa;
        void name; void phone;
        return json({ ok: true, created: true, tempPassword: pwd });
      }

      /* --- repor palavra-passe temporária (super; o alvo não pode ser super) --- */
      if (path === '/admin/reset-temp-password') {
        if (!isSuper) return json({ error: 'Só o super administrador.' }, 403);
        const { email, tempPassword } = await request.json();
        const target = String(email || '').toLowerCase();
        if (!target) return json({ error: 'Email obrigatório.' }, 400);
        if (target === SUPER_EMAIL) return json({ error: 'A conta do super administrador não pode ser redefinida por aqui.' }, 403);
        const tDoc = await getAdminDoc(target, env);
        if (!tDoc) return json({ error: 'Este email não está na coleção admins.' }, 404);
        const localId = await itGetLocalId(env, target);
        if (!localId) return json({ error: 'Não encontrei a conta de autenticação deste email.' }, 404);
        const pwd = tempPassword || genTempPassword();
        await itSetAccount(env, { localId, password: pwd, disableUser: false });
        await patchAdminDoc(env, target, { mustChangePassword: true, tempPasswordIssuedAt: Date.now(), disabled: false });
        roleCache = { ts: 0, map: {} };
        return json({ ok: true, tempPassword: pwd });
      }

      /* --- ativar / desativar conta (super; o alvo não pode ser super) --- */
      if (path === '/admin/set-account-disabled') {
        if (!isSuper) return json({ error: 'Só o super administrador.' }, 403);
        const { email, disabled } = await request.json();
        const target = String(email || '').toLowerCase();
        if (!target) return json({ error: 'Email obrigatório.' }, 400);
        if (target === SUPER_EMAIL) return json({ error: 'A conta do super administrador não pode ser desativada.' }, 403);
        const tDoc = await getAdminDoc(target, env);
        if (!tDoc) return json({ error: 'Este email não está na coleção admins.' }, 404);
        const localId = await itGetLocalId(env, target);
        if (localId) await itSetAccount(env, { localId, disableUser: !!disabled });
        await patchAdminDoc(env, target, { disabled: !!disabled });
        roleCache = { ts: 0, map: {} };
        return json({ ok: true, disabled: !!disabled });
      }

      /* --- liderança (admin/pastor/tesoureiro) --- */
      if (!role || !['admin', 'pastor', 'treasurer'].includes(role)) {
        return json({ error: 'Apenas a liderança pode usar a IA.' }, 403);
      }
      if (!rateOk(claims.email || claims.sub)) {
        return json({ error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente novamente.' }, 429);
      }

      /* --- Autodiagnostico (lideranca): confirma segredos, papel e o Gemini.
             Usado pelo ecra Suporte → "Testar ligação da IA". --- */
      if (path === '/assistant/selftest') {
        const out = {
          ok: true,
          workerVersion: WORKER_VERSION,
          workerBuild: WORKER_BUILD,
          user: { email: claims.email || null, uid: claims.sub || null, role: role || null },
          config: {
            GEMINI_API_KEY: !!env.GEMINI_API_KEY,
            FIREBASE_SA_JSON: !!env.FIREBASE_SA_JSON,
            PROJECT_ID: env.PROJECT_ID || null,
          },
          gemini: { reachable: false, model: null, error: null },
          routes: ['/assistant/chat', '/assistant/financial-insights', '/assistant/draft-message', '/assistant/extract-member', '/assistant/extract-receipt'],
        };
        try {
          const { model } = await geminiWithFallback(env, {
            contents: [{ parts: [{ text: 'Responda apenas com a palavra OK.' }] }],
          });
          out.gemini = { reachable: true, model, error: null };
        } catch (e) {
          out.gemini = { reachable: false, model: e?.model || null, error: e?.message || 'erro desconhecido' };
        }
        return json(out);
      }

      if (path === '/assistant/chat') {
        const { prompt, context } = await request.json();
        if (!prompt) return json({ error: 'Prompt obrigatório.' }, 400);
        const contents = context ? `[Contexto:\n${context}]\n\nPedido:\n${prompt}` : prompt;
        return json({ text: await gemini(env, contents, SYSTEM_ASSISTANT) });
      }

      if (path === '/assistant/financial-insights') {
        const { financialSummary } = await request.json();
        const prompt = `Analise os dados financeiros da igreja e forneça um resumo executivo com 3 pontos fortes e 2 recomendações prudentes para a tesouraria:\n\n${JSON.stringify(financialSummary, null, 2)}`;
        return json({ text: await gemini(env, prompt, 'Você é um consultor financeiro cristão experiente em gestão eclesiástica em Angola.') });
      }

      if (path === '/assistant/draft-message') {
        const { memberName, occasion, tone } = await request.json();
        if (!memberName || !occasion) return json({ error: 'memberName e occasion obrigatórios.' }, 400);
        const prompt = `Escreva uma mensagem pastoral inspiradora e bíblica para o membro "${memberName}", por ocasião de "${occasion}". Tom: "${tone || 'afetuoso e inspirador'}". Inclua um versículo bíblico apropriado e felicitações em nome da Igreja Emanuel - Xangongo.`;
        return json({ text: await gemini(env, prompt, 'Você é o pastor da Igreja Evangélica Sinodal de Angola (Emanuel em Xangongo). Escreva com elegância, calor e brevidade para WhatsApp.') });
      }

      /* --- VISAO: ler BI / cartao de membro --- */
      if (path === '/assistant/extract-member') {
        const { imageBase64, mimeType, kind } = await request.json();
        if (!imageBase64) return json({ error: 'Imagem obrigatoria.' }, 400);
        const mime = mimeType || 'image/jpeg';
        const isCartao = kind === 'cartao';

        const REGRAS = [
          'A fotografia pode estar rodada 90 ou 180 graus: leia-a na orientacao correta.',
          'Transcreva APENAS o que estiver realmente visivel e legivel na imagem.',
          'NUNCA invente, deduza ou complete dados (nomes, numeros, datas, moradas).',
          'Se um campo nao estiver visivel ou estiver ilegivel, devolva null nesse campo.',
          'Datas SEMPRE em AAAA-MM-DD (ex.: 1990-03-07).',
          'Mantenha a ortografia e os acentos originais do documento.',
        ].join(' ');

        const prompt = isCartao
          ? `${REGRAS} Este documento e um CARTAO DE MEMBRO BATIZADO da IESA (Igreja Evangelica Sinodal de Angola), possivelmente manuscrito. Extraia: name (nome completo), memberNumber (numero/codigo do membro), baptismDate (data do batismo), groupCell (celula, grupo, congregacao ou paroquia), phone (telefone, formato +244XXXXXXXXX), notes (outra informacao util). Em texto manuscrito faca o melhor esforco; se uma palavra for ilegivel, use null.`
          : `${REGRAS} Este documento e um BILHETE DE IDENTIDADE (BI) da Republica de Angola — pode ser a frente, o verso, o modelo antigo ou o novo modelo. Extraia: name (nome completo, ignorando o campo "Filiacao"), documentNumber (numero do BI, apenas digitos, sem espacos), birthDate (data de nascimento), address (residencia/morada), gender ("M" ou "F"), issueDate (data de emissao). Se a imagem nao for um BI angolano, devolva todos os campos a null.`;

        try {
          const fields = await geminiVision(
            env, prompt, SYS_EXTRACTOR, imageBase64, mime,
            isCartao ? SCHEMA_MEMBER_CARTAO : SCHEMA_MEMBER_BI
          );
          return json({ fields: fields || {}, workerVersion: WORKER_VERSION });
        } catch (e) {
          return json(
            { error: e?.message || 'Falha na leitura.', detalhe: e?.raw || undefined, status: e?.status, model: e?.model, workerVersion: WORKER_VERSION },
            e?.status === 429 ? 429 : 502
          );
        }
      }

      /* --- VISAO: ler comprovativo bancario --- */
      if (path === '/assistant/extract-receipt') {
        const { imageBase64, mimeType } = await request.json();
        if (!imageBase64) return json({ error: 'Imagem obrigatoria.' }, 400);
        const prompt = 'A fotografia pode estar rodada; leia-a na orientacao correta. Este documento e um COMPROVATIVO BANCARIO angolano (transferencia, deposito ou Multicaixa Express — bancos: BAI, BFA, BIC, BPC, Standard Bank, Millennium Atlantico, Sol, Keve, etc.). Extraia APENAS o que estiver visivel (null caso contrario, sem inventar): amount (valor numerico em AOA, sem simbolos), currency ("AOA"), date (data da operacao em AAAA-MM-DD), method ("transferencia" | "deposito" | "multicaixa" | "outro"), bank (nome do banco), payerName (nome de quem pagou), reference (numero da operacao/comprovativo/referencia), notes (observacoes).';
        try {
          const fields = await geminiVision(env, prompt, SYS_EXTRACTOR, imageBase64, mimeType || 'image/jpeg', SCHEMA_RECEIPT);
          return json({ fields: fields || {}, workerVersion: WORKER_VERSION });
        } catch (e) {
          return json(
            { error: e?.message || 'Falha na leitura.', detalhe: e?.raw || undefined, status: e?.status, model: e?.model, workerVersion: WORKER_VERSION },
            e?.status === 429 ? 429 : 502
          );
        }
      }

      return json({
        error: 'Rota nao encontrada.',
        workerVersion: WORKER_VERSION,
        dica: 'Se a app chamou /assistant/extract-member ou /assistant/extract-receipt e recebeu isto, o Worker publicado esta DESATUALIZADO. Re-publique o conteudo de worker/ai-worker.js (ver docs/GUIA-CLOUDFLARE-WORKER.md) — instalar um APK novo NAO atualiza o Worker.',
      }, 404);
    } catch (e) {
      return json({ error: e?.message || 'Erro interno.' }, 500);
    }
  },
};
