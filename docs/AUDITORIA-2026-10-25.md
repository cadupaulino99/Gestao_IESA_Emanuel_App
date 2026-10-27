# 🔎 Auditoria profunda — 2026-10-25 (estado na v1.14.2)

Verificação de segurança, fiabilidade, integridade de dados, performance e
higiene do repositório. Linha de base: 142 testes verdes, `tsc` limpo, CI com
gates, Worker 2.8.0 saudável, cron activo.

## 🔴 P0 — corrigidos na v1.14.3

| # | Achado | Evidência | Correcção |
|---|---|---|---|
| 1 | **Qualquer sessão autenticada lia TODA a lista de membros** (nome, BI, telefone, morada, foto) — incluindo cadastros pendentes/rejeitados | `firestore.rules` `match /members` com `read, list: if isAuthenticated()` | `canReadMemberDoc()` (liderança ‖ próprio por `memberEmail` **ou** `email` ‖ legado); `pedidos_atualizacao` passou a leitura só-liderança |
| 2 | **CRITICAL no shell Android**: `@capacitor/android`/`ios` 8.3.4 — "remote content can be loaded" na WebView | `npm audit` | Capacitor core/android/ios/cli → **8.5.3**; vitest 2.1.9 → 3.2.7 |
| 3 | **Backup cobria 13 de 27 colecções** — de fora: communions/donations/renewals (cartão), contributions/payments/member_budgets, settings, agenda_items, member_signups, campaigns… | `Admin.tsx handleBackup` | Lista completa (só `trash` fica de fora, por ser já uma cópia) |
| 4 | **Erros silenciosos sistémicos**: `handleFirestoreError` relançava JSON em 55 sítios dentro de catch → rejeições não tratadas, UI sem reacção (causa do «Cadastros Pendentes vazio») | `lib/firebase.ts` | Toast legível (mapa código→mensagem, testado) + log completo; sem rethrow |
| 5 | **Sem ErrorBoundary**: excepção de render = ecrã branco sem recuperação | grep vazio em `src/` | `components/ErrorBoundary.tsx` global (painel + resumo do erro + versão + recarregar) |

## 🟠 P1 — a corrigir em seguida (não feito nesta versão)

6. `renewals` legível por qualquer sessão e sem `memberEmail` nos documentos
   novos → gravar `memberEmail` nas renovações novas e alinhar leitura com
   `canReadMemberDoc` (como communions/donations).
7. **Auditoria incompleta**: aprovar/rejeitar cadastros, publicar
   avisos/eventos e correr backups não escrevem em `audit_logs` (só a gestão
   de admins e Finanças escrevem).
8. **Super admin hardcoded para sempre**: `cadupaulino99@gmail.com` fixo nas
   rules (fallback `isSuperAdmin`) e no Worker (`SUPER_EMAIL`). Confirmar que
   o documento `admins/` tem `isSuper: true` e remover o fallback de email
   (manter só o bootstrap auto-extinguível).
   ✅ **FEITO (v1.14.4/v1.14.5)**: flag `isSuper: true` confirmada pelo
   proprietário a 2026-10-27; fallback removido das rules, do Worker
   (guardas passaram a consultar o documento do alvo) e do AuthContext.
   Worker 2.8.2.
9. Risco residual de dependências (documentado, não incluído no APK ou
   dev-only): `tinypool` 1.x via vitest 3 (fix exige vitest 4/Node 22),
   `vite` dev-server (nunca exposto), `@grpc/grpc-js` (só build node do
   Firestore — WebView usa webchannel), `xlsx` (sem fix no npm; usado só
   pela liderança em ficheiros próprios), `express`/`body-parser` (servidor
   de dev). Rever no próximo ciclo de majors.

## 🟡 P2 — melhorias sugeridas

10. **`@types/react` ausente**: o `tsc` não verifica JSX/props (tudo `any`) —
    foi preciso `declare props` no ErrorBoundary. Introduzir os tipos
    gradualmente (módulos novos primeiro); apanha bugs em compile-time.
11. **Higiene do repo** (~21 MB): remover `apk/` (11 MB; as Releases já
    alojam os APKs), decidir sobre `functions/` (morto no plano Spark),
    mover `express` para devDependencies, remover `@capacitor/ios` se não
    houver plano iOS.
12. **Fotos de auto-cadastro em base64** dentro do documento (~700 KB máx.
    contra o limite de 1 MB do Firestore) — migrar para o Storage (padrão
    dos cartazes) antes de aparecerem documentos inchados.
13. **Storage**: qualquer conta autenticada pode TENTAR escrever em
    `posters/**` (regras do Storage não lêem o Firestore — limitação
    documentada). Mitigação futura: custom claims (exige Functions/Blaze) ou
    manter o risco documentado (escrita inútil sem referência em evento).
14. **Rate limits do Worker por isolate** (melhor esforço, como o resto do
    projeto) — suficiente à escala actual; subir para Cloudflare Rate
    Limiting rules se o volume crescer.
15. **Testes de componentes** (login, cadastro, aprovação) — hoje só funções
    puras (146). E pinar `firebase-tools@X.Y.Z` no workflow de deploy (o
    `@latest` pode partir sem aviso).
16. Enumeração no auto-cadastro: os 409 específicos (email/BI/telefone já
    existem) revelam registos — aceite por desenho (o membro precisa de saber
    para contactar o administrador) e mitigado pelo rate limit. Alternativa
    futura: mensagens genéricas + notificação ao admin.

## Verificações que passaram

- Colecções no código vs regras: **todas cobertas** (27/27 + budgets/settings).
- Índices: queries novas são de campo único; compostos existentes chegam.
- Worker: segredos intactos (`GEMINI`, `SA_JSON`, `PROJECT_ID`), cron
  `* * * * *` activo, rotas autenticadas a 401 sem token, `/__health` 2.8.0.
- Actualização in-app: banner no Layout **e** no Portal; releases a sair.
- Datas/horas: padrão Luanda (strings locais) consistente nos módulos novos.
- Moeda: fonte única `formatKz`/cêntimos sem fugas detectadas.
