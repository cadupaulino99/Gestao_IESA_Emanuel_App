// v1.7.0: visao (BI, cartao manuscrito, comprovativos) + rate limit + cache. COLAR no painel Cloudflare (Workers > iesa-ai > Edit code).
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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
/* 1. Verificar o ID token do Firebase (JWT RS256, certs do Google)    */
/* ------------------------------------------------------------------ */
let certCache = { ts: 0, keys: {} };

async function verifyFirebaseIdToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('token malformado');
  const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
  const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp < now) throw new Error('token expirado');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('emissor inválido');
  if (claims.aud !== projectId) throw new Error('audiência inválida');

  // certificados públicos do Google (cache 6h)
  if (Date.now() - certCache.ts > 6 * 3600 * 1000) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    const j = await r.json();
    certCache = { ts: Date.now(), keys: Object.fromEntries(j.keys.map((k) => [k.kid, k])) };
  }
  const cert = certCache.keys[header.kid];
  if (!cert) throw new Error('certificado desconhecido');

  const pem = cert.x5c ? cert.x5c[0] : null;
  let key;
  if (pem) {
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    key = await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } else {
    key = await crypto.subtle.importKey('jwk', cert, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    str2buf(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/'))),
    str2buf(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new Error('assinatura inválida');
  return claims; // { sub, email, ... }
}

/* ------------------------------------------------------------------ */
/* 2. Token OAuth da service account (para ler o Firestore)            */
/* ------------------------------------------------------------------ */
let saCache = { ts: 0, token: '', exp: 0 };

async function saAccessToken(saJson) {
  if (saCache.token && Date.now() - saCache.ts < saCache.exp - 60 * 1000) return saCache.token;
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(str2buf(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(str2buf(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey(
    'pkcs8', str2buf(sa.private_key),
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

async function getRole(email, env) {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (Date.now() - roleCache.ts > ROLE_TTL) roleCache = { ts: Date.now(), map: {} };
  if (roleCache.map[lower] !== undefined) return roleCache.map[lower];
  const tok = await saAccessToken(env.FIREBASE_SA_JSON);
  const url = `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/admins/${lower}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) { roleCache.map[lower] = null; return null; }
  const doc = await r.json();
  const roleField = (doc.fields || {}).role;
  const role = roleField ? roleField.stringValue : 'admin';
  roleCache.map[lower] = role;
  return role;
}

/* ------------------------------------------------------------------ */
/* 3. Gemini                                                           */
/* ------------------------------------------------------------------ */
async function gemini(env, prompt, systemInstruction) {
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
      }),
    }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'erro Gemini ' + r.status);
  const parts = j?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('');
}

/* ------------------------------------------------------------------ */
/* 3b. Gemini com VISAO (documentos: BI, cartao de membro, comprovativos) */
/* ------------------------------------------------------------------ */
async function geminiVision(env, prompt, systemInstruction, imageBase64, mimeType) {
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
    }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'erro Gemini ' + r.status);
  const txt = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  try { return JSON.parse(txt); } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

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
      const role = await getRole(claims.email, env);

      /* --- admin-only --- */
      if (path === '/admin/create-auth-account') {
        if (role !== 'admin') return json({ error: 'Só administradores.' }, 403);
        const { email, tempPassword } = await request.json();
        const pwd = tempPassword || b64url(crypto.getRandomValues(new Uint8Array(9)));
        const sa = JSON.parse(env.FIREBASE_SA_JSON);
        const tok = await saAccessToken(env.FIREBASE_SA_JSON);
        const r = await fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ email, password: pwd, displayName: email.split('@')[0] }),
        });
        const j = await r.json();
        if (!r.ok) {
          // conta já existe? repor palavra-passe
          if ((j.error?.message || '').includes('EMAIL_EXISTS')) {
            const sa2 = JSON.parse(env.FIREBASE_SA_JSON);
            void sa2;
            const r2 = await fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/setAccountInfo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
              body: JSON.stringify({ email, password: pwd }),
            });
            const j2 = await r2.json();
            if (!r2.ok) return json({ error: j2.error?.message || 'erro' }, 500);
            return json({ ok: true, created: false, tempPassword: pwd });
          }
          return json({ error: j.error?.message || 'erro' }, 500);
        }
        void sa;
        return json({ ok: true, created: true, tempPassword: pwd });
      }

      /* --- liderança (admin/pastor/tesoureiro) --- */
      if (!role || !['admin', 'pastor', 'treasurer'].includes(role)) {
        return json({ error: 'Apenas a liderança pode usar a IA.' }, 403);
      }
      if (!rateOk(claims.email || claims.sub)) {
        return json({ error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente novamente.' }, 429);
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
        const prompt = kind === 'cartao'
          ? 'Leia este CARTAO DE MEMBRO BATIZADO da igreja (texto manuscrito ou impresso). Extraia e devolva JSON com as chaves: {"name": nome completo, "memberNumber": numero do membro/codigo, "baptismDate": data do batismo, "groupCell": celula ou grupo, "phone": telefone, "notes": outra informacao util}. Manuscrito: faca o melhor esforco; se ilegivel, null.'
          : 'Leia este BILHETE DE IDENTIDADE angolano. Extraia e devolva JSON com as chaves: {"name": nome completo, "documentNumber": numero do BI, "birthDate": data de nascimento, "address": residencia, "gender": "M" ou "F", "issueDate": data de emissao}.';
        return json({ fields: await geminiVision(env, prompt, SYS_EXTRACTOR, imageBase64, mime) });
      }

      /* --- VISAO: ler comprovativo bancario --- */
      if (path === '/assistant/extract-receipt') {
        const { imageBase64, mimeType } = await request.json();
        if (!imageBase64) return json({ error: 'Imagem obrigatoria.' }, 400);
        const prompt = 'Leia este COMPROVATIVO BANCARIO (transferencia ou deposito, banco angolano: BAI, BFA, BIC, BPC, Standard Bank, Millennium, etc.). Extraia e devolva JSON com as chaves: {"amount": valor numerico em AOA sem simbolos, "currency": "AOA", "date": data da operacao, "method": "transferencia" ou "deposito" ou "multicaixa" ou "outro", "bank": nome do banco, "payerName": nome de quem pagou, "reference": numero de operacao/referencia, "notes": observacoes}.';
        return json({ fields: await geminiVision(env, prompt, SYS_EXTRACTOR, imageBase64, mimeType || 'image/jpeg') });
      }

      return json({ error: 'Rota nao encontrada.' }, 404);
    } catch (e) {
      return json({ error: e?.message || 'Erro interno.' }, 500);
    }
  },
};
