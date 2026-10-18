import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

/**
 * Cliente das Cloud Functions de IA (Gemini).
 * Substitui os antigos endpoints /api/assistant/* do servidor Express do AI Studio,
 * que não existem dentro do APK. As funções vivem em functions/src/index.ts e
 * correm 24/24 no Firebase — a chave Gemini fica no servidor, nunca no cliente.
 */

const functions = getFunctions(app);

const _chat = httpsCallable<{ prompt: string; context?: string }, { text: string }>(
  functions,
  'assistantChat'
);
const _insights = httpsCallable<{ financialSummary: unknown }, { text: string }>(
  functions,
  'assistantFinancialInsights'
);
const _draft = httpsCallable<{ memberName: string; occasion: string; tone?: string }, { text: string }>(
  functions,
  'assistantDraftMessage'
);

export async function aiChat(prompt: string, context?: string): Promise<string> {
  const res = await _chat({ prompt, context });
  return res.data.text;
}

export async function aiFinancialInsights(financialSummary: unknown): Promise<string> {
  const res = await _insights({ financialSummary });
  return res.data.text;
}

export async function aiDraftMessage(
  memberName: string,
  occasion: string,
  tone?: string
): Promise<string> {
  const res = await _draft({ memberName, occasion, tone });
  return res.data.text;
}

/** Cria/repõe a conta Auth de um utilizador (só admins). Ver functions/src/index.ts */
export const createAuthAccount = httpsCallable<
  { email: string; displayName?: string; tempPassword?: string },
  { ok: boolean; tempPassword?: string; created?: boolean; message?: string }
>(functions, 'createAuthAccount');
