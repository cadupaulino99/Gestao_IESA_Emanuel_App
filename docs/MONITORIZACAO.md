# Monitorização de saúde do sistema

Como saber se a app em produção está bem — **automático** (GitHub Actions) e **manual**.

---

## O que é vigiado

| Componente | Como | Frequência |
|------------|------|------------|
| **Cloudflare Worker** (`/__health`) | HTTP 200, `ok`, versão, vision, secrets, **R2 bound**, cron recente | A cada 6 h + manual |
| **Drift** Worker (repo vs ar) | Compara `WORKER_VERSION` em `worker/ai-worker.js` com `/__health` | Idem + diário em `worker-health` |
| **Firebase Hosting** | HTTP 200 em `.web.app` / `.firebaseapp.com` | A cada 6 h |
| **Firestore / Auth** | Sem probe automático (precisaria de credenciais de serviço no CI) | Consola Firebase / uso da app |

Workflows:

- **`system-health`** — visão global; abre issue *«Saúde do sistema»* se falhar
- **`worker-health`** — foco em drift do Worker; abre issue de Worker desatualizado

---

## Verificação manual (1 minuto)

1. **Worker**
   ```text
   https://iesa-ai.cadupaulino99.workers.dev/__health
   ```
   Esperado: JSON com `"ok": true`, `r2.bound: true`, `config.GEMINI_API_KEY` e `FIREBASE_SA_JSON` a `true`, `cron.ageMinutes` baixo (minutos, não horas).

2. **Web**
   ```text
   https://iesa-emanuel-xangongo.web.app/
   ```
   Esperado: página da app (não “Site Not Found”).

3. **App**
   - Login admin e um ecrã (Início / Membros).
   - Versão no login ≈ última release / `package.json`.

4. **GitHub Actions**
   - Separador **Actions** → `system-health` → último run **verde**.

---

## Se estiver vermelho

| Sintoma | Acção |
|---------|--------|
| Worker HTTP ≠ 200 ou `ok: false` | Cloudflare → Worker `iesa-ai`; redeploy (`deploy-ai-worker`) |
| `R2 não bound` | Binding `POSTERS_BUCKET` no Worker + redeploy |
| Secret em falta | Cloudflare → Variables and Secrets |
| Drift de versão | Publicar `worker/ai-worker.js` (deploy Worker) |
| Cron `ageMinutes` alto | Ver logs do Worker / triggers cron |
| Hosting ≠ 200 | Actions → `deploy-hosting` |
| Login/dados na app | Firebase Console (Auth, Firestore, regras) |

---

## Estado na altura da implementação

Probe manual (exemplo):

- Worker: `ok`, versão presente, R2 bound, secrets presentes
- Hosting: HTTP 200

---

## Relacionado

- [OPERACOES.md](./OPERACOES.md) — rotina do administrador
- [RELEASE.md](./RELEASE.md) — publicar versões
- [GUIA-CLOUDFLARE-WORKER.md](./GUIA-CLOUDFLARE-WORKER.md) — Worker
