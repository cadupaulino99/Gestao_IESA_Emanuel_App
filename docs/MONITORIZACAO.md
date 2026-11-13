# Monitorização de saúde e métricas

Como vigiar a produção: **pass/fail**, **métricas** e **histórico** (artifacts).

---

## Métricas recolhidas (`system-health`)

A cada **6 horas** (e manualmente), o workflow grava `health-metrics.json`:

| Métrica | Significado | Limiar de alerta |
|---------|-------------|------------------|
| `worker.http` | Status HTTP de `/__health` | ≠ 200 |
| `worker.latencyMs` | Tempo de resposta do Worker | > 5000 ms |
| `worker.ok` | Campo `ok` do health | false |
| `worker.version` | Versão publicada | ausente |
| `worker.drift` | Versão ar ≠ `WORKER_VERSION` no repo | true |
| `worker.vision` | Capacidade vision/Gemini | false |
| `worker.config.*` | Secrets presentes (boolean) | algum false |
| `worker.r2.bound` | Binding R2 cartazes | false |
| `worker.cron.ageMinutes` | Há quanto o cron correu | > 180 min |
| `worker.cron.ok` | Cron sem erro | false |
| `worker.cron.counts` | Filas (outbox, contributions, …) | informativo |
| `hosting.*.http` | Status do site | ambos ≠ 200 |
| `hosting.*.latencyMs` | Tempo de resposta Hosting | min > 8000 ms |

**Artifact:** no run do Actions → **health-metrics** (retenção 30 dias) → descarregar JSON para comparar runs.

**Summary:** tabela no separador Summary de cada execução.

---

## Onde ver

| Vista | Onde |
|-------|------|
| Último run | Actions → **system-health** |
| JSON de métricas | Artifact **health-metrics** no run |
| Agora (manual) | https://iesa-ai.cadupaulino99.workers.dev/__health |
| Web | https://iesa-emanuel-xangongo.web.app/ |
| Alertas | Issues + [ALERTAS.md](./ALERTAS.md) |

---

## Verificação manual rápida

```bash
# Worker + pretty print
curl -sS https://iesa-ai.cadupaulino99.workers.dev/__health | python3 -m json.tool

# Latência aproximada
curl -sS -o /dev/null -w "worker %{http_code} %{time_total}s\n" https://iesa-ai.cadupaulino99.workers.dev/__health
curl -sS -o /dev/null -w "hosting %{http_code} %{time_total}s\n" https://iesa-emanuel-xangongo.web.app/
```

Esperado: `ok: true`, `r2.bound: true`, secrets `true`, `cron.ageMinutes` baixo, HTTP 200, latência de poucos segundos no máximo.

---

## Se uma métrica estiver má

| Problema | Acção |
|----------|--------|
| Worker down / ok false | Cloudflare Worker → logs → `deploy-ai-worker` |
| R2 not bound | Binding `POSTERS_BUCKET` + redeploy |
| Secret em falta | Cloudflare → Secrets |
| Drift de versão | Publicar Worker a partir de `main` |
| Cron stale | Logs do Worker / triggers |
| Hosting down | `deploy-hosting` |
| Latência alta | Transitório ou região; repetir; ver status Cloudflare/Firebase |

---

## O que ainda não é medido automaticamente

- Leituras/escritas Firestore (quotas) — consolas Firebase
- Erros de login na app — uso real / Analytics futuro
- APK instalada nos telemóveis — versão no ecrã de login

---

## Relacionado

- [ALERTAS.md](./ALERTAS.md) — notificações de falha
- [OPERACOES.md](./OPERACOES.md) — rotina
- [RELEASE.md](./RELEASE.md) — releases
