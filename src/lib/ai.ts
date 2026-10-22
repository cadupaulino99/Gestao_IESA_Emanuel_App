import { auth } from './firebase';

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
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Erro ${res.status} ao contactar a IA.`);
  return data as T;
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

/** Cria/repõe a conta Auth de um utilizador (só admins) — via Worker. */
export async function createAuthAccount(input: { email: string; displayName?: string; tempPassword?: string }) {
  const data = await callWorker<{ ok: boolean; created?: boolean; tempPassword?: string }>(
    '/admin/create-auth-account',
    input
  );
  return { data };
}

/* ------------------------------------------------------------------ */
/* v1.7.0 — Visão: ler documentos com IA                               */
/* ------------------------------------------------------------------ */

/** Comprime uma imagem no browser (canvas) antes de enviar: máx. 2048 px, JPEG 0.85 (OCR-friendly). */
export async function compressImageFile(file: File): Promise<{ base64: string; mimeType: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      i.src = url;
    });
    const MAX = 2048;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
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

/** Lê BI ('bi') ou cartão de membro batizado ('cartao', manuscrito). */
export async function aiExtractMember(imageBase64: string, mimeType: string, kind: 'bi' | 'cartao'): Promise<MemberFields> {
  const r = await callWorker<{ fields: MemberFields }>('/assistant/extract-member', { imageBase64, mimeType, kind });
  return r.fields || {};
}

/** Lê comprovativo bancário de transferência/depósito. */
export async function aiExtractReceipt(imageBase64: string, mimeType: string): Promise<ReceiptFields> {
  const r = await callWorker<{ fields: ReceiptFields }>('/assistant/extract-receipt', { imageBase64, mimeType });
  return r.fields || {};
}
