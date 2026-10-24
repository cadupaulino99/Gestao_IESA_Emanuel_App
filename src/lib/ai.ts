import { auth } from './firebase';
import { withBackoff, isRetryableError } from './retry';

/**
 * Cliente de IA — fala com o Cloudflare Worker (gratuito, sem cartão).
 * O URL é colado aqui depois de criares o Worker (docs/GUIA-CLOUDFLARE-WORKER.md).
 * Enquanto estiver vazio, as funções de IA devolvem um erro amigável.
 */
export const WORKER_URL = 'https://iesa-ai.cadupaulino99.workers.dev';

async function callWorker<T>(path: string, body: unknown): Promise<T> {
  if (!WORKER_URL) {
    throw new Error('IA ainda não configurada neste build (Worker URL em falta).');
  }
  const user = auth.currentUser;
  if (!user) throw new Error('Sessão terminada — entre novamente.');
  const idToken = await user.getIdToken();

  /* Leitura de documentos pode levar ~10-20 s em rede móvel; o resto é rápido.
     O timeout existe para a app não ficar «pendurada» para sempre. */
  const timeoutMs = /extract-(member|receipt)/.test(path) ? 120_000 : 60_000;

  return withBackoff(
    async () => {
      let res: Response;
      try {
        res = await fetch(`${WORKER_URL}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          const t = new Error('O servidor de IA demorou demasiado a responder. Tente novamente.') as Error & { status?: number };
          t.status = 408;
          throw t;
        }
        const n = new Error('Sem ligação ao servidor de IA. Verifique a internet e tente novamente.') as Error & { status?: number };
        n.status = 0;
        n.name = 'TypeError';
        throw n;
      }

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const d = data as any;
        let msg = d?.error || `Erro ${res.status} ao contactar a IA.`;
        /* O Worker devolve `detalhe` com o texto cru da IA quando o JSON falha —
           mostra-se para permitir diagnostico em vez de um erro vazio. */
        if (d?.detalhe) msg += `  ·  detalhe: ${String(d.detalhe).slice(0, 200)}`;
        /* 404 numa rota de visão = Worker publicado é anterior à v1.7.0 */
        if (res.status === 404 && /extract-(member|receipt)/.test(path)) {
          msg =
            'O servidor de IA (Cloudflare Worker) está desatualizado e não tem a rota de leitura de documentos. ' +
            'Publique novamente o ficheiro worker/ai-worker.js no Worker "iesa-ai" (Cloudflare → Workers → Edit code → colar → Save and Deploy). ' +
            'Confirme em ' + WORKER_URL + '/__health';
        }
        if (res.status === 403 && /liderança/i.test(msg)) {
          msg += ' O seu utilizador precisa de um registo em Admin → Utilizadores com papel admin/pastor/tesoureiro.';
        }
        if (res.status === 429) msg += ' (quota/limite — aguarde uns segundos; o sistema já tentou várias vezes)';
        const e = new Error(msg) as Error & { status?: number; detail?: string };
        e.status = res.status;
        e.detail = d?.detalhe;
        throw e;
      }
      return data as T;
    },
    {
      tries: 3,
      baseMs: 900,
      retryable: isRetryableError,
    }
  );
}

export async function aiChat(prompt: string, context?: string): Promise<string> {
  const r = await callWorker<{ text: string }>('/assistant/chat', { prompt, context });
  return r.text;
}

export async function aiFinancialInsights(financialSummary: unknown): Promise<string> {
  const r = await callWorker<{ text: string }>('/assistant/financial-insights', { financialSummary });
  return r.text;
}

export async function aiDraftMessage(memberName: string, occasion: string, tone?: string): Promise<string> {
  const r = await callWorker<{ text: string }>('/assistant/draft-message', { memberName, occasion, tone });
  return r.text;
}

/** Cria a conta Auth de um administrador (SÓ super admin; o Worker valida). */
export async function createAuthAccount(input: { email: string; tempPassword: string; name?: string; phone?: string }) {
  const data = await callWorker<{ ok: boolean; created?: boolean; tempPassword?: string }>(
    '/admin/create-auth-account',
    input
  );
  return { data };
}

/** Repõe a palavra-passe temporária de um admin (só super; devolve-a UMA vez). */
export async function resetTempPassword(input: { email: string; tempPassword: string }) {
  return callWorker<{ ok: boolean; tempPassword: string }>('/admin/reset-temp-password', input);
}

/** Ativa/desativa a conta de um admin sem apagar dados (só super). */
export async function setAccountDisabled(input: { email: string; disabled: boolean }) {
  return callWorker<{ ok: boolean; disabled: boolean }>('/admin/set-account-disabled', input);
}

/* ------------------------------------------------------------------ */
/* v1.7.0 — Visão: ler documentos com IA                               */
/* ------------------------------------------------------------------ */

/** Converte um File em base64 sem passar pelo <canvas> (fallback). */
function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || '');
      const i = s.indexOf(',');
      resolve({ base64: i >= 0 ? s.slice(i + 1) : s, mimeType: file.type || 'image/jpeg' });
    };
    fr.onerror = () => reject(new Error('Não foi possível ler o ficheiro de imagem.'));
    fr.readAsDataURL(file);
  });
}

/** Comprime uma imagem no browser (canvas) antes de enviar.
 *  Máx. 2048 px no lado maior, JPEG 0.85 — equilíbrio entre nitidez suficiente
 *  para OCR do BI e tamanho aceitável para redes móveis (Angola).
 *  Devolve também o tamanho aproximado em KB para diagnóstico.
 *
 *  Se o <canvas> não conseguir descodificar o ficheiro (HEIC/HEIF de alguns
 *  telemóveis, imagem corrompida, WebView antiga), envia os bytes originais —
 *  o Gemini aceita PNG, JPEG, WEBP, HEIC e HEIF. */
export async function compressImageFile(
  file: File,
  opts: { max?: number; quality?: number } = {}
): Promise<{ base64: string; mimeType: string; width: number; height: number; approxKb: number }> {
  const MAX_SIDE = opts.max ?? 2048;
  const QUALITY = opts.quality ?? 0.85;
  const url = URL.createObjectURL(file);
  try {
    let img: HTMLImageElement;
    try {
      img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('decode-failed'));
        i.src = url;
      });
    } catch {
      const raw = await fileToBase64(file);
      return { ...raw, width: 0, height: 0, approxKb: Math.round((raw.base64.length * 3) / 4 / 1024) };
    }

    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const raw = await fileToBase64(file);
      return { ...raw, width: img.width, height: img.height, approxKb: Math.round((raw.base64.length * 3) / 4 / 1024) };
    }
    /* Fundo branco: evita que PNG com transparência fique preto ao virar JPEG. */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    /* Canvas sem dados (imagem não descodificada): sai um JPEG minúsculo/vazio. */
    if (!base64 || base64.length < 2048) {
      const raw = await fileToBase64(file);
      return { ...raw, width: img.width, height: img.height, approxKb: Math.round((raw.base64.length * 3) / 4 / 1024) };
    }
    return {
      base64,
      mimeType: 'image/jpeg',
      width: canvas.width,
      height: canvas.height,
      approxKb: Math.round((base64.length * 3) / 4 / 1024),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------------------ */
/* Diagnóstico do Worker                                              */
/* ------------------------------------------------------------------ */

export interface WorkerHealth {
  ok: boolean;
  version?: string;
  build?: string;
  vision?: boolean;
  routes?: string[];
  models?: string[];
  config?: { GEMINI_API_KEY?: boolean; FIREBASE_SA_JSON?: boolean; PROJECT_ID?: string | null };
  error?: string;
}

/** GET /__health — não precisa de sessão. Serve para confirmar qual versão do
 *  Worker está publicada (se der 404, o Worker é anterior à v2.0.0). */
export async function checkWorkerHealth(): Promise<WorkerHealth> {
  if (!WORKER_URL) return { ok: false, error: 'WORKER_URL não definido em src/lib/ai.ts.' };
  try {
    const res = await fetch(`${WORKER_URL}/__health`, { method: 'GET' });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) return { ok: false, error: (data as any)?.error || `HTTP ${res.status}` };
    return data as WorkerHealth;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Sem resposta do Worker.' };
  }
}

export interface SelfTestResult {
  ok: boolean;
  workerVersion?: string;
  user?: { email: string | null; uid: string | null; role: string | null };
  config?: { GEMINI_API_KEY?: boolean; FIREBASE_SA_JSON?: boolean; PROJECT_ID?: string | null };
  gemini?: { reachable: boolean; model: string | null; error: string | null };
}

/** POST /assistant/selftest — exige sessão + papel de liderança. */
export async function aiSelfTest(): Promise<SelfTestResult> {
  return callWorker<SelfTestResult>('/assistant/selftest', {});
}

/**
 * Diagnóstico completo da ligação de IA, em linguagem simples.
 * Partilhado pelo modal de leitura de documentos e pela página Suporte.
 * Não lança exceções: devolve sempre as linhas para mostrar ao utilizador.
 */
export async function runAiDiagnostics(): Promise<{ lines: string[]; ok: boolean }> {
  const lines: string[] = [];
  let ok = false;

  const h = await checkWorkerHealth();
  if (!h.ok) {
    lines.push(`✗ Servidor de IA inacessível (${h.error}).`);
    lines.push('→ Verifique a ligação à internet e se o Worker "iesa-ai" está publicado na Cloudflare.');
    lines.push(`→ URL configurado: ${WORKER_URL}`);
    return { lines, ok };
  }

  if (!h.version) {
    lines.push('✗ O servidor de IA respondeu, mas é uma versão ANTIGA (não tem /__health).');
    lines.push('→ Esta versão NÃO lê documentos: é por isso que a foto do BI não preenche nada.');
    lines.push('→ Publique de novo o Worker: npm run deploy:worker  (ou Cloudflare → Workers → iesa-ai → Edit code → colar worker/ai-worker.js → Save and Deploy).');
    return { lines, ok };
  }

  lines.push(`✓ Servidor de IA online — versão ${h.version} (build ${h.build || '?'}).`);
  lines.push(h.vision ? '✓ Leitura de documentos (visão) disponível.' : '✗ Esta versão NÃO tem leitura de documentos.');
  if (Array.isArray(h.models)) lines.push(`✓ Modelos configurados: ${h.models.join(' → ')}.`);

  const cfg = h.config || {};
  if (cfg.GEMINI_API_KEY === false) lines.push('✗ Falta o segredo GEMINI_API_KEY no Worker (Settings → Variables and Secrets).');
  else lines.push('✓ Segredo GEMINI_API_KEY presente.');
  if (cfg.FIREBASE_SA_JSON === false) lines.push('✗ Falta o segredo FIREBASE_SA_JSON no Worker.');
  else lines.push('✓ Segredo FIREBASE_SA_JSON presente.');
  if (!cfg.PROJECT_ID) lines.push('✗ Falta a variável PROJECT_ID no Worker.');

  const hasVisionRoute = Array.isArray(h.routes) && h.routes.includes('/assistant/extract-member');
  if (!hasVisionRoute) {
    lines.push('✗ A rota /assistant/extract-member não está publicada — a leitura do BI devolve 404.');
    lines.push('→ Re-publique o Worker (ver acima).');
    return { lines, ok };
  }

  try {
    const st = await aiSelfTest();
    const role = st.user?.role || null;
    if (role) {
      lines.push(`✓ Sessão aceite — papel "${role}" (${st.user?.email || 's/ email'}).`);
    } else {
      lines.push(`✗ A sua conta não tem papel de liderança (${st.user?.email || 's/ email'}).`);
      lines.push('→ Sem papel admin/pastor/tesoureiro a IA é bloqueada (403). Adicione o seu email em Admin → Utilizadores.');
    }
    if (st.gemini?.reachable) {
      lines.push(`✓ Gemini a responder (modelo ${st.gemini.model}).`);
      ok = !!role;
    } else {
      lines.push(`✗ Gemini falhou: ${st.gemini?.error || 'erro desconhecido'}`);
      const em = String(st.gemini?.error || '');
      if (/API key not valid/i.test(em)) lines.push('→ A chave GEMINI_API_KEY é inválida. Crie outra em https://aistudio.google.com/apikey e atualize o segredo no Worker.');
      else if (/quota|429/i.test(em)) lines.push('→ Quota esgotada na chave Gemini. Aguarde alguns minutos ou ative faturação na chave.');
      else if (/model/i.test(em)) lines.push('→ O modelo pedido não existe nesta chave. Ajuste GEMINI_MODELS em worker/ai-worker.js.');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lines.push(`✗ Teste de sessão falhou: ${msg}`);
    if (/Sessão terminada/i.test(msg)) lines.push('→ auth.currentUser é nulo: saia da app e volte a entrar.');
    if (/liderança/i.test(msg)) lines.push('→ O seu email não está na coleção admins com papel admin/pastor/tesoureiro.');
  }

  return { lines, ok };
}

export interface MemberFields {
  name?: string | null;
  documentNumber?: string | null;
  birthDate?: string | null;
  address?: string | null;
  gender?: string | null;
  issueDate?: string | null;
  memberNumber?: string | null;
  baptismDate?: string | null;
  groupCell?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface ReceiptFields {
  amount?: number | null;
  currency?: string | null;
  date?: string | null;
  method?: string | null;
  bank?: string | null;
  payerName?: string | null;
  reference?: string | null;
  notes?: string | null;
}

/* ------------------------------------------------------------------ */
/* Normalização — os campos só aparecem no formulário se estiverem no  */
/* formato que o controlo espera. Sem isto, uma data "07/03/1990" ou   */
/* um sexo "M" lidos do BI são silenciosamente ignorados pelo <input   */
/* type="date"> e pelo <Select>, e parece que "a IA não leu nada".     */
/* ------------------------------------------------------------------ */

const MONTHS_PT: Record<string, string> = {
  jan: '01', janeiro: '01', feb: '02', fev: '02', fevereiro: '02', mar: '03', marco: '03', março: '03',
  abr: '04', abril: '04', may: '05', mai: '05', maio: '05', jun: '06', junho: '06', jul: '07', julho: '07',
  aug: '08', ago: '08', agosto: '08', sep: '09', set: '09', setembro: '09', oct: '10', out: '10', outubro: '10',
  nov: '11', novembro: '11', dec: '12', dez: '12', dezembro: '12',
};

/** Converte qualquer data razoável (DD/MM/AAAA, DD-MM-AAAA, "7 de Março de 1990",
 *  "1990/03/07", AAAAMMDD) para AAAA-MM-DD. Devolve null se não conseguir. */
export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const ymd = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;

  /* DD/MM/AAAA ou DD-MM-AAAA ou DD.MM.AAAA (formato angolano/português) */
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = (Number(y) > 30 ? '19' : '20') + y;
    if (Number(d) > 31 || Number(m) > 12) return null;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  /* "7 de Março de 1990" / "7 Março 1990" */
  const textual = s.toLowerCase().match(/^(\d{1,2})\s*(?:de\s+)?([a-zçãáéíóú]+)\.?\s*(?:de\s+)?(\d{4})$/);
  if (textual) {
    const mm = MONTHS_PT[textual[2]];
    if (mm) return `${textual[3]}-${mm}-${textual[1].padStart(2, '0')}`;
  }

  const onlyYear = s.match(/^(\d{4})$/);
  if (onlyYear) return `${onlyYear[1]}-01-01`;

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/** Converte o sexo lido do documento para os valores do <Select> do formulário. */
export function normalizeGender(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (s === 'm' || s.startsWith('masc') || s === 'male' || s === 'homem') return 'Masculino';
  if (s === 'f' || s.startsWith('fem') || s === 'female' || s === 'mulher') return 'Feminino';
  return 'Outro';
}

/** Telefone angolano: devolve +244XXXXXXXXX quando reconhece 9 dígitos. */
export function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('244') && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+244${digits}`;
  return String(value).trim();
}

/** Nº do BI: só dígitos (o modelo angolano tem 8 dígitos + dígito de controlo). */
export function normalizeDocumentNumber(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, '');
  return digits || s;
}

/** Aplica normalização a todos os campos devolvidos pela IA. */
export function normalizeMemberFields(f: MemberFields): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const put = (k: string, v: string | null) => { if (v !== null && v !== '') out[k] = v; };

  put('name', f.name ? String(f.name).trim().replace(/\s+/g, ' ') : null);
  put('documentNumber', normalizeDocumentNumber(f.documentNumber));
  put('birthDate', normalizeDate(f.birthDate));
  put('issueDate', normalizeDate(f.issueDate));
  put('baptismDate', normalizeDate(f.baptismDate));
  put('address', f.address ? String(f.address).trim() : null);
  put('gender', normalizeGender(f.gender));
  put('phone', normalizePhone(f.phone));
  put('memberNumber', f.memberNumber ? String(f.memberNumber).trim() : null);
  put('groupCell', f.groupCell ? String(f.groupCell).trim() : null);
  put('notes', f.notes ? String(f.notes).trim() : null);
  return out;
}

/** Lê BI ('bi') ou cartão de membro batizado ('cartao', manuscrito).
 *  Devolve os campos já normalizados para o formulário. */
export async function aiExtractMember(imageBase64: string, mimeType: string, kind: 'bi' | 'cartao'): Promise<MemberFields> {
  const r = await callWorker<{ fields: MemberFields }>('/assistant/extract-member', { imageBase64, mimeType, kind });
  return r.fields || {};
}

/** Lê comprovativo bancário de transferência/depósito. */
export async function aiExtractReceipt(imageBase64: string, mimeType: string): Promise<ReceiptFields> {
  const r = await callWorker<{ fields: ReceiptFields }>('/assistant/extract-receipt', { imageBase64, mimeType });
  return r.fields || {};
}
