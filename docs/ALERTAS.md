# Alertas de falha

Como ser notificado quando algo falha na produção ou nos builds.

---

## 1. Automático no repositório (já configurado)

| Mecanismo | O que faz |
|-----------|-----------|
| **`notify-on-failure`** | Se falhar `system-health`, `worker-health`, Build Android, Deploy Hosting/Firebase/Worker ou `ci`, **abre ou comenta** uma issue no GitHub |
| **`system-health`** | Problema de saúde (Worker/Hosting) → issue *«Saúde do sistema»* |
| **`worker-health`** | Worker desatualizado → issue de drift |

Veja as issues em: https://github.com/cadupaulino99/Gestao_IESA_Emanuel_App/issues

---

## 2. E-mail / app GitHub (recomendado)

1. GitHub (avatar) → **Settings** → **Notifications**.
2. Em **Actions**: active notificações de workflows (e-mail e/ou web).
3. No repositório: **Settings** → **Notifications** / Watch → **Custom** → marque **Issues** e, se existir, actividade de Actions.
4. Opção: **Watch** o repo como *Participating and @mentions* não chega; use **All activity** ou custom com Issues.

Assim, issues criadas pelo monitor e falhas de Actions podem gerar e-mail.

---

## 3. Webhook Discord / Slack / outro (opcional)

1. Crie um webhook no Discord (Canal → Editar → Integrações → Webhooks) ou no Slack (Incoming Webhook).
2. No repositório GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - Nome: **`ALERT_WEBHOOK_URL`**
   - Valor: URL completa do webhook
3. Na próxima falha de um workflow vigiado, o job envia um JSON compatível com Discord (`content` / `embeds`) e Slack (`text`).

Se o secret **não** existir, só há alerta por **issue GitHub** (sem erro).

---

## 4. Workflows vigiados

- `system-health`
- `worker-health`
- `Build Android (APK + AAB)`
- `Deploy Firebase Hosting (web)`
- `Deploy Firebase (regras, índices e funções)`
- `deploy-ai-worker`
- `ci`

---

## 5. Testar

1. Actions → **system-health** → Run workflow (deve ficar verde se produção estiver ok).
2. Para testar o alerta sem partir produção: temporariamente pode correr um workflow que falhe num branch de teste, ou remover o secret e confirmar que a issue é criada em falhas reais.
3. Com `ALERT_WEBHOOK_URL` definido, confirme a mensagem no Discord/Slack.

---

## Relacionado

- [MONITORIZACAO.md](./MONITORIZACAO.md)
- [OPERACOES.md](./OPERACOES.md)
