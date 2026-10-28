# ✅ VERIFICAÇÃO — Migração memberEmail + senha self-service (v1.16.0)

Objectivo: fechar a «porta legada» (documentos sem dono legíveis por QUALQUER
sessão) SEM trancar o Portal de ninguém. Por isso a ordem importa.

## 0. Publicar (já feito se estás a ler isto no repo actualizado)
1. Regras novas: workflow **«Deploy Firebase»** (a porta continua ABERTA até
   à migração correr — publicar as regras não muda nada por si só).
2. **APK v1.16.0** instalado no telemóvel do administrador (a migração vive
   em Admin → Gestão de Dados).

## 1. Cópia de segurança (obrigatório)
Admin → *Gestão de Dados* → **«1. Descarregar cópia de segurança»** →
marcar «Fiz a cópia de segurança».

## 2. Analisar (não altera nada)
No cartão **«Migração v1.16.0 — Carimbar memberEmail»**:
- [ ] «1. Analisar» → toast + plano com contagens por colecção
      (members, tithes, communions, donations, renewals, contributions,
      contribution_payments, member_budgets) e órfãos.

## 3. Executar
- [ ] «2. Carimbar e fechar a porta legada» → toast «Migração concluída:
      N carimbo(s). Leitura legada FECHADA…».
- [ ] Repetir «Analisar» → plano a **zero** (idempotente).

## 4. Regressões (2 contas: um membro e a liderança)
- [ ] **Membro**: Portal → «Geral & Finanças» (dízimos, orçamento,
      contribuições e pagamentos visíveis) e «O meu cartão» (comunhões,
      donativos, renovações, dízimos).
- [ ] **Liderança**: Membros, Finanças, Contribuições, cartões — tudo igual.
- [ ] Lançar um dízimo/pagamento NOVO e confirmar que continua visível para
      o membro (os escritores futuros já carimbam memberEmail).

## 5. Prova do fecho (servidor, não UI)
Com sessão de **membro**, na Consola do browser (app aberta):
```js
// token: DevTools → Application → IndexedDB → firebaseLocalStorageDb → stsTokenManager.accessToken
fetch('https://firestore.googleapis.com/v1/projects/iesa-emanuel-xangongo/databases/(default)/documents/members?pageSize=5', {
  headers: { Authorization: 'Bearer COLAR_O_TOKEN' }
}).then(async r => console.log(r.status, (await r.text()).slice(0, 200)));
```
→ Tem de devolver **403 PERMISSION_DENIED** (antes devolvia 200 com a lista!).
Documentos órfãos/legados por carimbar também deixam de ser legíveis por
não-liderança — é exactamente o objectivo.

## 6. Palavra-passe self-service (liderança)
Definições → **«A minha palavra-passe»**:
- [ ] Actual errada → «A palavra-passe actual está errada.»
- [ ] Nova = actual → recusa; nova < 8 → recusa; confirmação diferente → recusa.
- [ ] Correcto → «Palavra-passe alterada com sucesso.»; sair e entrar com a NOVA.
- [ ] Conta só-Google: descrição explica o caminho (não rebenta).
- [ ] audit_logs recebe `password.self-changed` (aba Auditoria).

## 7. Reversão de emergência
Se algo prender membros: Firestore Console → `settings/system` →
`memberEmailStamped = false` → a porta legada reabre IMEDIATAMENTE
(`legacyReadOpen()` nas regras). Corrija os carimbos e volte a fechar.
