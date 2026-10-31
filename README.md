# Gestão IESA Emanuel — Xangongo

Sistema de gestão da **Igreja Evangélica Sinodal de Angola (IESA) — Igreja Local de
Emanuel, Xangongo (Cunene)**. Aplicação **Android + Web** para a liderança
(administradores, pastores, tesoureiros) e **Portal do Membro** (conta própria):
membros, dízimos e ofertas, contribuições e orçamento, obrigações sinodais, fundo
de construção, património, relatórios, **cartão de membro digital** (fiel ao papel,
com PDF frente/verso), **comunhão**, **Avisos, Agenda e Eventos**, **Rádio
Maranata** (ao vivo + gravações publicadas), **auto-cadastro com aprovação**,
**chat de suporte** e IA (leitura de BI/comprovativos, assistente pastoral).

> **Versões actuais**: app **v1.19.0** · Worker **v2.10.0** · **282 testes** ·
> `tsc` limpo (raiz) + **strict em `src/lib`** (`npm run lint:lib`) +
> **regras verificadas** (`npm run lint:rules`).
> Fase actual: **P3** concluído — ver `docs/AUDITORIA-2026-10-31.md`
> (P0/P1/P2 em `docs/AUDITORIA-2026-10-25.md`).

---

## Stack

| Camada | Tecnologia |
|---|---|
| App | React 19 + TypeScript + Vite 6 |
| Móvel | Capacitor 8 (Android; o mesmo código web empacotado como APK) |
| UI | Tailwind CSS 4 + shadcn/ui (Radix) + lucide-react + sonner |
| Estado/dados | @tanstack/react-query · Firebase **Firestore** + **Auth** + **Storage** |
| Backend de IA/contas/filas | **Cloudflare Worker** (`worker/ai-worker.js`) — Gemini (visão+texto), criação de contas Auth, fila SMS/WhatsApp, lembretes e estados via **cron (todos os minutos)** |
| PDF/Excel | jsPDF + autotable · SheetJS **xlsx 0.20.3** (CDN oficial — o npm parou no 0.18.5 vulnerável) |
| Testes | Vitest 3 (funções puras em node) + **Testing Library/jsdom** (componentes) + **testes do Worker** (`worker/__tests__`) e **das regras** (`scripts/__tests__`) |
| CI/CD | GitHub Actions: `ci` (tsc + tsc-lib-strict + **lint:rules** + testes + worker check), `build-android` (APK/AAB → Release), `deploy-firebase` (manual: regras+índices+storage), `worker-health` (drift diário → issue) |

**Um só backend de IA**: tudo passa pelo Worker (a pasta `functions/` foi removida —
o plano Spark não permite Cloud Functions; `@google/genai` existe só no servidor
de desenvolvimento local).

**Porquê Worker e não Functions?** Plano gratuito (Spark), 100 000 pedidos/dia,
sem cartão. Ver `docs/GUIA-CLOUDFLARE-WORKER.md`.

---

## Arquitectura de segurança (resumo)

- **Papéis**: documento `admins/<email-minúsculo>` com `role` = `admin` |
  `pastor` | `treasurer`. Super admin = **flag `isSuper`** no documento (sem
  emails hardcoded desde a v1.14.5). Sem documento `admins` + registo em
  `members` com o mesmo email ⇒ **Portal do Membro**.
- **Palavras-passe**: só no Firebase Auth (hash forte). Nunca no Firestore,
  nunca em logs. Temporárias com 7 dias de validade e troca obrigatória
  (`mustChangePassword`) — admins e membros auto-cadastrados.
- **Regras Firestore = autoridade** (não o UI): `members` só liderança/own
  (`canReadMemberDoc`); a porta legada fecha com a migração «Carimbar
  memberEmail» (marcador `settings/system.memberEmailStamped`);
  `member_signups` só o Worker cria, só admin aprova/rejeita; HTML de
  avisos/eventos validado no servidor (`isSafeRichText`); escrita de membros
  validada (`isValidMemberCreate/Update` desde a v1.18); **desde a v1.19 (P3)**
  também `pedidos_atualizacao` (só sobre a própria ficha — `ownsMemberRecord`,
  `requestedData` limitado aos 3 campos que a aprovação aplica), as filas
  `message_outbox`/`whatsapp_outbox`, `notifications` e `audit_logs` têm
  validadores de forma/tamanho, e `npm run lint:rules` impede no CI validadores
  escritos e não ligados, blocos `match` duplicados e sintaxe partida.
- **Token do Firebase verificado no Worker** (não só no cliente): assinatura
  RS256 com o chaveiro da Google, `alg` fixo, `exp` obrigatório, `iat` não
  futurista, `sub` não vazio, `iss`/`aud` do projecto (v2.10.0).
- **XSS (3 camadas)**: editor saneia → apresentação re-saneia (`richtext.ts`)
  → servidor recusa (`<script`, `javascript:`, handlers…).
- **Storage** (`storage.rules`): leitura só autenticado; `posters/**`,
  `member-photos/**`, `radio/**` com limites de tamanho/tipo.
- **Anti-enumeração**: login e reset com mensagens genéricas; rate limit de
  auto-cadastro por IP no Worker; fila SMS/WhatsApp com janela de 10 min e
  máx. 1/dia/membro.

## Quota (plano Spark, sem cartão)

O cron do Worker corre **todos os minutos**; cada tarefa corre isolada
(`runJob`) e o recálculo de contribuições só corre 1 minuto em cada 5 — o
cliente já actualiza o estado ao registar um pagamento e a viragem para
«em atraso» é diária. Na v1.19.0 (P3) corrigiu-se uma comparação
string-vs-número que fazia o cron reescrever `paidAmount` em **todas** as
contribuições abertas, **todos os minutos** (~28.800 escritas/dia contra um
tecto de 20.000). O heartbeat (`settings/worker_cron`) grava `jobsOk` e
`lastError`, expostos em `/__health` e em **Suporte → Diagnóstico**.

## Datas, horas e dinheiro

- **Luanda (UTC+1)**: datas guardadas como strings locais `AAAA-MM-DD`, horas
  `HH:MM` — nada de epoch/ISO com fuso (um evento às 23:30 não muda de dia
  noutro aparelho). «Hoje/Amanhã/Faltam N dias» pelo dia de Luanda
  (`lib/luanda.ts`). **Desde a v1.19.0 (P3) não há outro caminho**: «hoje»,
  «este mês», «este ano», aniversários, gráficos de meses, nomes de ficheiros e
  rodapés de PDF saem todos de `lib/luanda.ts` — `new Date().getMonth()` e
  `toISOString().slice(0,10)` foram eliminados da UI (em UTC+1 guardavam o dia
  anterior entre as 00:00 e as 01:00, e as datas vindas do Excel recuavam um dia).
- **Dinheiro**: inteiros de **cêntimos**; apresentação única `formatKz`
  («1.500,00 Kz»); parsing estrito (`lib/money.ts`).

---

## Configuração local

```bash
git clone https://github.com/cadupaulino99/Gestao_IESA_Emanuel_App.git
cd Gestao_IESA_Emanuel_App
npm ci               # de preferência com --ignore-scripts em sandboxes pequenas
npm run dev          # web em http://localhost:3000
npm test             # 282 testes (app + Worker + regras)
npm run lint         # tsc --noEmit (raiz)
npm run lint:lib     # tsc STRICT de src/lib
npm run lint:rules   # verificador estático de firestore.rules/storage.rules
```

- Credenciais Firebase: `firebase-applet-config.json` (config pública web —
  a chave `AIza…` NÃO é segredo; a protecção são as regras).
- Android: `google-services.json` em `android/app/` (ou secret
  `GOOGLE_SERVICES_JSON` no CI).
- Worker: segredos `GEMINI_API_KEY`, `FIREBASE_SA_JSON` e var `PROJECT_ID`
  (Cloudflare). Guias: `docs/GUIA-FIREBASE.md`, `docs/GUIA-CLOUDFLARE-WORKER.md`.

## Publicação

1. **Regras/índices/Storage**: Actions → **«Deploy Firebase»** (manual).
2. **Worker**: Actions → **«deploy-ai-worker»** (com secrets
   `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` + variable
   `CF_DEPLOY_ENABLED=true`) ou **Via A**: Cloudflare → Workers → `iesa-ai` →
   *Edit code* → colar `worker/ai-worker.js` → Deploy. **Cron**: Via A não
   leva triggers — confirmar `* * * * *` em Settings → Triggers. Verificar em
   `https://iesa-ai.cadupaulino99.workers.dev/__health` (versão + `cron.ageMinutes`
   + `cron.ok`/`cron.error`: o cron corre cada tarefa isolada desde o 2.10.0 e
   grava qual falhou).
3. **APK**: automático no push ao `main` (Release com `app-release.apk`);
   a app avisa os utilizadores (banner de atualização).

## Migrações (Admin → Gestão de Dados, com cópia de segurança obrigatória)

- **v1.9.3** — dízimos com duas datas + meses canónicos + IDs internos.
- **v1.12.0** — dinheiro em cêntimos (lista duvidosos, não os toca).
- **v1.16.0** — **Carimbar memberEmail** → fecha a leitura legada das regras
  (marcador `settings/system.memberEmailStamped`; reversão = `false`).

## Documentação

`docs/MUDANCAS.md` (histórico completo por versão) ·
`docs/AUDITORIA-2026-10-31.md` (**P3**: datas de Luanda, quota do cron, token,
regras) · `docs/AUDITORIA-2026-10-25.md` (auditoria P0/P1/P2) ·
`docs/VERIFICACAO-*` (guiões de teste: **v1.19.0**, moeda, cartão,
auto-cadastro, memberEmail, avisos/agenda/eventos…) · `docs/INICIO-RAPIDO.md` ·
`docs/COMO-INSTALAR-NO-TELEMOVEL.md`.

## Dependências — plano de majors (adiado com motivo)

- `vite` 6.4.5 (último 6.x) e `vitest` 3.2.7: a subida para vite 7/vitest 4
  esbarra num **bug do npm 10.8.2** (`edgesOut` no arborist com peers do
  vitest 4). São dev-only — sem risco para o APK. O npm 12 já saiu: vale a pena
  acrescentar `npm i -g npm@12` ao workflow `ci` e tentar de novo (P4-29).
- `firebase` 12 → 13: exige validação ponta-a-ponta em aparelho (auth/
  firestore/storage) — agendar com calma.
- Restantes advisories: dev-only ou fora do bundle web (documentados em
  `docs/AUDITORIA-2026-10-25.md` §P1-9).
