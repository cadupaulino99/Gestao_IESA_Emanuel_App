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
