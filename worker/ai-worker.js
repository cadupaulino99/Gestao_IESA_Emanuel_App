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

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIGURAÇÃO DE FORNECEDORES DE CANAIS (v1.11.0)
   ─────────────────────────────────────────────────────────────────────────────
   'manual'  → a fila mostra botões wa.me / sms: pré-preenchidos e o operador
               marca como enviada. SEMPRE funcional, sem contas nem custos.
   Depois de criar contas e aprovar modelos, troque aqui o fornecedor e acrescente
   as chaves como SEGREDOS do Worker (nunca neste ficheiro):
     sms:       'infobip' | 'twilio' | 'manual'   (segredos: SMS_API_KEY, SMS_SENDER_ID,
                                                  TWILIO_SID no caso twilio)
     whatsapp:  'meta'   | 'manual'               (segredos: WA_TOKEN, WA_PHONE_ID)
   Adaptadores: sendSms() / sendWhatsApp() abaixo.
   ───────────────────────────────────────────────────────────────────────────── */
const PROVIDERS = {
  system: 'internal',   // notificações dentro da app: sempre ligadas
  sms: 'manual',
  whatsapp: 'manual',
};

/* VERSAO do codigo do Worker.
   IMPORTANTE: sempre que este ficheiro mudar, o Worker TEM de ser re-publicado
   (Cloudflare -> Workers -> iesa-ai -> Edit code -> colar -> Save and Deploy,
   ou `npm run deploy:worker`). O APK nao contem o Worker: se publicar so o APK,
   as rotas novas (ex.: /assistant/extract-member) NAO existem no servidor e a
   app recebe 404 "Rota nao encontrada".
   Consulte GET /__health para confirmar qual versao esta no ar. */
const WORKER_VERSION = '2.12.0';
const WORKER_BUILD = '2026-11-05 (P1: sanitizar prompts, anonimizar financas, auth/rate/audit)';

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
  /* v2.10.0 (P3 «endurecer o token»): quatro defesas que faltavam —
       · alg FIXO (RS256): recusa 'none'/HS256 antes sequer de procurar a chave
         (a verificação já era imune por usar WebCrypto com chave RSA, mas agora
         um token forjado nem chega à assinatura);
       · exp OBRIGATÓRIO: antes `if (claims.exp && ...)` deixava passar um token
         SEM expiração;
       · iat não futurista (60 s de tolerância de relógio);
       · sub não vazio: é a identidade usada nas guardas /admin/*.            */
  if (typeof token !== 'string' || token.length < 32 || token.length > 4096) throw new Error('token malformado');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('token malformado');
  let header = null;
  let claims = null;
  try {
    header = JSON.parse(b64urlDecode(parts[0]));
    claims = JSON.parse(b64urlDecode(parts[1]));
  } catch {
    throw new Error('token malformado');
  }
  if (!header || header.alg !== 'RS256') throw new Error('algoritmo do token nao suportado');

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < now) throw new Error('token expirado');
  if (typeof claims.iat === 'number' && claims.iat > now + 60) throw new Error('token com data futura');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 128) throw new Error('token sem sujeito');
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

/* ─────────────────────────────────────────────────────────────────────────
   v1.14.0 — AUTO-CADASTRO de membros (rota PÚBLICA /auth/self-register)
   Rate limit próprio por IP (mais apertado que o da IA: 5 pedidos/10 min)
   e validação SERVIDOR completa: allowlist de campos, política de
   palavra-passe (8+), email normalizado, telefone/BI angolanos, tamanhos.
   A palavra-passe segue APENAS para o Firebase Auth (hash scrypt da Google)
   — nunca é gravada no Firestore nem escrita em logs.
   ───────────────────────────────────────────────────────────────────────── */
const signupBuckets = new Map();
const SIGNUP_RATE_LIMIT = 5;
/* v2.10.0 (P3): os baldes viviam para sempre no isolate — um Worker com tráfego
   de muitos IPs ia acumulando entradas até ao limite de memória. A poda corre
   em cada chamada e é O(n) só quando o Map passa do tecto. */
const BUCKET_MAX = 2000;
function pruneBuckets(map, now) {
  if (map.size <= BUCKET_MAX) return 0;
  let removed = 0;
  for (const [k, b] of map) {
    if (!b || now - b.start > RATE_WINDOW) { map.delete(k); removed++; }
  }
  if (map.size > BUCKET_MAX) { map.clear(); removed = -1; } // último recurso
  return removed;
}
function signupRateOk(ip) {
  const now = Date.now();
  pruneBuckets(signupBuckets, now);
  const b = signupBuckets.get(ip);
  if (!b || now - b.start > RATE_WINDOW) {
    signupBuckets.set(ip, { start: now, count: 1 });
    return true;
  }
  b.count += 1;
  return b.count <= SIGNUP_RATE_LIMIT;
}

const SIGNUP_STR_FIELDS = {
  memberNumber: 40, fatherName: 140, motherName: 140, placeOfBirth: 140,
  gender: 20, maritalStatus: 30, spouseName: 140, education: 80,
  profession: 80, address: 200, groupCell: 80, documentNumber: 20,
};

/* v2.10.0 (P3): o regex '^\d{4}-\d{2}-\d{2}$' aceitava '1990-13-45' — mês 13,
   dia 45 — e o lixo seguia para member_signups e depois para a ficha do membro
   (aniversariantes, cartão, relatórios). Valida-se o calendário a sério. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function isRealIsoDate(v, minYear = 1850) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const maxYear = new Date().getUTCFullYear() + 1;
  if (y < minYear || y > maxYear) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  const max = m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m - 1];
  return d <= max;
}

function validateSignup(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Pedido inválido.' };
  const name = String(body.name || '').trim();
  if (name.length < 2 || name.length > 140) return { ok: false, error: 'O nome deve ter entre 2 e 140 caracteres.' };
  if (/[<>]/.test(name)) return { ok: false, error: 'Caracteres não permitidos no nome.' };
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180) return { ok: false, error: 'Email inválido. Ex.: nome@email.com' };
  const password = String(body.password || '');
  if (password.length < 8 || password.length > 200) return { ok: false, error: 'A palavra-passe precisa de pelo menos 8 caracteres.' };
  const clean = { name, email, password };
  for (const [k, max] of Object.entries(SIGNUP_STR_FIELDS)) {
    const v = body[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string') return { ok: false, error: 'Campo inválido: ' + k + '.' };
    if (v.length > max) return { ok: false, error: 'Campo demasiado longo: ' + k + '.' };
    if (/[<>]/.test(v)) return { ok: false, error: 'Caracteres não permitidos no campo ' + k + '.' };
    clean[k] = v.trim();
  }
  if (clean.phone !== undefined) {
    const d = String(clean.phone).replace(/\D/g, '').replace(/^244/, '');
    if (d.length !== 9 || d[0] !== '9') return { ok: false, error: 'Telefone angolano inválido: use +244 e 9 dígitos (ex.: +244 923 000 000).' };
    clean.phone = '+244' + d;
  } else if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
    const d = String(body.phone).replace(/\D/g, '').replace(/^244/, '');
    if (d.length !== 9 || d[0] !== '9') return { ok: false, error: 'Telefone angolano inválido: use +244 e 9 dígitos (ex.: +244 923 000 000).' };
    clean.phone = '+244' + d;
  }
  if (clean.documentNumber !== undefined) {
    const bi = String(clean.documentNumber).replace(/[\s.|-]/g, '').toUpperCase();
    if (!/^\d{9}[A-Z]{2}\d{3}$/.test(bi)) return { ok: false, error: 'B.I. inválido: 9 dígitos + 2 letras + 3 dígitos (ex.: 004516745LA041).' };
    clean.documentNumber = bi;
  }
  for (const k of ['birthDate', 'baptismDate']) {
    const v = body[k];
    if (v === undefined || v === null || v === '') continue;
    /* P3: não basta o formato — '1990-13-45' passava o regex antigo. */
    if (!isRealIsoDate(v)) return { ok: false, error: 'Data inválida: ' + k + ' (use AAAA-MM-DD, com dia e mês reais).' };
    clean[k] = v;
  }
  if (body.photoBase64 !== undefined && body.photoBase64 !== null && body.photoBase64 !== '') {
    if (typeof body.photoBase64 !== 'string' || body.photoBase64.length > 900000) return { ok: false, error: 'Fotografia demasiado grande (máx. ~600 KB depois de comprimida).' };
    if (!/^[A-Za-z0-9+/=\s]+$/.test(body.photoBase64)) return { ok: false, error: 'Fotografia inválida.' };
    clean.photoBase64 = body.photoBase64.replace(/\s/g, '');
  }
  if (body.acceptsMessages !== undefined) clean.acceptsMessages = body.acceptsMessages !== false;
  return { ok: true, clean };
}

/* Rate limit simples por utilizador (por isolate): 60 pedidos de IA / 10 min.
   Nao e a prova de bala (isolates sao independentes), mas trava utilizacao descontrolada. */
const rateBuckets = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 10 * 60 * 1000;
function rateOk(email) {
  const now = Date.now();
  pruneBuckets(rateBuckets, now);
  const b = rateBuckets.get(email);
  if (!b || now - b.start > RATE_WINDOW) {
    rateBuckets.set(email, { start: now, count: 1 });
    return true;
  }
  b.count += 1;
  return b.count <= RATE_LIMIT;
}

const visionBuckets = new Map();
const VISION_RATE_LIMIT = 15;
function visionRateOk(email) {
  const now = Date.now();
  pruneBuckets(visionBuckets, now);
  const key = email || 'anon';
  const b = visionBuckets.get(key);
  if (!b || now - b.start > RATE_WINDOW) {
    visionBuckets.set(key, { start: now, count: 1 });
    return true;
  }
  b.count += 1;
  return b.count <= VISION_RATE_LIMIT;
}


function sanitizeUserText(input, maxLen) {
  let s = String(input == null ? '' : input);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)\b/gi, '[filtrado]');
  s = s.replace(/\b(system\s*:|assistant\s*:|developer\s*:)\s*/gi, '');
  s = s.replace(/\s+/g, ' ').trim();
  const lim = typeof maxLen === 'number' ? maxLen : 4000;
  if (s.length > lim) s = s.slice(0, lim);
  return s;
}

function anonymizeFinancialSummary(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const num = (v) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.abs(n) >= 1000 && Number.isInteger(n) ? Math.round(n / 100) : Math.round(n);
  };
  return {
    year: (typeof s.year === 'number' || typeof s.year === 'string') ? s.year : null,
    totalTithesKz: num(s.totalTithesKz != null ? s.totalTithesKz : s.totalTithes),
    totalOfferingsKz: num(s.totalOfferingsKz != null ? s.totalOfferingsKz : s.totalOfferings),
    totalExpensesKz: num(s.totalExpensesKz != null ? s.totalExpensesKz : s.totalExpenses),
    balanceKz: num(s.balanceKz != null ? s.balanceKz : s.balance),
    totalMembers: typeof s.totalMembers === 'number' ? s.totalMembers : null,
    activeMembers: typeof s.activeMembers === 'number' ? s.activeMembers : null,
  };
}

async function logAiAudit(env, entry) {
  try {
    const at = Date.now();
    const who = String((entry && (entry.email || entry.uid)) || 'unknown').slice(0, 200);
    const payload = {
      path: (entry && entry.path) || '',
      ok: !!(entry && entry.ok),
      ms: entry && typeof entry.ms === 'number' ? entry.ms : null,
      model: (entry && entry.model) || null,
      role: (entry && entry.role) || null,
      uid: (entry && entry.uid) || null,
      error: entry && entry.error ? String(entry.error).slice(0, 300) : null,
    };
    await fsAdd(env, 'audit_logs', {
      action: String((entry && entry.action) || 'ai').slice(0, 80),
      targetEmail: who,
      byEmail: who,
      at,
      adminEmail: who,
      createdAt: at,
      collectionName: 'ai',
      detail: JSON.stringify(payload).slice(0, 2000),
    });
  } catch (e) {
    console.error('ai audit log falhou:', (e && e.message) || e);
  }
}


/* Sem admins hardcoded (auditoria 2026-10-24): o papel vem UNICAMENTE do
   documento admins/<email> no Firestore. O bootstrap das regras e auto-
   extinguivel e so permite CRIAR o primeiro documento — nao da papel nenhum
   no Worker. Quem receber 403 aqui resolve-se com um documento em admins. */
/* Super admin: flag isSuper no documento admins/<email> OU o email fundador
   (antes da migracao criar a flag). Gestao de admins (criar contas, reset,
   ativar/desativar) e EXCLUSIVA do super — tambem no servidor, nao so no UI. */
/* v2.8.2 (auditoria P1): SUPER_EMAIL removido — o papel de super vem SÓ da
   flag isSuper no documento admins/ (confirmada a 2026-10-27). As guardas
   das rotas /admin/* passam a consultar o documento do alvo. */

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
        isSuper: bool('isSuper'),
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

/* v2.10.0 (P3): as rotas /admin/create-auth-account e /admin/reset-temp-password
   aceitavam QUALQUER palavra-passe enviada pelo cliente (o Firebase só recusa
   <6). Uma temporária de '123456' ficava activa 7 dias com troca obrigatória —
   mas era uma janela desnecessária. Agora valida-se no servidor. */
const WEAK_TEMP_PASSWORDS = ['12345678', '123456789', '1234567890', 'password', 'passwort',
  'qwertyui', 'abcdefgh', 'mudarsenha', 'iesamanuel', 'emanuel1', 'xangongo'];
function validateTempPassword(pwd) {
  const s = typeof pwd === 'string' ? pwd : '';
  if (s.length < 8 || s.length > 200) return { ok: false, error: 'A palavra-passe temporária precisa de 8 a 200 caracteres.' };
  if (/\s/.test(s)) return { ok: false, error: 'A palavra-passe temporária não pode conter espaços.' };
  if (WEAK_TEMP_PASSWORDS.includes(s.toLowerCase())) return { ok: false, error: 'Palavra-passe demasiado óbvia — use outra.' };
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return { ok: false, error: 'A palavra-passe temporária deve misturar letras e números.' };
  return { ok: true, value: s };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const TEMP_PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sem 0/O/1/l
function genTempPassword(len = 12) {
  const n = Math.max(8, Math.min(64, Math.trunc(Number(len) || 12)));
  const buf = crypto.getRandomValues(new Uint8Array(n + 4));
  const pick = (i) => TEMP_PASS_ALPHABET[buf[i] % TEMP_PASS_ALPHABET.length];
  let out = '';
  for (let i = 0; i < n; i++) out += pick(i);
  /* v2.10.0 (P3): garantir que cumpre a própria política (letras + números).
     Sem isto, ~10% das passwords geradas saíam só com letras e a validação
     (nova) recusava-as — o admin recebia um erro ao criar a conta. */
  const DIGITS = '23456789';
  if (!/[0-9]/.test(out)) {
    const pos = buf[n] % n;
    out = out.slice(0, pos) + DIGITS[buf[n + 1] % DIGITS.length] + out.slice(pos + 1);
  }
  if (!/[A-Za-z]/.test(out)) {
    const pos = buf[n + 2] % n;
    out = out.slice(0, pos) + TEMP_PASS_ALPHABET[buf[n + 3] % 24] + out.slice(pos + 1);
  }
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
/* ------------------------------------------------------------------ */
/* 4. Firestore: consultas estruturadas (para o cron)                  */
/* ------------------------------------------------------------------ */
async function fsRunQuery(env, collectionId, filters, limit = 300) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const structured = {
    from: [{ collectionId }],
    where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } },
    limit,
  };
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents:runQuery`,
    { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: structured }) }
  );
  if (!r.ok) throw new Error('runQuery ' + collectionId + ': ' + r.status);
  const rows = await r.json();
  return (rows || [])
    .filter((x) => x.document)
    .map((x) => ({ id: (x.document.name.split('/documents/')[1] || '').split('/').pop(), fields: x.document.fields || {} }));
}
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v } } });
const le = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: String(v) } } });
const fv = (fields, k) => (fields[k] && (fields[k].stringValue ?? fields[k].integerValue ?? fields[k].booleanValue ?? fields[k].doubleValue)) ?? null;
/** Moeda única (v1.12): cêntimos → «1.500,00 Kz». Espelha src/lib/money.ts. */
function fmtKz(cents) {
  const c = Math.round(Number(cents) || 0);
  const s = Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${c < 0 ? '-' : ''}${s},${String(Math.abs(c) % 100).padStart(2, '0')} Kz`;
}
const fnum = (fields, k) => Number(fv(fields, k) || 0);

async function fsPatch(env, col, id, obj) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const masks = Object.keys(obj).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'boolean') out[k] = { booleanValue: v };
    else if (typeof v === 'number') out[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (v === null) out[k] = { nullValue: null };
    else out[k] = { stringValue: String(v) };
  }
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/${col}/${encodeURIComponent(id)}?${masks}`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: out }) }
  );
  if (!r.ok) throw new Error('PATCH ' + col + '/' + id + ': ' + r.status);
}

async function fsAdd(env, col, obj) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'boolean') out[k] = { booleanValue: v };
    else if (typeof v === 'number') out[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (v === null) out[k] = { nullValue: null };
    else if (Array.isArray(v)) out[k] = { arrayValue: { values: v.map((x) => ({ stringValue: String(x) })) } };
    else out[k] = { stringValue: String(v) };
  }
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/${col}`,
    { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: out }) }
  );
  if (!r.ok) throw new Error('ADD ' + col + ': ' + r.status);
}

/* ------------------------------------------------------------------ */
/* 4b. v1.13.0 — Avisos, Agenda e Eventos: LEMBRETES DE EVENTO         */
/*     (1 dia antes, só no sistema), fundidos no digest diário do      */
/*     módulo — máx. 1 notificação/dia/membro, mesmo critério e mesmo  */
/*     formato de documento que src/lib/board.ts (ID determinístico    */
/*     notifications/board-<diaLuanda>-<memberId>).                    */
/* ------------------------------------------------------------------ */
async function fsGetDoc(env, col, id) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/${col}/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${tok}` } }
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GET ' + col + '/' + id + ': ' + r.status);
  const j = await r.json();
  return j.fields || {};
}

/** Lista uma colecção inteira (sem filtros) — para membros do digest. */
async function fsList(env, col, limit = 1000) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents:runQuery`,
    { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], limit } }) }
  );
  if (!r.ok) throw new Error('LIST ' + col + ': ' + r.status);
  const rows = await r.json();
  return (rows || []).filter((x) => x.document)
    .map((x) => ({ id: (x.document.name.split('/documents/')[1] || '').split('/').pop(), fields: x.document.fields || {} }));
}

/** PATCH com values Firestore já construídos (arrays/objects — fsPatch não cobre). */
async function fsPatchRaw(env, col, id, fields, maskPaths) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const masks = maskPaths.map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/${col}/${encodeURIComponent(id)}?${masks}`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }
  );
  if (!r.ok) throw new Error('PATCHRAW ' + col + '/' + id + ': ' + r.status);
}

async function fsDeleteDoc(env, col, id) {
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/${col}/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } }
  );
  if (!r.ok && r.status !== 404) throw new Error('DELETE ' + col + '/' + id + ': ' + r.status);
}

const fvStr = (v) => (v && v.stringValue) || '';
const fvInt = (v) => Number((v && (v.integerValue || v.doubleValue)) || 0);

/** Funde um item no digest do dia e actualiza a notificação de cada membro. */
async function mergeBoardDigest(env, dayKey, item) {
  const prevFields = await fsGetDoc(env, 'board_notify_log', dayKey);
  const prevItems = (prevFields && prevFields.items && prevFields.items.arrayValue && prevFields.items.arrayValue.values) || [];
  const items = [...prevItems, { mapValue: { fields: {
    kind: { stringValue: item.kind },
    refId: item.refId ? { stringValue: item.refId } : { nullValue: null },
    label: { stringValue: item.label },
    at: { integerValue: String(item.at) },
  } } }];
  const count = items.length;
  const firstAt = (prevFields && fvInt(prevFields.firstAt)) || item.at;
  await fsPatchRaw(env, 'board_notify_log', dayKey, {
    dayKey: { stringValue: dayKey },
    items: { arrayValue: { values: items } },
    count: { integerValue: String(count) },
    firstAt: { integerValue: String(firstAt) },
    updatedAt: { integerValue: String(item.at) },
  }, ['dayKey', 'items', 'count', 'firstAt', 'updatedAt']);

  const title = count <= 1 ? 'Novidade em Avisos e Eventos' : `${count} novidades em Avisos e Eventos`;
  const body = items
    .map((iv) => '• ' + fvStr(iv.mapValue && iv.mapValue.fields && iv.mapValue.fields.label))
    .join('\n');
  const members = await fsList(env, 'members', 1000);
  let notified = 0;
  for (const m of members) {
    const email = fvStr(m.fields.email);
    if (!email || fvStr(m.fields.status) === 'Falecido') continue;
    await fsPatch(env, 'notifications', `board-${dayKey}-${m.id}`, {
      userEmail: email, kind: 'board', title, body,
      read: false, createdAt: firstAt, updatedAt: item.at,
      refId: item.refId, byEmail: 'worker@lembrete-evento',
    });
    notified++;
  }
  return notified;
}

/** Eventos de AMANHÃ (Luanda) com reminder1d → lembrete no digest (idempotente). */
async function processEventReminders(env, now) {
  const today = luandaNow(now).dayKey;
  const tomorrow = luandaNow(now + 86400000).dayKey;
  const rows = await fsRunQuery(env, 'events', [eq('date', tomorrow), eq('reminder1d', true)], 100);
  let sent = 0;
  for (const row of rows) {
    const f = row.fields;
    if (fvStr(f.publishStatus) === 'rascunho') continue;          // rascunhos nunca
    const st = fvStr(f.status) || 'marcado';
    if (st === 'cancelado' || st === 'realizado') continue;         // sem lembrete
    if (fvStr(f.reminderSentDay) === today) continue;               // já lembrou hoje
    const time = fvStr(f.time);
    const label = `Lembrete: «${fvStr(f.title)}» é amanhã${time ? ` às ${time}` : ''}`;
    try {
      await mergeBoardDigest(env, today, { kind: 'lembrete', refId: row.id, label, at: now });
      await fsPatch(env, 'events', row.id, { reminderSentDay: today });
      sent++;
    } catch (e) {
      console.error('lembrete de evento falhou ' + row.id + ':', (e && e.message) || e);
    }
  }
  return sent;
}

/* ------------------------------------------------------------------ */
/* 5. Adaptadores de canal (config em providers.config.js)             */
/*    'manual' → a mensagem fica em manual_hold para o operador enviar  */
/*    pelos botões wa.me / sms: da fila. Chaves vivem nos segredos.     */
/* ------------------------------------------------------------------ */
async function sendSms(env, phone, text) {
  if ((PROVIDERS.sms || 'manual') === 'manual') return { state: 'manual_hold' };
  if (PROVIDERS.sms === 'infobip') {
    const r = await fetch('https://api.infobip.com/sms/2/text/advanced', {
      method: 'POST',
      headers: { Authorization: `App ${env.SMS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ from: env.SMS_SENDER_ID || 'IESA', destinations: [{ to: phone }], text }] }),
    });
    return r.ok ? { state: 'sent' } : { state: 'failed', error: 'infobip ' + r.status };
  }
  if (PROVIDERS.sms === 'twilio') {
    const body = new URLSearchParams({ To: phone, From: env.SMS_SENDER_ID || '', Body: text });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${env.TWILIO_SID}:${env.SMS_API_KEY}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return r.ok ? { state: 'sent' } : { state: 'failed', error: 'twilio ' + r.status };
  }
  return { state: 'failed', error: 'fornecedor sms desconhecido' };
}

async function sendWhatsApp(env, phone, text) {
  if ((PROVIDERS.whatsapp || 'manual') === 'manual') return { state: 'manual_hold' };
  if (PROVIDERS.whatsapp === 'meta') {
    const r = await fetch(`https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.replace('+', ''), type: 'text', text: { body: text } }),
    });
    return r.ok ? { state: 'sent' } : { state: 'failed', error: 'meta ' + r.status };
  }
  return { state: 'failed', error: 'fornecedor whatsapp desconhecido' };
}

/* ------------------------------------------------------------------ */
/* 6. CRON: fila (janela de 10 min), lembretes, estados de contribuições */
/* ------------------------------------------------------------------ */
const LUANDA_OFFSET_MS = 60 * 60 * 1000; // UTC+1, sem DST

function luandaNow(nowMs) {
  const d = new Date(nowMs + LUANDA_OFFSET_MS);
  return {
    dow: ((d.getUTCDay() + 6) % 7) + 1, // 1=seg … 7=dom
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dayKey: d.toISOString().slice(0, 10),
  };
}

async function processOutbox(env, now) {
  const rows = await fsRunQuery(env, 'message_outbox', [eq('status', 'pending'), le('cancelUntil', now)]);
  let processed = 0;
  for (const row of rows) {
    const f = row.fields;
    const phone = fv(f, 'phone');
    const accepts = fv(f, 'acceptsMessages') !== false;
    const channels = { sms: fv(f, 'smsState') || 'pending', whatsapp: fv(f, 'waState') || 'pending' };
    const body = fv(f, 'body') || '';
    if (!accepts) { channels.sms = 'not_accepted'; channels.whatsapp = 'not_accepted'; }
    else if (!phone) { channels.sms = 'no_phone'; channels.whatsapp = 'no_phone'; }
    else {
      if (channels.sms === 'pending') channels.sms = (await sendSms(env, phone, body)).state;
      if (channels.whatsapp === 'pending') channels.whatsapp = (await sendWhatsApp(env, phone, body)).state;
    }
    const terminal = (st) => ['sent', 'failed', 'no_phone', 'not_accepted', 'cancelled'].includes(st);
    const held = (st) => st === 'manual_hold';
    const done = terminal(channels.sms) && terminal(channels.whatsapp);
    await fsPatch(env, 'message_outbox', row.id, {
      smsState: channels.sms, waState: channels.whatsapp,
      status: done ? 'done' : held(channels.sms) || held(channels.whatsapp) ? 'held' : 'pending',
      updatedAt: now,
    });
    processed++;
  }
  return processed;
}

/* v2.10.0 (P3) — DOIS defeitos corrigidos aqui:
   1. QUOTA: `fv(f,'paidAmount') !== Math.round(paid*100)/100` comparava uma
      STRING (o Firestore devolve integerValue como texto: "1500") com um
      NÚMERO (1500) — dava sempre diferente, portanto o cron REESCREVIA
      `paidAmount` em todas as contribuições abertas, todos os minutos
      (20 contribuições ≈ 28.800 escritas/dia; o plano Spark permite 20.000).
      A comparação passa a ser numérica e o dinheiro volta a ser inteiro de
      cêntimos de ponta a ponta (sem o arredondamento decimal herdado).
   2. LUANDA: o prazo terminava às 23:59:59 **UTC** = 00:59 do dia seguinte em
      Luanda. Agora termina à meia-noite de LUANDA, como o resto do sistema. */
function luandaEndOfDayMs(dayKey) {
  const s = String(dayKey == null ? '' : dayKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - LUANDA_OFFSET_MS + 86400000 - 1;
}

async function recomputeContributions(env, now) {
  const rows = await fsRunQuery(env, 'contributions', [
    { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'em_curso' }, { stringValue: 'em_atraso' }] } } } },
  ], 500);
  let changed = 0;
  for (const row of rows) {
    const f = row.fields;
    const totalCents = fnum(f, 'amount');
    const pays = await fsRunQuery(env, 'contribution_payments', [eq('contributionId', row.id)], 500);
    const paidCents = pays.reduce((a, p) => a + fnum(p.fields, 'amount'), 0);
    const dueEnd = luandaEndOfDayMs(fv(f, 'dueDate') || '2099-12-31');
    const st = paidCents >= totalCents
      ? 'concluida'
      : (Number.isFinite(dueEnd) && now > dueEnd) ? 'em_atraso' : 'em_curso';
    if (st !== fv(f, 'status')) {
      const patch = { status: st, paidAmount: paidCents };
      if (st === 'concluida') patch.completedAt = now;
      await fsPatch(env, 'contributions', row.id, patch);
      if (st === 'concluida') {
        await fsAdd(env, 'notifications', {
          userEmail: fv(f, 'memberEmail') || '', kind: 'contribution_completed',
          title: 'Contribuição concluída', body: `«${fv(f, 'description')}» foi concluída. Obrigado pela sua fidelidade!`,
          read: false, createdAt: now, refId: row.id,
        });
      }
      changed++;
    } else if (fnum(f, 'paidAmount') !== paidCents) {
      /* Só escreve quando o valor REALMENTE mudou (antes: todos os minutos). */
      await fsPatch(env, 'contributions', row.id, { paidAmount: paidCents });
    }
  }
  return changed;
}

async function runReminders(env, now) {
  // settings/notifications é documento fixo: leitura directa
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const cr = await fetch(`https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/settings/notifications`,
    { headers: { Authorization: `Bearer ${tok}` } });
  const DEF = { perWeek: 3, days: [1, 3, 5], hour: 9, maxWeeks: 8, externalReminders: false, maxExternalPerWeek: 2, testMode: false, alertsEmail: '' };
  let cfg = DEF;
  if (cr.ok) {
    const cj = await cr.json();
    const f = cj.fields || {};
    cfg = {
      perWeek: fnum(f, 'perWeek') || DEF.perWeek,
      days: (f.days?.arrayValue?.values || []).map((v) => Number(v.integerValue)).filter(Boolean),
      hour: fnum(f, 'hour') || DEF.hour,
      maxWeeks: fnum(f, 'maxWeeks') || DEF.maxWeeks,
      externalReminders: f.externalReminders?.booleanValue ?? false,
      maxExternalPerWeek: fnum(f, 'maxExternalPerWeek') || DEF.maxExternalPerWeek,
      testMode: f.testMode?.booleanValue ?? false,
      alertsEmail: f.alertsEmail?.stringValue || '',
    };
    if (!cfg.days.length) cfg.days = DEF.days;
  }
  const L = luandaNow(now);
  const timeOk = cfg.testMode || (cfg.days.includes(L.dow) && L.hour === cfg.hour);
  if (!timeOk) return 0;

  const rows = await fsRunQuery(env, 'contributions', [eq('status', 'em_curso')], 500);
  let sent = 0;
  for (const row of rows) {
    const f = row.fields;
    if (fv(f, 'reminderStopped') === true) continue;
    const startedAt = fnum(f, 'setAt') || now;
    const weeks = (now - startedAt) / (7 * 86400000);
    if (!cfg.testMode && weeks > cfg.maxWeeks) {
      await fsPatch(env, 'contributions', row.id, { reminderStopped: true });
      if (!cfg.alertsEmail) {
        console.log('admin_alert ignorado (defina settings/notifications.alertsEmail para receber estes alertas)');
        continue;
      }
      await fsAdd(env, 'notifications', {
        userEmail: cfg.alertsEmail, kind: 'admin_alert',  /* v2.8.2: destino configurável; sem fallback hardcoded */
        title: 'Lembretes parados (limite de semanas)',
        body: `«${fv(f, 'description')}» de ${fv(f, 'memberName') || fv(f, 'memberEmail')} atingiu ${cfg.maxWeeks} semanas de lembretes sem ser concluída.`,
        read: false, createdAt: now, refId: row.id,
      });
      continue;
    }
    // máx. 1 mensagem/dia/membro (fora do modo de teste)
    if (!cfg.testMode) {
      const today = await fsRunQuery(env, 'message_outbox', [eq('memberId', fv(f, 'memberId')), eq('dedupeDay', L.dayKey)], 1);
      if (today.length) continue;
    }
    // tecto semanal de lembretes
    const weekKey = `${Math.floor(now / (7 * 86400000))}`;
    if (fnum(f, 'reminderWeekKey') === Number(weekKey) && fnum(f, 'reminderWeekCount') >= cfg.perWeek) continue;

    const due = fv(f, 'dueDate') || '';
    const missing = Math.max(0, fnum(f, 'amount') - fnum(f, 'paidAmount'));
    const body = [
      `Paz, ${fv(f, 'memberName') || 'irmão(ã)'}.`,
      `Lembrete amável: a contribuição «${fv(f, 'description')}» tem prazo ${due}.`,
      missing > 0 ? `Valor em falta: ${fmtKz(missing)}.` : '',
      'Se já entregou, desconsidere — e obrigado pela sua fidelidade. Mal. 3:10',
    ].filter(Boolean).join(' ');

    await fsAdd(env, 'notifications', {
      userEmail: fv(f, 'memberEmail') || '', kind: 'reminder',
      title: 'Lembrete de contribuição', body, read: false, createdAt: now, refId: row.id,
    });
    if (cfg.externalReminders && fv(f, 'acceptsMessages') !== false && fv(f, 'phone')) {
      const extWeek = fnum(f, 'extWeekKey') === Number(weekKey) ? fnum(f, 'extWeekCount') : 0;
      if (extWeek < cfg.maxExternalPerWeek) {
        await fsAdd(env, 'message_outbox', {
          memberId: fv(f, 'memberId'), memberEmail: fv(f, 'memberEmail') || null,
          memberName: fv(f, 'memberName') || '', phone: fv(f, 'phone'),
          acceptsMessages: fv(f, 'acceptsMessages') !== false,
          kind: 'reminder', body, smsState: 'pending', waState: 'pending',
          status: 'pending', cancelUntil: 0, dedupeDay: L.dayKey,
          campaignId: null, refId: row.id, createdAt: now, updatedAt: now,
        });
        await fsPatch(env, 'contributions', row.id, { extWeekKey: Number(weekKey), extWeekCount: extWeek + 1 });
      }
    }
    await fsPatch(env, 'contributions', row.id, {
      reminderWeekKey: Number(weekKey),
      reminderWeekCount: (fnum(f, 'reminderWeekKey') === Number(weekKey) ? fnum(f, 'reminderWeekCount') : 0) + 1,
      lastReminderAt: now,
    });
    sent++;
  }
  return sent;
}

/* ------------------------------------------------------------------ */

/* v2.10.0 (P3 «cron resiliente»): cada tarefa corre no SEU try/catch.
   Antes, uma falha na primeira (um índice em falta, um 5xx do Firestore)
   rebentava com as outras três E com o heartbeat: a app passava a dizer
   «Cron SEM pulsar» com o agendador vivo, e nada dizia QUAL tarefa falhava.
   Agora o heartbeat grava `jobsOk` e `lastError` («contributions: runQuery
   contributions: 400») e o /__health expõe-nos.                             */
async function runJob(name, fn) {
  const t0 = Date.now();
  try {
    const n = await fn();
    return { name, ok: true, n: Number(n) || 0, ms: Date.now() - t0, error: null, skipped: false };
  } catch (e) {
    const error = String((e && e.message) || e || 'erro').slice(0, 200);
    console.error(`cron: tarefa «${name}» falhou:`, error);
    return { name, ok: false, n: 0, ms: Date.now() - t0, error, skipped: false };
  }
}

/** Throttle do heartbeat: grava se nunca gravou ou se passou o intervalo. */
function heartbeatThrottled(lastRunAt, now, throttleMs = 10 * 60 * 1000) {
  const last = Number(lastRunAt) || 0;
  return last <= 0 || now - last > throttleMs;
}

/** O minuto actual pertence a um bloco de 5 min? (usado para espaçar o
 *  recálculo de contribuições sem precisar de estado no isolate.) */
function isRecomputeMinute(nowMs) {
  return Math.floor(Number(nowMs) / 60000) % 5 === 0;
}

export default {
  /* Cron do Cloudflare (Workers → Settings → Triggers, ou [triggers] no wrangler):
     a cada minuto. O próprio código decide o que fazer com o minuto actual. */
  async scheduled(event, env) {
    const now = Date.now();
    /* P3 (quota): as contribuições só precisam de ser recalculadas de 5 em 5
       minutos — o cliente já grava status/paidAmount ao registar um pagamento
       e a viragem para «em atraso» é diária. Corta ~80% das leituras do cron. */
    const jobs = [
      await runJob('outbox', () => processOutbox(env, now)),
      isRecomputeMinute(now)
        ? await runJob('contributions', () => recomputeContributions(env, now))
        : { name: 'contributions', ok: true, n: 0, ms: 0, error: null, skipped: true },
      await runJob('reminders', () => runReminders(env, now)),
      await runJob('events', () => processEventReminders(env, now)),
    ];
    console.log('cron: ' + jobs.map((j) => `${j.name}=${j.ok ? j.n : 'ERRO(' + j.error + ')'}`).join(' '));
    const byName = {};
    for (const j of jobs) byName[j.name] = j;
    const failed = jobs.find((j) => !j.ok);
    /* v2.9.1: heartbeat do cron (throttle 10 min) — a app mostra se o
       agendador está vivo (Suporte → Diagnóstico e /__health).
       v2.10.0: é gravado MESMO com tarefas em erro (é o pulso, não o sucesso). */
    try {
      const hb = await fsGetDoc(env, 'settings', 'worker_cron');
      const last = Number((hb && hb.lastRunAt && (hb.lastRunAt.integerValue || hb.lastRunAt.doubleValue)) || 0);
      if (heartbeatThrottled(last, now)) {
        await fsPatch(env, 'settings', 'worker_cron', {
          lastRunAt: now, version: WORKER_VERSION,
          lastOutbox: byName.outbox.n, lastReminders: byName.reminders.n,
          lastEvents: byName.events.n, lastContributions: byName.contributions.n,
          jobsOk: !failed,
          lastError: failed ? `${failed.name}: ${failed.error}` : null,
        });
      }
    } catch (e) {
      console.error('heartbeat falhou:', (e && e.message) || e);
    }
  },

  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;

    /* --- Media pública (cartazes no R2) --- */
    if (request.method === 'GET' && path.startsWith('/media/')) {
      try {
        if (!env.POSTERS_BUCKET) return json({ error: 'R2 não configurado (binding POSTERS_BUCKET).' }, 503);
        const key = decodeURIComponent(path.slice('/media/'.length)).replace(/^\/+/, '');
        if (!key.startsWith('posters/') || key.includes('..')) return json({ error: 'Não encontrado.' }, 404);
        const obj = await env.POSTERS_BUCKET.get(key);
        if (!obj) return json({ error: 'Não encontrado.' }, 404);
        const headers = new Headers(CORS);
        obj.writeHttpMetadata(headers);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response(obj.body, { headers });
      } catch (e) {
        return json({ error: 'Falha ao servir media: ' + ((e && e.message) || e) }, 500);
      }
    }

    /* --- Diagnostico PUBLICO (sem auth): diz qual versao do Worker esta no ar.
       Abra https://iesa-ai.<conta>.workers.dev/__health no browser.
       Se devolver 404 "Rota nao encontrada", o Worker publicado e ANTIGO
       (anterior a v2.0.0) e precisa de ser re-publicado. --- */
    if (path === '/__health' || path === '/health') {
      let cron = null;
      try {
        const hb = await fsGetDoc(env, 'settings', 'worker_cron');
        if (hb) {
          const last = Number((hb.lastRunAt && (hb.lastRunAt.integerValue || hb.lastRunAt.doubleValue)) || 0);
          cron = {
            lastRunAt: last,
            ageMinutes: last ? Math.round((Date.now() - last) / 60000) : null,
            version: (hb.version && hb.version.stringValue) || null,
            /* v2.10.0 (P3): o pulso existe, mas as tarefas correram bem? */
            ok: hb.jobsOk ? hb.jobsOk.booleanValue !== false : null,
            error: (hb.lastError && hb.lastError.stringValue) || null,
            counts: {
              outbox: fvInt(hb.lastOutbox),
              contributions: fvInt(hb.lastContributions),
              reminders: fvInt(hb.lastReminders),
              events: fvInt(hb.lastEvents),
            },
          };
        }
      } catch { /* sem heartbeat ainda */ }
      return json({
        ok: true,
        cron,
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
          '/auth/self-register (público)',
          '/admin/delete-signup-account',
        ],
        models: GEMINI_MODELS,
        config: {
          GEMINI_API_KEY: !!env.GEMINI_API_KEY,
          FIREBASE_SA_JSON: !!env.FIREBASE_SA_JSON,
          PROJECT_ID: env.PROJECT_ID || null,
        },
        time: new Date().toISOString(),
        auth: 'Bearer Firebase ID token obrigatorio (excepto /__health e /auth/self-register)',
        rateLimit: { aiPer10min: RATE_LIMIT, visionPer10min: VISION_RATE_LIMIT },
      });
    }

    try {
      /* --- v1.14.0: AUTO-CADASTRO (público — ainda não tem conta/sessão) ---
         Cria a conta Auth (palavra-passe cifrada pelo Firebase) e o registo
         'pendente' em member_signups/<email>. O membro NÃO entra na app até
         um administrador aprovar (Admin → «Cadastros pendentes»). */
      if (path === '/auth/self-register') {
        if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
        const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
        if (!signupRateOk(ip)) {
          return json({ error: 'Demasiadas tentativas a partir desta ligação. Aguarde uns minutos e tente novamente.' }, 429);
        }
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Pedido inválido.' }, 400); }
        const v = validateSignup(body);
        if (!v.ok) return json({ error: v.error }, 400);
        const s = v.clean;

        /* Duplicados (servidor é a autoridade): email, BI e telefone contra a
           lista oficial; pedidos anteriores pelo mesmo email. Decisão: NÃO
           ligar automaticamente a registos existentes — é o administrador
           que decide (emitir credenciais do membro existente). */
        const byEmail = await fsRunQuery(env, 'members', [eq('email', s.email)], 3);
        if (byEmail.length) return json({ error: 'Já existe uma conta com este email. Tente entrar ou contacte o administrador.', code: 'EMAIL_EXISTS' }, 409);
        if (s.documentNumber) {
          const byBi = await fsRunQuery(env, 'members', [eq('documentNumber', s.documentNumber)], 3);
          if (byBi.length) return json({ error: 'Este B.I. já está cadastrado na igreja. Contacte o administrador — não crie um registo duplicado.', code: 'BI_EXISTS' }, 409);
        }
        if (s.phone) {
          const byPhone = await fsRunQuery(env, 'members', [eq('phone', s.phone)], 3);
          if (byPhone.length) return json({ error: 'Este telefone já está associado a um membro. Contacte o administrador para ligar a sua conta ao registo existente.', code: 'PHONE_EXISTS' }, 409);
        }
        const prev = await fsGetDoc(env, 'member_signups', s.email);
        if (prev) {
          const st = fvStr(prev.statusSignup);
          if (st === 'pendente') return json({ error: 'Já existe um pedido pendente com este email. Aguarde a decisão do administrador.', code: 'SIGNUP_PENDING' }, 409);
          if (st === 'aprovado') return json({ error: 'Este email já está registado. Inicie sessão ou contacte o administrador.', code: 'SIGNUP_APPROVED' }, 409);
          if (st === 'rejeitado') {
            const why = fvStr(prev.reason);
            return json({ error: 'O seu cadastro foi rejeitado' + (why ? ': ' + why : '') + '. Contacte o administrador.', code: 'SIGNUP_REJECTED' }, 409);
          }
        }

        /* 1) conta Auth (o Firebase cifra a palavra-passe; unicidade do email
              é garantida por ele — EMAIL_EXISTS) */
        const saTok = await saAccessToken(env.FIREBASE_SA_JSON);
        const r = await fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + saTok },
          body: JSON.stringify({ email: s.email, password: s.password, displayName: s.name, returnSecureToken: false }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = (j.error && j.error.message) || '';
          if (msg.includes('EMAIL_EXISTS')) return json({ error: 'Já existe uma conta com este email. Tente entrar ou contacte o administrador.', code: 'EMAIL_EXISTS' }, 409);
          if (msg.includes('WEAK_PASSWORD')) return json({ error: 'Palavra-passe demasiado fraca. Use pelo menos 8 caracteres.' }, 400);
          if (msg.includes('INVALID_EMAIL')) return json({ error: 'Email inválido.' }, 400);
          console.error('self-register signupNewUser:', msg || r.status);  /* nunca logar a palavra-passe */
          return json({ error: 'Não foi possível criar a conta agora. Tente novamente daqui a pouco.' }, 500);
        }

        /* 2) registo PENDENTE (id determinístico = email; sem palavra-passe) */
        const { password: _pw, ...docFields } = s;
        void _pw;
        await fsPatch(env, 'member_signups', s.email, {
          ...docFields,
          statusSignup: 'pendente',
          createdAt: Date.now(),
          authUid: (j && j.localId) || null,
          reason: null,
        });
        return json({ ok: true, status: 'pendente' });
      }

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

      /* --- Upload de cartaz para R2 (qualquer admin autenticado) --- */
      if (path === '/admin/upload-poster' && request.method === 'POST') {
        if (!adminDoc) return json({ error: 'Só administradores podem enviar cartazes.' }, 403);
        if (!env.POSTERS_BUCKET) {
          return json({
            error: 'Cloudflare R2 não está ligado a este Worker. Crie o bucket «iesa-event-posters» e faça deploy com binding POSTERS_BUCKET.',
            code: 'R2_NOT_CONFIGURED',
          }, 503);
        }
        const ct = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(ct)) {
          return json({ error: 'Tipo inválido. Use JPG, PNG ou WEBP.' }, 400);
        }
        const buf = await request.arrayBuffer();
        if (!buf || buf.byteLength < 32) return json({ error: 'Ficheiro vazio ou inválido.' }, 400);
        if (buf.byteLength > 10 * 1024 * 1024) return json({ error: 'Ficheiro demasiado grande (máx. 10 MB).' }, 400);
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
        const eventHint = (request.headers.get('X-Event-Id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        const key = `posters/${eventHint || 'evt'}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
        await env.POSTERS_BUCKET.put(key, buf, {
          httpMetadata: { contentType: ct === 'image/jpg' ? 'image/jpeg' : ct },
          customMetadata: { uploadedBy: String(claims.email || ''), at: String(Date.now()) },
        });
        const posterUrl = `${url.origin}/media/${key}`;
        return json({ ok: true, posterUrl, key, bytes: buf.byteLength, workerVersion: WORKER_VERSION });
      }

      if (path === '/admin/delete-poster' && request.method === 'POST') {
        if (!adminDoc) return json({ error: 'Só administradores.' }, 403);
        if (!env.POSTERS_BUCKET) return json({ error: 'R2 não configurado.' }, 503);
        let body = {};
        try { body = await request.json(); } catch (_) {}
        const key = String(body.key || '').replace(/^\/+/, '');
        if (!key.startsWith('posters/') || key.includes('..')) return json({ error: 'Chave inválida.' }, 400);
        await env.POSTERS_BUCKET.delete(key);
        return json({ ok: true });
      }

      /* --- gestão de admins: SÓ super admin (servidor, nao so UI) --- */
      if (path === '/admin/create-auth-account') {
        if (!isSuper) return json({ error: 'Só o super administrador pode criar contas.' }, 403);
        const { email, tempPassword, name, phone } = await request.json();
        const target = String(email || '').trim().toLowerCase();
        if (!target) return json({ error: 'Email obrigatório.' }, 400);
        /* v2.10.0 (P3): email válido + palavra-passe temporária com política. */
        if (!EMAIL_RE.test(target) || target.length > 180) return json({ error: 'Email inválido.' }, 400);
        let pwd = '';
        if (tempPassword) {
          const vp = validateTempPassword(tempPassword);
          if (!vp.ok) return json({ error: vp.error }, 400);
          pwd = vp.value;
        } else {
          pwd = genTempPassword();
        }
        const sa = JSON.parse(env.FIREBASE_SA_JSON);
        const tok = await saAccessToken(env.FIREBASE_SA_JSON);
        const r = await fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ email: target, password: pwd, displayName: target.split('@')[0] }),
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
        if (!EMAIL_RE.test(target) || target.length > 180) return json({ error: 'Email inválido.' }, 400);
        const tDoc = await getAdminDoc(target, env);
        if (!tDoc) return json({ error: 'Este email não está na coleção admins.' }, 404);
        /* v2.8.2: protege QUALQUER conta com a flag isSuper (antes: um email fixo) */
        if (tDoc.isSuper === true) return json({ error: 'A conta de super administrador não pode ser redefinida por aqui.' }, 403);
        const localId = await itGetLocalId(env, target);
        if (!localId) return json({ error: 'Não encontrei a conta de autenticação deste email.' }, 404);
        /* v2.10.0 (P3): mesma política de palavra-passe que na criação. */
        let pwd = '';
        if (tempPassword) {
          const vp = validateTempPassword(tempPassword);
          if (!vp.ok) return json({ error: vp.error }, 400);
          pwd = vp.value;
        } else {
          pwd = genTempPassword();
        }
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
        const tDoc = await getAdminDoc(target, env);
        if (!tDoc) return json({ error: 'Este email não está na coleção admins.' }, 404);
        if (tDoc.isSuper === true) return json({ error: 'A conta de super administrador não pode ser desativada.' }, 403);
        const localId = await itGetLocalId(env, target);
        if (localId) await itSetAccount(env, { localId, disableUser: !!disabled });
        await patchAdminDoc(env, target, { disabled: !!disabled });
        roleCache = { ts: 0, map: {} };
        return json({ ok: true, disabled: !!disabled });
      }

      /* --- apagar administrador (super): Auth + documento admins/<email> --- */
      if (path === '/admin/delete-admin') {
        if (!isSuper) return json({ error: 'Só o super administrador pode apagar administradores.' }, 403);
        const body = await request.json().catch(() => ({}));
        const target = String(body.email || '').toLowerCase().trim();
        if (!target || !target.includes('@')) return json({ error: 'Email obrigatório.' }, 400);
        const caller = String(claims.email || '').toLowerCase();
        if (target === caller) return json({ error: 'Não pode apagar a sua própria conta.' }, 403);
        const tDoc = await getAdminDoc(target, env);
        if (!tDoc) return json({ error: 'Este email não está na coleção admins.' }, 404);
        if (tDoc.isSuper === true) return json({ error: 'A conta de super administrador não pode ser apagada.' }, 403);
        let accountDeleted = false;
        const localId = await itGetLocalId(env, target);
        if (localId) {
          const tok = await saAccessToken(env.FIREBASE_SA_JSON);
          const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ localId }),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            return json({ error: 'Falha ao apagar a conta Auth: ' + ((j.error && j.error.message) || r.status) }, 500);
          }
          accountDeleted = true;
        }
        await fsDeleteDoc(env, 'admins', target);
        roleCache = { ts: 0, map: {} };
        try {
          await fsAdd(env, 'audit_logs', {
            action: 'admin.deleted',
            targetEmail: target,
            byEmail: caller,
            adminEmail: caller,
            at: Date.now(),
            createdAt: Date.now(),
            accountDeleted,
          });
        } catch (_) {}
        return json({ ok: true, accountDeleted, email: target });
      }

      /* --- v2.9.0: apagar CONTA+PEDIDO de um cadastro REJEITADO (admin).
             Liberta o email (o Auth deixava-o preso para sempre) e remove o
             member_signups. Só rejeitados — nunca contas de membros activos. */
      if (path === '/admin/delete-signup-account') {
        if (!(role === 'admin' || isSuper)) return json({ error: 'Só administradores podem apagar contas de cadastros.' }, 403);
        const { signupId } = await request.json();
        const id = String(signupId || '').trim().toLowerCase();
        if (!id) return json({ error: 'signupId obrigatório.' }, 400);
        const sDoc = await fsGetDoc(env, 'member_signups', id);
        if (!sDoc) return json({ error: 'Pedido não encontrado.' }, 404);
        if (fvStr(sDoc.statusSignup) !== 'rejeitado') {
          return json({ error: 'Só é possível apagar contas de cadastros REJEITADOS.' }, 409);
        }
        let accountDeleted = false;
        const localId = await itGetLocalId(env, id);
        if (localId) {
          const tok = await saAccessToken(env.FIREBASE_SA_JSON);
          const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ localId }),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            return json({ error: 'Falha ao apagar a conta Auth: ' + ((j.error && j.error.message) || r.status) }, 500);
          }
          accountDeleted = true;
        }
        await fsDeleteDoc(env, 'member_signups', id);
        roleCache = { ts: 0, map: {} };
        return json({ ok: true, accountDeleted, email: id });
      }

      /* --- liderança (admin/pastor/tesoureiro) --- */
      if (!role || !['admin', 'pastor', 'treasurer'].includes(role)) {
        return json({ error: 'Apenas a liderança pode usar a IA.' }, 403);
      }
      if (!rateOk(claims.email || claims.sub)) {
        return json({ error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente novamente.' }, 429);
      }
      if (path.startsWith('/assistant/') && request.method !== 'POST') {
        return json({ error: 'Metodo nao permitido nas rotas de IA.' }, 405);
      }
      if ((path === '/assistant/extract-member' || path === '/assistant/extract-receipt')
          && !visionRateOk(claims.email || claims.sub)) {
        return json({ error: 'Limite de leituras de documentos atingido. Aguarde alguns minutos.' }, 429);
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
        await logAiAudit(env, { action: 'ai.selftest', email: claims.email, uid: claims.sub, role, path, ok: !!(out.gemini && out.gemini.reachable) });
        return json(out);
      }

      if (path === '/assistant/chat') {
        const bodyChat = await request.json();
        const prompt = sanitizeUserText(bodyChat && bodyChat.prompt, 4000);
        const context = bodyChat && bodyChat.context != null ? sanitizeUserText(bodyChat.context, 6000) : '';
        if (!prompt) return json({ error: 'Prompt obrigatório.' }, 400);
        const contents = context ? `[Contexto:\n${context}]\n\nPedido:\n${prompt}` : prompt;
        { const text = await gemini(env, contents, SYSTEM_ASSISTANT); await logAiAudit(env, { action: 'ai.chat', email: claims.email, uid: claims.sub, role, path, ok: true }); return json({ text }); }
      }

      if (path === '/assistant/financial-insights') {
        const bodyFin = await request.json();
        const financialSummary = anonymizeFinancialSummary(bodyFin && bodyFin.financialSummary);
        const prompt = `Analise os totais agregados (sem nomes nem identificadores pessoais) e forneça um resumo executivo com 3 pontos fortes e 2 recomendações prudentes para a tesouraria:\n\n${JSON.stringify(financialSummary, null, 2)}`;
        { const text = await gemini(env, prompt, 'Você é um consultor financeiro cristão experiente em gestão eclesiástica em Angola.'); await logAiAudit(env, { action: 'ai.financial-insights', email: claims.email, uid: claims.sub, role, path, ok: true }); return json({ text }); }
      }

      if (path === '/assistant/draft-message') {
        const bodyDraft = await request.json();
        const memberName = sanitizeUserText(bodyDraft && bodyDraft.memberName, 120);
        const occasion = sanitizeUserText(bodyDraft && bodyDraft.occasion, 200);
        const tone = sanitizeUserText((bodyDraft && bodyDraft.tone) || 'afetuoso e inspirador', 80);
        if (!memberName || !occasion) return json({ error: 'memberName e occasion obrigatórios.' }, 400);
        const prompt = `Escreva uma mensagem pastoral inspiradora e bíblica para o membro "${memberName}", por ocasião de "${occasion}". Tom: "${tone}". Inclua um versículo bíblico apropriado e felicitações em nome da Igreja Emanuel - Xangongo.`;
        { const text = await gemini(env, prompt, 'Você é o pastor da Igreja Evangélica Sinodal de Angola (Emanuel em Xangongo). Escreva com elegância, calor e brevidade para WhatsApp.'); await logAiAudit(env, { action: 'ai.draft-message', email: claims.email, uid: claims.sub, role, path, ok: true }); return json({ text }); }
      }

      /* --- IA: modelos para mensagens em massa (só liderança) ---
         A IA recebe APENAS o objectivo e as contagens por grupo — nunca nomes,
         telefones ou valores reais. Devolve modelos com {marcadores}. */
      if (path === '/assistant/bulk-templates') {
        const { goal, groups } = await request.json();
        if (!Array.isArray(groups) || !groups.length) return json({ error: 'Grupos obrigatórios.' }, 400);
        const desc = groups.map((g) => `grupo "${g.id}" (${g.label}, ${g.count} pessoas)`).join('; ');
        const prompt = `Escreve UM modelo de mensagem curta e cordial (max 140 palavras) para CADA grupo: ${desc}.
Objectivo declarado pelo administrador: "${goal || 'informar com carinho'}.
REGRAS OBRIGATÓRIAS: usa APENAS estes marcadores, quando fizer sentido: {nome} {descricao} {valor} {prazo} {valor_em_falta}.
NUNCA inventes nomes, valores, telefones ou datas reais. Tom: fraterno, sem pressão, sem culpar.
Responde APENAS com JSON: {"groupId": "texto do modelo", ...}.`;
        try {
          const txt = await gemini(env, prompt, 'És o pastor assistente da IESA Emanuel-Xangongo. Escreves modelos de mensagem com marcadores, nunca dados reais.');
          let parsed = null;
          try { parsed = JSON.parse(txt); } catch { const m2 = txt.match(/\{[\s\S]*\}/); if (m2) { try { parsed = JSON.parse(m2[0]); } catch { /* nada */ } } }
          if (!parsed) return json({ error: 'A IA não devolveu modelos válidos. Escreva o texto à mão.' }, 502);
          return json({ templates: parsed, workerVersion: WORKER_VERSION });
        } catch (e) {
          return json({ error: e?.message || 'Falha na IA. Escreva o texto à mão.' }, 502);
        }
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
          await logAiAudit(env, { action: 'ai.extract-member', email: claims.email, uid: claims.sub, role, path, ok: true });
          return json({ fields: fields || {}, workerVersion: WORKER_VERSION });
        } catch (e) {
          await logAiAudit(env, { action: 'ai.extract-member', email: claims.email, uid: claims.sub, role, path, ok: false, error: e?.message, model: e?.model });
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
          await logAiAudit(env, { action: 'ai.extract-receipt', email: claims.email, uid: claims.sub, role, path, ok: true });
          return json({ fields: fields || {}, workerVersion: WORKER_VERSION });
        } catch (e) {
          await logAiAudit(env, { action: 'ai.extract-receipt', email: claims.email, uid: claims.sub, role, path, ok: false, error: e?.message, model: e?.model });
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

/* ─────────────────────────────────────────────────────────────────────────────
   v2.10.0 (P3) — SUPERFÍCIE DE TESTES
   O Cloudflare usa o `export default` acima; este export extra não muda nada em
   produção (nenhuma rota nova, nenhum segredo exposto) e permite testar, pela
   primeira vez, as funções PURAS do ficheiro mais crítico do sistema — o Worker
   (1500 linhas: validação do auto-cadastro, rate limits, verificação do token
   do Firebase, moeda, Luanda, cron). Testes: worker/__tests__/ai-worker.test.js
   ───────────────────────────────────────────────────────────────────────────── */
function resetBuckets() { signupBuckets.clear(); rateBuckets.clear(); visionBuckets.clear(); }

export const __test = {
  WORKER_VERSION, WORKER_BUILD, PROVIDERS,
  SIGNUP_RATE_LIMIT, RATE_LIMIT, RATE_WINDOW, BUCKET_MAX, TEMP_PASS_ALPHABET,
  validateSignup, validateTempPassword, genTempPassword, isRealIsoDate, isLeapYear,
  signupRateOk, rateOk, visionRateOk, sanitizeUserText, anonymizeFinancialSummary, pruneBuckets, resetBuckets,
  verifyFirebaseIdToken, b64urlDecode,
  luandaNow, luandaEndOfDayMs, fmtKz,
  fv, fvStr, fvInt, fnum, eq, le, isRetryable,
  runJob, heartbeatThrottled, isRecomputeMinute,
};
