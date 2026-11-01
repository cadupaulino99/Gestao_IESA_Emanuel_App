# 🔎 Auditoria profunda — 2026-10-31 (estado na v1.18.0) → **P3**

Segunda auditoria geral. Linha de base: **191 testes** verdes, `tsc` limpo (raiz)
e strict em `src/lib`, Worker **2.9.1** no ar com cron activo, P0/P1/P2 da
auditoria de 2026-10-25 fechados.

Método: leitura integral de `firestore.rules` (663 linhas), `storage.rules`,
`worker/ai-worker.js` (1465 linhas), `src/lib/*` e de todas as chamadas a
`new Date()`/`getDocs`/`addDoc` da UI. Cada achado tem **evidência** (ficheiro e
comportamento) e **correcção**. Tudo o que é corrigível sem dependências novas
foi corrigido nesta versão (**v1.19.0 / Worker 2.10.0**).

---

## 🔴 P3-A — Datas: o fuso do aparelho e o UTC ainda mandavam em ~50 sítios

`lib/luanda.ts` existe desde a v1.13.0 e o README diz que «datas são strings
locais de Luanda», mas só os módulos de Avisos/Agenda/Eventos a usavam. O resto
da aplicação continuava em `new Date().getMonth()` (fuso do **aparelho**) e
`new Date().toISOString().slice(0,10)` (**UTC**). Em Luanda (UTC+1) isto não é
teórico:

| # | Achado | Evidência | Correcção |
|---|---|---|---|
| 1 | **Todas as datas de nascimento importadas do Excel recuavam 1 dia** | `Members.tsx:103` — `new Date(y, m-1, d).toISOString().split('T')[0]`: meia-noite *local* em UTC+1 são 23:00 UTC do **dia anterior** | `isoFromParts(y, m, d)` (pura, sem fuso) |
| 2 | **Lançamentos feitos entre as 00:00 e as 01:00 guardavam o dia ANTERIOR** | 24 sítios com `new Date().toISOString().slice(0,10)/.split('T')[0]/.substring(0,10)`: prazo e entrega de contribuições, referência de ofertas/despesas, período dos relatórios, donativos/renovações do cartão, nomes de ficheiros de backup e Excel | `luandaDayKey()` |
| 3 | **«Mês corrente»/«ano corrente» dependiam do fuso do aparelho** | 15 sítios: Dashboard, Finanças, Relatórios, Orçamento, Obrigações, Portal do Membro, cartão, dízimos | `luandaYear()` / `luandaMonth()` / `luandaMonthIdx()` / `luandaMonthStr()` |
| 4 | **Aniversariantes errados** (dia do aparelho + formato legado ignorado) | `Dashboard.tsx` e `useNotifications.ts` comparavam `getMonth()/getDate()` locais; `birthDate.split('-')` devolve `NaN` para `'DD/MM/AAAA'` e o membro **desaparecia** da lista | `isBirthdayToday()` / `normalizeBirthDate()` (aceitam ISO, `DD/MM/AAAA`, `DD-MM-AAAA` e epoch) |
| 5 | **Gráficos «últimos 6 meses» partiam-se na viragem do ano** | `new Date(currentYear, currentMonth - i, 1)` em `Members.tsx`, `MemberPortal.tsx`, `MemberTithesTracker.tsx` | `lastMonthsLuanda(n)` — pura, testada, atravessa o ano |
| 6 | 🐛 **Pizza «Dizimistas do Mês» estava SEMPRE vazia** | `Dashboard.tsx:176` — `where('month','==', 10)` (número) contra o valor guardado `'10'` (string canónica desde a migração v1.9.3): a query nunca devolvia nada, portanto homens/mulheres = 0 e o gráfico dizia «Sem dados suficientes» | `where('month','==', luandaMonthStr())` |
| 7 | **Exportações com o dia anterior** | `new Date(birthDate).toLocaleDateString('pt-AO')` (Excel e PDF de membros) faz parse como **UTC** | `fmtDatePT(normalizeBirthDate(...))` |
| 8 | Rodapés de PDF («Emitido em», «Gerado em», «Data:», relatórios) no fuso do aparelho | `pdfUtils.ts:108`, `MemberPortal.tsx:258`, `Finances.tsx:349`, `Reports.tsx:174/391`, `Contributions.tsx:333` | `fmtTodayPT()` / `fmtTodayTimePT()` |
| 9 | Nome das gravações da Rádio com o dia/hora do aparelho | `radio.ts:170` | `luandaParts()` |

**Regra que passa a valer (e está testada):** «hoje», «este mês», «este ano» e
qualquer conversão de data só saem de `lib/luanda.ts`. As 13 funções novas são
puras (`now` injectável) e têm 19 testes dedicados.

---

## 🔴 P3-B — Worker: quota, resiliência e validação

| # | Achado | Evidência | Correcção |
|---|---|---|---|
| 10 | **QUOTA: o cron reescrevia `paidAmount` em TODAS as contribuições abertas, TODOS os minutos** | `recomputeContributions`: `fv(f,'paidAmount') !== Math.round(paid*100)/100` compara uma **string** (a REST API devolve `integerValue: "1500"`) com um **número** (`1500`) — `'1500' !== 1500` é sempre `true`, logo o PATCH corria sempre. Com 20 contribuições abertas: **≈28.800 escritas/dia**; o plano Spark permite **20.000/dia**. O sistema ia começar a falhar escritas sem causa aparente | comparação numérica (`fnum`) + dinheiro tratado como inteiro de cêntimos de ponta a ponta (removido o `Math.round(x*100)/100` herdado dos valores decimais pré-v1.12) |
| 11 | **Cron frágil: uma tarefa partida rebentava com as outras três E com o heartbeat** | `scheduled()` tinha UM try/catch para `processOutbox → recomputeContributions → runReminders → processEventReminders`. Um 400 do Firestore (índice em falta) na 1.ª tarefa impedia as restantes **e** o heartbeat — a app passava a dizer «✗ Cron SEM pulsar» com o agendador vivo, e nada dizia qual tarefa falhava | `runJob(nome, fn)` por tarefa; heartbeat gravado **mesmo com erros** (`jobsOk`, `lastError`); `/__health` expõe `cron.ok`, `cron.error`, `cron.counts`; Suporte → Diagnóstico mostra qual tarefa falha |
| 12 | **Prazos decididos em UTC** | `now > new Date(due + 'T23:59:59Z')` = 00:59 do **dia seguinte** em Luanda: uma contribuição só passava a «em atraso» uma hora depois do dia acabar | `luandaEndOfDayMs(due)` (22:59:59.999 UTC), espelho de `luandaEndOfDay()` da app |
| 13 | **Verificação do token do Firebase incompleta** | `verifyFirebaseIdToken`: (a) `header.alg` nunca era verificado; (b) `if (claims.exp && claims.exp < now)` — um token **sem `exp`** passava; (c) sem verificação de `sub`; (d) sem verificação de `iat` futurista | `alg === 'RS256'` obrigatório, `exp` obrigatório e no passado, `iat ≤ now+60`, `sub` não vazio (≤128), token com 32–4096 caracteres, JSON malformado recusado sem rebentar |
| 14 | **Palavra-passe temporária sem política** | `/admin/create-auth-account` e `/admin/reset-temp-password` usavam `tempPassword || genTempPassword()` sem validar — o Firebase só recusa <6 caracteres, portanto `'123456'` ficava activa 7 dias | `validateTempPassword()`: 8–200, sem espaços, letras **e** números, lista de óbvias; email validado e normalizado (minúsculas) antes de criar a conta |
| 15 | **`genTempPassword()` podia gerar passwords que a própria política recusa** | alfabeto com 48 letras e 10 dígitos: ≈10% das passwords de 12 caracteres saíam **sem nenhum dígito** → o admin recebia um erro ao criar a conta | garante 1 letra + 1 dígito (posição aleatória), mantendo o alfabeto sem `0/O/1/l` |
| 16 | **Datas impossíveis no auto-cadastro** | `validateSignup` usava `^\d{4}-\d{2}-\d{2}$`: `'1990-13-45'` (mês 13, dia 45) era aceite, gravado em `member_signups` e depois copiado para a ficha do membro — partindo aniversariantes, cartão e relatórios | `isRealIsoDate()` (calendário real, bissextos, anos 1850…ano+1). *Apanhado pelo primeiro teste escrito para o Worker* |
| 17 | **Rate limits sem poda** | `signupBuckets`/`rateBuckets` são `Map` por IP/email que nunca eram limpos — crescimento sem limite no isolate | `pruneBuckets()` (tecto 2000 entradas; limpa as expiradas e, em último caso, repõe a zero) |
| 18 | **Recálculo de contribuições a cada minuto era desnecessário** | o cliente já grava `status`/`paidAmount` ao registar um pagamento (`Contributions.tsx:232/238`) e a viragem para «em atraso» é diária | `isRecomputeMinute()` — corre 1 minuto em cada 5 (−80% das leituras/escritas desta tarefa, sem estado no isolate) |
| 19 | **O ficheiro mais crítico do sistema não tinha UM teste** | 1465 linhas (validação do cadastro, token, rate limits, moeda, Luanda, fila SMS, lembretes, estados) e o CI só fazia `node --check` | superfície `export const __test` (só funções puras; o `export default` do Cloudflare não muda) + **50 testes** em `worker/__tests__/ai-worker.test.js`, incluindo testes de coerência contra `lib/money.ts` e `lib/luanda.ts` (o Worker duplica essa lógica — agora a divergência apanha-se) |

---

## 🟠 P3-C — Regras: o que faltava fechar

| # | Achado | Evidência | Correcção |
|---|---|---|---|
| 20 | **Qualquer sessão podia abrir pedidos de atualização sobre a ficha de OUTRO membro** | `match /pedidos_atualizacao`: `allow create: if isAuthenticated() && incoming().memberId != null` — sem qualquer verificação de dono. Um cadastro **rejeitado** (que continua com conta Auth) podia encher a fila da liderança com pedidos sobre membros arbitrários e propor-lhes dados | `ownsMemberRecord(memberId)` — `get()` do documento do membro comparado com o email do token (`get()`/`exists()` nas regras **não contam** para a quota); `memberEmail` coerente; `requestedData` limitado aos 3 campos que a aprovação realmente aplica (`telefone`, `endereco`, `estadoCivil`); `status == 'pendente'` obrigatório |
| 21 | **Filas de saída sem validação de conteúdo** | `whatsapp_outbox`: `allow create: if hasFinancialWriteAccess()` — qualquer documento. `message_outbox`: idem para `kind == 'board'`. O Worker envia o que lá estiver (número e texto arbitrários) assim que os fornecedores pagos forem ligados (`PROVIDERS`) | `isValidWhatsAppOutboxDoc()` / `isValidOutboxDoc()` com os payloads reais de `Finances.tsx`, `lib/notify.ts` e `lib/board.ts` (tipos, tamanhos, estados permitidos) |
| 22 | **`notifications` e `audit_logs` sem validação** | create só exigia o papel — tamanho/forma livres | `isValidNotificationDoc()` (9 campos máx., `read` bool, `body` ≤ 4000) e `isValidAuditDoc()` (aceita os **dois** esquemas que coexistem desde a v1.14.4) |
| 23 | **Bloco `match /settings/{…}` duplicado** | dois blocos equivalentes (`{docId}` e `{settingId}`): o Firestore avalia os dois e basta um `allow` para conceder — editar um não mudava nada | removido o duplicado (o checker abaixo passa a impedir que volte) |
| 24 | **Datas de Avisos/Eventos validadas só pelo formato** | `isDateIsoStr` = `^\d{4}-\d{2}-\d{2}$`: `'2026-13-45'` entrava em `events.date` e o lembrete do Worker (que compara strings) nunca casava | regex com mês `01-12` e dia `01-31` (o calendário fino vive no cliente/Worker: `isCalendarDateIso`) |
| 25 | **Nada verificava as regras automaticamente** | o emulador exige Java (não há no CI) e o deploy é manual — um parêntesis a mais ou uma função mal escrita só aparecia no deploy; um validador escrito e **não ligado** a nenhum `allow` não aparecia nunca (foi o que aconteceu a `isValidMemberCreate` até à v1.18) | **`scripts/check-rules.mjs`** + `npm run lint:rules` + passo no CI + 15 testes: equilíbrio de `(){}[]`, chamadas a funções inexistentes, funções definidas e nunca usadas, `match` duplicados (wildcards normalizados), `match` sem `allow`, operações inválidas em `allow`, cabeçalho em falta |

---

## ✅ Verificações que passaram (nada a corrigir)

- **Índices compostos**: todos os `runQuery` do Worker com igualdade+desigualdade
  têm índice em `firestore.indexes.json` (`message_outbox` status+cancelUntil,
  memberId+dedupeDay; `contribution_payments` contributionId+deliveryDate…).
  As queries só com igualdades usam os índices de campo único.
- **`/auth/self-register`**: duplicados conferidos no servidor (email, BI,
  telefone, pedido anterior), allowlist de campos, `<`/`>` recusados, telefone
  normalizado para `+244`, BI para maiúsculas, palavra-passe **nunca** gravada
  no Firestore (`const { password: _pw, ...docFields } = s`), rate limit 5/10 min por IP.
- **Rotas `/admin/*`**: papel e `isSuper` lidos do documento `admins/` (sem
  emails hardcoded desde a v1.14.5); conta desativada e palavra-passe por trocar
  bloqueadas **também** no servidor; o alvo de reset/disable não pode ser super.
- **`/__health` público**: não revela segredos — só booleanos de presença.
- **Colecções no código vs. regras**: todas as colecções escritas pela app têm
  bloco `match` (agora verificado automaticamente pelo checker).
- **XSS**: as 3 camadas mantêm-se (editor saneia → `richtext.ts` re-saneia →
  `isSafeRichText` no servidor); nenhum `dangerouslySetInnerHTML` novo.
- **Dinheiro**: fonte única (`formatKz`/cêntimos) sem fugas novas; o `fmtKz` do
  Worker passa a ser testado **contra** o `formatKz` da app.
- **Bundle**: `esbuild` empacota a aplicação inteira sem erros (o `vite build`
  precisa de >1 GB de RAM — não cabe na sandbox de revisão; no CI corre normal).

---

## 🟡 P4 — sugerido, **não** feito nesta versão

26. **Digest de avisos lê todos os membros**: `mergeBoardDigest` faz
    `fsList('members', 1000)` e 1 PATCH por membro em cada lembrete de evento.
    Com a congregação a crescer, paginar (ou guardar a lista de
    `memberEmail`/`id` num documento `settings/board_recipients`) e escrever em
    lote. Hoje: ~500 leituras + ~500 escritas por evento com lembrete.
27. **Storage**: qualquer conta autenticada pode **tentar** escrever em
    `posters/**` (as regras do Storage não conseguem ler o Firestore — limitação
    documentada em P2-13). Mitigação real só com custom claims (exige
    Functions/Blaze) ou upload via Worker.
28. **Testes de regras com o emulador** (`@firebase/rules-unit-testing` +
    `firebase emulators:exec`) quando houver Java no CI — o checker estático é o
    mínimo aceitável, não o ideal: valida forma, não semântica.
29. **Dependências**: `vite` 7 / `vitest` 4 continuam bloqueados pelo bug do
    **npm 10.8.2** (`edgesOut`); o npm 12.2.1 já existe — vale a pena pôr
    `npm i -g npm@12` no workflow e tentar de novo. `firebase` 12 → 13 exige
    validação ponta-a-ponta em aparelho (auth/firestore/storage).
30. **TypeScript strict na UI**: estender o padrão do `tsconfig.lib.json` a
    `src/hooks` e `src/context` (é onde vive a lógica de sessão e notificações).
31. **Aceites por desenho** (mantêm-se): rate limits do Worker por isolate
    (P2-14) e mensagens específicas de duplicado no auto-cadastro (P2-16).

---

## Números desta versão

| | antes (v1.18.0) | depois (v1.19.0) |
|---|---|---|
| Testes | 191 | **282** (+91) |
| Testes do Worker | 0 | **50** |
| Testes das regras | 0 | **15** (+ passo no CI) |
| `new Date()` fora de `lib/luanda.ts` | ~50 sítios | 2 (instantes, não dias: `lib/trash.ts`) |
| Escritas/dia do cron (20 contribuições abertas) | ~28.800 | ~0 em regime estacionário |
| Worker | 2.9.1 | **2.10.0** |
