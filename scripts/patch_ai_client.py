#!/usr/bin/env python3
from pathlib import Path
p = Path("src/lib/ai.ts")
t = p.read_text()
if "export function sanitizeUserText" in t and "totalTithesKz" in t:
    print("already")
    raise SystemExit(0)

helpers = '''
/** Remove control chars, tags HTML e tentativas comuns de injeccao de prompt. */
export function sanitizeUserText(input: unknown, maxLen = 4000): string {
  let s = String(input ?? '');
  s = s.replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/\\b(ignore|disregard|forget)\\s+(all\\s+)?(previous|prior|above)\\s+(instructions?|prompts?|rules?)\\b/gi, '[filtrado]');
  s = s.replace(/\\b(system\\s*:|assistant\\s*:|developer\\s*:)\\s*/gi, '');
  s = s.replace(/\\s+/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/** So totais agregados — sem nomes, IDs, listas de membros ou movimentos. */
export function anonymizeFinancialSummary(raw: unknown) {
  const s = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.abs(n) >= 1000 && Number.isInteger(n) ? Math.round(n / 100) : Math.round(n);
  };
  return {
    year: typeof s.year === 'number' || typeof s.year === 'string' ? s.year : null,
    totalTithesKz: num(s.totalTithes),
    totalOfferingsKz: num(s.totalOfferings),
    totalExpensesKz: num(s.totalExpenses),
    balanceKz: num(s.balance),
    totalMembers: typeof s.totalMembers === 'number' ? s.totalMembers : null,
    activeMembers: typeof s.activeMembers === 'number' ? s.activeMembers : null,
  };
}

'''

if "export const WORKER_URL" not in t:
    raise SystemExit("WORKER_URL missing")
t = t.replace(
    "export const WORKER_URL = 'https://iesa-ai.cadupaulino99.workers.dev';\n",
    "export const WORKER_URL = 'https://iesa-ai.cadupaulino99.workers.dev';\n" + helpers,
    1,
)

old = '''export async function aiChat(prompt: string, context?: string): Promise<string> {
  const r = await callWorker<{ text: string }>('/assistant/chat', { prompt, context });
  return r.text;
}

export async function aiFinancialInsights(financialSummary: unknown): Promise<string> {
  // v1.12: a app guarda cêntimos; à IA enviam-se kwanzas legíveis
  const s: any = financialSummary || {};
  const kz = (n: unknown) => (typeof n === 'number' ? Math.round(n) / 100 : n);
  const readable = { ...s, totalTithes: kz(s.totalTithes), totalOfferings: kz(s.totalOfferings), totalExpenses: kz(s.totalExpenses), balance: kz(s.balance) };
  const r = await callWorker<{ text: string }>('/assistant/financial-insights', { financialSummary: readable });
  return r.text;
}

export async function aiDraftMessage(memberName: string, occasion: string, tone?: string): Promise<string> {
  const r = await callWorker<{ text: string }>('/assistant/draft-message', { memberName, occasion, tone });
  return r.text;
}
'''
new = '''export async function aiChat(prompt: string, context?: string): Promise<string> {
  const r = await callWorker<{ text: string }>('/assistant/chat', {
    prompt: sanitizeUserText(prompt, 4000),
    context: context != null ? sanitizeUserText(context, 6000) : undefined,
  });
  return r.text;
}

export async function aiFinancialInsights(financialSummary: unknown): Promise<string> {
  const safe = anonymizeFinancialSummary(financialSummary);
  const r = await callWorker<{ text: string }>('/assistant/financial-insights', { financialSummary: safe });
  return r.text;
}

export async function aiDraftMessage(memberName: string, occasion: string, tone?: string): Promise<string> {
  const r = await callWorker<{ text: string }>('/assistant/draft-message', {
    memberName: sanitizeUserText(memberName, 120),
    occasion: sanitizeUserText(occasion, 200),
    tone: tone != null ? sanitizeUserText(tone, 80) : undefined,
  });
  return r.text;
}
'''
if old not in t:
    raise SystemExit("ai functions block missing")
t = t.replace(old, new, 1)
if "totalTithesKz" not in t:
    raise SystemExit("anon missing")
p.write_text(t)
print("ok", len(t))
