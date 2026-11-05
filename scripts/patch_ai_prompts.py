#!/usr/bin/env python3
from pathlib import Path
p = Path("worker/ai-worker.js")
t = p.read_text()
if "WORKER_VERSION = '2.11.1'" in t and "sanitizeUserText" in t and "anonymizeFinancialSummary" in t and "bodyChat" in t:
    print("already")
    raise SystemExit(0)

t = t.replace(
    "const WORKER_VERSION = '2.11.0';\nconst WORKER_BUILD = '2026-11-05 (P1: auth IA, rate limit visao, auditoria AI)';",
    "const WORKER_VERSION = '2.11.1';\nconst WORKER_BUILD = '2026-11-05 (P1: sanitizar prompts, anonimizar financas, auth/rate/audit)';",
    1,
)

helpers = """
function sanitizeUserText(input, maxLen) {
  let s = String(input == null ? '' : input);
  s = s.replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/\\b(ignore|disregard|forget)\\s+(all\\s+)?(previous|prior|above)\\s+(instructions?|prompts?|rules?)\\b/gi, '[filtrado]');
  s = s.replace(/\\b(system\\s*:|assistant\\s*:|developer\\s*:)\\s*/gi, '');
  s = s.replace(/\\s+/g, ' ').trim();
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

"""
if "function sanitizeUserText" not in t:
    idx = t.find("async function logAiAudit(env, entry) {")
    if idx < 0:
        raise SystemExit("logAiAudit missing")
    t = t[:idx] + helpers + t[idx:]

old_chat = "        const { prompt, context } = await request.json();\n        if (!prompt) return json({ error: 'Prompt obrigatório.' }, 400);\n        const contents = context ? `[Contexto:\\n${context}]\\n\\nPedido:\\n${prompt}` : prompt;"
new_chat = "        const bodyChat = await request.json();\n        const prompt = sanitizeUserText(bodyChat && bodyChat.prompt, 4000);\n        const context = bodyChat && bodyChat.context != null ? sanitizeUserText(bodyChat.context, 6000) : '';\n        if (!prompt) return json({ error: 'Prompt obrigatório.' }, 400);\n        const contents = context ? `[Contexto:\\n${context}]\\n\\nPedido:\\n${prompt}` : prompt;"
if old_chat not in t:
    raise SystemExit("chat missing")
t = t.replace(old_chat, new_chat, 1)

old_fin = "        const { financialSummary } = await request.json();\n        const prompt = `Analise os dados financeiros da igreja e forneça um resumo executivo com 3 pontos fortes e 2 recomendações prudentes para a tesouraria:\\n\\n${JSON.stringify(financialSummary, null, 2)}`;"
new_fin = "        const bodyFin = await request.json();\n        const financialSummary = anonymizeFinancialSummary(bodyFin && bodyFin.financialSummary);\n        const prompt = `Analise os totais agregados (sem nomes nem identificadores pessoais) e forneça um resumo executivo com 3 pontos fortes e 2 recomendações prudentes para a tesouraria:\\n\\n${JSON.stringify(financialSummary, null, 2)}`;"
if old_fin not in t:
    raise SystemExit("fin missing")
t = t.replace(old_fin, new_fin, 1)

old_draft = "        const { memberName, occasion, tone } = await request.json();\n        if (!memberName || !occasion) return json({ error: 'memberName e occasion obrigatórios.' }, 400);\n        const prompt = `Escreva uma mensagem pastoral inspiradora e bíblica para o membro \"${memberName}\", por ocasião de \"${occasion}\". Tom: \"${tone || 'afetuoso e inspirador'}\". Inclua um versículo bíblico apropriado e felicitações em nome da Igreja Emanuel - Xangongo.`;"
new_draft = "        const bodyDraft = await request.json();\n        const memberName = sanitizeUserText(bodyDraft && bodyDraft.memberName, 120);\n        const occasion = sanitizeUserText(bodyDraft && bodyDraft.occasion, 200);\n        const tone = sanitizeUserText((bodyDraft && bodyDraft.tone) || 'afetuoso e inspirador', 80);\n        if (!memberName || !occasion) return json({ error: 'memberName e occasion obrigatórios.' }, 400);\n        const prompt = `Escreva uma mensagem pastoral inspiradora e bíblica para o membro \"${memberName}\", por ocasião de \"${occasion}\". Tom: \"${tone}\". Inclua um versículo bíblico apropriado e felicitações em nome da Igreja Emanuel - Xangongo.`;"
if old_draft not in t:
    raise SystemExit("draft missing")
t = t.replace(old_draft, new_draft, 1)

if "sanitizeUserText," not in t:
    t = t.replace(
        "  signupRateOk, rateOk, visionRateOk, pruneBuckets, resetBuckets,",
        "  signupRateOk, rateOk, visionRateOk, sanitizeUserText, anonymizeFinancialSummary, pruneBuckets, resetBuckets,",
        1,
    )

for s in ["2.11.1", "bodyChat", "bodyFin", "bodyDraft", "sanitizeUserText", "anonymizeFinancialSummary"]:
    if s not in t:
        raise SystemExit("fail " + s)
p.write_text(t)
print("ok", len(t))
