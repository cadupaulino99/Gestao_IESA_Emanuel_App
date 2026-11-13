# Higiene operacional — IESA Emanuel

Procedimentos do dia-a-dia para o administrador da igreja e para quem mantém a app. **Não exige programar.**

---

## 1. Acesso (membro / admin não entra)

Guia completo: **[CHECKLIST-ACESSO-MEMBRO-ADMIN.md](./CHECKLIST-ACESSO-MEMBRO-ADMIN.md)**

Resumo:

| Situação | Acção |
|----------|--------|
| Novo membro | Cadastros Pendentes → aprovar → confirmar ficha em Membros → pedir logout/login |
| Aprovado sem portal | Filtro Aprovados → **Recriar ficha de membro** |
| Novo admin | Confirmar `admins/<email>` → 1.º login com senha **temporária** no campo «actual» → definir nova |
| Conta desactivada | Só o super administrador reactiva |
| App «estranha» | APK da última release / Ctrl+F5 na web |

---

## 2. Publicar versão (APK + web)

Guia: **[RELEASE.md](./RELEASE.md)**

1. Versão em `package.json`
2. Código em `main`
3. Build Android + Deploy Hosting (e Firebase/Worker se mudaram)
4. Confirmar versão no telemóvel = versão no GitHub Releases

---

## 3. Monitorização e alertas

| Tema | Doc |
|------|-----|
| Saúde Worker + Hosting | [MONITORIZACAO.md](./MONITORIZACAO.md) |
| Alertas de falha (issues + e-mail + webhook) | [ALERTAS.md](./ALERTAS.md) |

- Actions → **system-health** (cada 6 h)
- Falhas críticas → issue automática (`notify-on-failure`)
- Opcional: secret **`ALERT_WEBHOOK_URL`** (Discord/Slack)

---

## 4. Segurança básica (fora do código)

| Item | Onde |
|------|------|
| MFA na conta Google do super admin | Conta Google |
| App Check + restrição API key | [GUIA-APP-CHECK-API-KEY.md](./GUIA-APP-CHECK-API-KEY.md) |
| Secrets (Worker, keystore) | GitHub Actions → Secrets; Cloudflare Worker secrets |
| Nunca partilhar senha temporária em grupo público | WhatsApp da liderança com cuidado |

---

## 5. Rotina semanal sugerida

- [ ] Cadastros Pendentes — aprovar ou rejeitar o que estiver à espera
- [ ] Actions → **system-health** verde (ou abrir `/__health` manualmente)
- [ ] Issues abertas de «Falha no workflow» / «Saúde do sistema» — tratar ou fechar
- [ ] Se houve release: equipa de teste com a **mesma** versão APK
- [ ] Dados no Firebase — não apagar o projecto `iesa-emanuel-xangongo`

---

## 6. Documentos relacionados

| Doc | Tema |
|-----|------|
| [CHECKLIST-ACESSO-MEMBRO-ADMIN.md](./CHECKLIST-ACESSO-MEMBRO-ADMIN.md) | Login / cadastro / admin |
| [MONITORIZACAO.md](./MONITORIZACAO.md) | Saúde Worker + Hosting |
| [ALERTAS.md](./ALERTAS.md) | Notificações de falha |
| [RELEASE.md](./RELEASE.md) | Versões e workflows |
| [GUIA-APP-CHECK-API-KEY.md](./GUIA-APP-CHECK-API-KEY.md) | App Check e API key |
| [GUIA-CLOUDFLARE-WORKER.md](./GUIA-CLOUDFLARE-WORKER.md) | Worker IA |
| [GUIA-FIREBASE.md](./GUIA-FIREBASE.md) | Firebase |
| [GUIA-BUILD-APK.md](./GUIA-BUILD-APK.md) | Build Android |
