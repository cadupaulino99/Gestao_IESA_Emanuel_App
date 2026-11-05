#!/usr/bin/env python3
"""P1 security: reinforce AI auth, vision rate limit, audit logs."""
from pathlib import Path
import re

p = Path("worker/ai-worker.js")
t = p.read_text()
if "WORKER_VERSION = '2.11.0'" in t and "logAiAudit" in t and "visionRateOk" in t:
    print("already patched")
    raise SystemExit(0)

t = t.replace(
    "const WORKER_VERSION = '2.10.0';\n"
    "const WORKER_BUILD = '2026-10-31 (P3: cron resiliente por tarefa + heartbeat com erros, token Firebase mais estrito, palavra-passe temporaria validada, prazos em Luanda, paidAmount sem escritas repetidas)';",
    "const WORKER_VERSION = '2.11.0';\n"
    "const WORKER_BUILD = '2026-11-05 (P1: auth IA, rate limit visao, auditoria AI)';",
    1,
)

m = re.search(r"function rateOk\(email\) \{[\s\S]*?\n\}", t)
if not m:
    raise SystemExit("rateOk missing")
if "function visionRateOk" not in t:
    extra = """
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
"""
    t = t.replace(m.group(0), m.group(0) + "\n" + extra, 1)

gate_old = (
    "      if (!rateOk(claims.email || claims.sub)) {\n"
    "        return json({ error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente novamente.' }, 429);\n"
    "      }\n"
    "\n"
    "      /* --- Autodiagnostico (lideranca): confirma segredos, papel e o Gemini."
)
gate_new = (
    "      if (!rateOk(claims.email || claims.sub)) {\n"
    "        return json({ error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente novamente.' }, 429);\n"
    "      }\n"
    "      if (path.startsWith('/assistant/') && request.method !== 'POST') {\n"
    "        return json({ error: 'Metodo nao permitido nas rotas de IA.' }, 405);\n"
    "      }\n"
    "      if ((path === '/assistant/extract-member' || path === '/assistant/extract-receipt')\n"
    "          && !visionRateOk(claims.email || claims.sub)) {\n"
    "        return json({ error: 'Limite de leituras de documentos atingido. Aguarde alguns minutos.' }, 429);\n"
    "      }\n"
    "\n"
    "      /* --- Autodiagnostico (lideranca): confirma segredos, papel e o Gemini."
)
if gate_old not in t:
    raise SystemExit("gate missing")
t = t.replace(gate_old, gate_new, 1)

subs = [
    (
        "        return json({ text: await gemini(env, contents, SYSTEM_ASSISTANT) });",
        "        { const text = await gemini(env, contents, SYSTEM_ASSISTANT); await logAiAudit(env, { action: 'ai.chat', email: claims.email, uid: claims.sub, role, path, ok: true }); return json({ text }); }",
    ),
    (
        "        return json({ text: await gemini(env, prompt, 'Você é um consultor financeiro cristão experiente em gestão eclesiástica em Angola.') });",
        "        { const text = await gemini(env, prompt, 'Você é um consultor financeiro cristão experiente em gestão eclesiástica em Angola.'); await logAiAudit(env, { action: 'ai.financial-insights', email: claims.email, uid: claims.sub, role, path, ok: true }); return json({ text }); }",
    ),
    (
        "        return json({ text: await gemini(env, prompt, 'Você é o pastor da Igreja Evangélica Sinodal de Angola (Emanuel em Xangongo). Escreva com elegância, calor e brevidade para WhatsApp.') });",
        "        { const text = await gemini(env, prompt, 'Você é o pastor da Igreja Evangélica Sinodal de Angola (Emanuel em Xangongo). Escreva com elegância, calor e brevidade para WhatsApp.'); await logAiAudit(env, { action: 'ai.draft-message', email: claims.email, uid: claims.sub, role, path, ok: true }); return json({ text }); }",
    ),
]
for a, b in subs:
    if a not in t:
        raise SystemExit("missing return: " + a[:70])
    t = t.replace(a, b, 1)

old = (
    "          return json({ fields: fields || {}, workerVersion: WORKER_VERSION });\n"
    "        } catch (e) {\n"
    "          return json(\n"
    "            { error: e?.message || 'Falha na leitura.', detalhe: e?.raw || undefined, status: e?.status, model: e?.model, workerVersion: WORKER_VERSION },\n"
    "            e?.status === 429 ? 429 : 502\n"
    "          );\n"
    "        }\n"
    "      }\n"
    "\n"
    "      /* --- VISAO: ler comprovativo bancario --- */"
)
new = (
    "          await logAiAudit(env, { action: 'ai.extract-member', email: claims.email, uid: claims.sub, role, path, ok: true });\n"
    "          return json({ fields: fields || {}, workerVersion: WORKER_VERSION });\n"
    "        } catch (e) {\n"
    "          await logAiAudit(env, { action: 'ai.extract-member', email: claims.email, uid: claims.sub, role, path, ok: false, error: e?.message, model: e?.model });\n"
    "          return json(\n"
    "            { error: e?.message || 'Falha na leitura.', detalhe: e?.raw || undefined, status: e?.status, model: e?.model, workerVersion: WORKER_VERSION },\n"
    "            e?.status === 429 ? 429 : 502\n"
    "          );\n"
    "        }\n"
    "      }\n"
    "\n"
    "      /* --- VISAO: ler comprovativo bancario --- */"
)
if old not in t:
    raise SystemExit("member vision return missing")
t = t.replace(old, new, 1)

old = (
    "          return json({ fields: fields || {}, workerVersion: WORKER_VERSION });\n"
    "        } catch (e) {\n"
    "          return json(\n"
    "            { error: e?.message || 'Falha na leitura.', detalhe: e?.raw || undefined, status: e?.status, model: e?.model, workerVersion: WORKER_VERSION },\n"
    "            e?.status === 429 ? 429 : 502\n"
    "          );\n"
    "        }\n"
    "      }\n"
    "\n"
    "      return json({\n"
    "        error: 'Rota nao encontrada.',"
)
new = (
    "          await logAiAudit(env, { action: 'ai.extract-receipt', email: claims.email, uid: claims.sub, role, path, ok: true });\n"
    "          return json({ fields: fields || {}, workerVersion: WORKER_VERSION });\n"
    "        } catch (e) {\n"
    "          await logAiAudit(env, { action: 'ai.extract-receipt', email: claims.email, uid: claims.sub, role, path, ok: false, error: e?.message, model: e?.model });\n"
    "          return json(\n"
    "            { error: e?.message || 'Falha na leitura.', detalhe: e?.raw || undefined, status: e?.status, model: e?.model, workerVersion: WORKER_VERSION },\n"
    "            e?.status === 429 ? 429 : 502\n"
    "          );\n"
    "        }\n"
    "      }\n"
    "\n"
    "      return json({\n"
    "        error: 'Rota nao encontrada.',"
)
if old not in t:
    raise SystemExit("receipt vision return missing")
t = t.replace(old, new, 1)

t = t.replace(
    "        return json(out);\n"
    "      }\n"
    "\n"
    "      if (path === '/assistant/chat') {",
    "        await logAiAudit(env, { action: 'ai.selftest', email: claims.email, uid: claims.sub, role, path, ok: !!(out.gemini && out.gemini.reachable) });\n"
    "        return json(out);\n"
    "      }\n"
    "\n"
    "      if (path === '/assistant/chat') {",
    1,
)

t = t.replace(
    "function resetBuckets() { signupBuckets.clear(); rateBuckets.clear(); }",
    "function resetBuckets() { signupBuckets.clear(); rateBuckets.clear(); visionBuckets.clear(); }",
    1,
)
t = t.replace(
    "  signupRateOk, rateOk, pruneBuckets, resetBuckets,",
    "  signupRateOk, rateOk, visionRateOk, pruneBuckets, resetBuckets,",
    1,
)
if "rateLimit:" not in t:
    t = t.replace(
        "        time: new Date().toISOString(),\n      });",
        "        time: new Date().toISOString(),\n"
        "        auth: 'Bearer Firebase ID token obrigatorio (excepto /__health e /auth/self-register)',\n"
        "        rateLimit: { aiPer10min: RATE_LIMIT, visionPer10min: VISION_RATE_LIMIT },\n"
        "      });",
        1,
    )

for s in ["2.11.0", "logAiAudit", "visionRateOk", "ai.chat", "ai.extract-receipt"]:
    if s not in t:
        raise SystemExit("fail " + s)

p.write_text(t)
print("ok", len(t))
