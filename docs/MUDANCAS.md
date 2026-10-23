# 🔧 MUDANÇAS face ao repositório original

## v1.8.2 (2026-10-23) — Comunhão ✓/✗ por clique, credenciais por membro, membro edita os seus dados

- **Comunhão como a liderança decidiu:** as casas do papel levavam a *assinatura do
  pastor*; no digital, **✓ participou / ✗ não participou / vazio = ainda não
  registado**, com grelha de 12 meses (1 clique = ✓, 2 = ✗, 3 = limpa) e
  `recordedBy` como «assinatura» digital. No PDF, ✓/✗ desenhados a vetor.
  Grelha partilhada (`CommunionGrid`) entre o cartão e a **nova aba «Comunhão» em
  Membros** (`CommunionTracker`: pesquisar membro → marcar meses) — sugestão nº 2.
- **Credenciais a partir de membro cadastrado** (sugestão nº 3): em *Admin → Novo
  Utilizador* pesquisa-se o membro pelo nome; se não tiver email, escreve-se um e o
  sistema grava-o no registo do membro. Já não há «email solto» sem membro por trás.
- **Membro edita os próprios dados** (sugestão nº 1): *Portal → Meus Dados → Editar*
  (telefone, morada, estado civil, cônjuge, formação, profissão). Regra nova
  `isSelfEdit()`: só esses campos, só com sessão do próprio email.
- **Worker v2.2.0 — corrige o «não me deixa atribuir credenciais»:** (a) `getRole`
  volta a ter o admin de arranque (`cadupaulino99@gmail.com`), espelhando as
  `firestore.rules` — sem documento em `admins` o Worker dava 403 ao criar contas;
  (b) o token OAuth da service account passa a pedir também o scope
  `identitytoolkit` — só com `datastore`, o `signupNewUser` falhava e a conta de
  email nunca era criada.
- **Versão do APK lê-se do `package.json`** — acaba o ritual de subir a variable
  `ANDROID_VERSION_NAME` a cada release.
- ⚠️ Publicar: **Worker v2.2.0** (colar `worker/ai-worker.js` no editor da
  Cloudflare — Via A do `docs/INICIO-RAPIDO.md`) e **regras do Firestore**
  (workflow *Deploy Firebase*).


## v1.8.0 (2026-10-23) — Cartão de membro digital, fiel ao cartão de papel

O cartão de papel da IESA (fotografado pela liderança) passou a existir dentro da
app, com as duas faces e as quatro tabelas:

- **Frente:** selo IESA, cabeçalho institucional (Sínodo / Igreja Local / Província),
  «Cartão de Membro Nº», dados pessoais completos (filiação, naturalidade, BI +
  emissão, estado civil, batismo, receção como membro) e as tabelas
  **Participou da Comunhão** e **Entrega de Donativos Voluntários** (meses × anos).
- **Verso:** aviso de renovação, tabela **Renovações** com rubrica do pastor,
  fotografia do titular, linha de assinatura, tabela **Entrega de Dízimos**
  (totais mensais + nº de entregas) e o versículo Mal. 3:10.

Onde vive:
- **Liderança:** *Membros → perfil → «Cartão de Membro»* (`MemberCardModal`) —
  vê o cartão, regista **comunhão** (marca livre por mês/ano, com sugestão «FM»),
  **donativos voluntários**, **renovações**, remove registos errados e gera o
  **PDF frente+verso** (`generateMemberCardPdf`, A4 paisagem, 2 páginas).
- **Membro:** *Portal do Membro → separador «O meu cartão»* (`MemberCardView`
  compacto, só leitura) + botão **Descarregar PDF**.

Dados novos:
- `Member`: `memberNumber`, `fatherName`, `motherName`, `placeOfBirth`,
  `photoBase64` (foto comprimida a 400 px no formulário de membro).
- Coleções novas: `communions` {memberId, year, month, mark}, `donations`
  {memberId, amount, date, referenceMonth/Year, recordedBy}, `renewals`
  {memberId, date, pastorSign} — com regras no `firestore.rules`
  (leitura autenticada, escrita só liderança).
- **Comunhão (decisão da liderança, 2026-10-23):** no papel as casas levavam a
  *assinatura do pastor*; no digital usa-se **✓ participou / ✗ não participou /
  vazio = ainda não registado**, com registo por clique numa grelha de 12 meses
  (ciclo vazio → ✓ → ✗ → vazio). Cada marca guarda `recordedBy` — a «assinatura»
  digital. No ecrã, ícones; no PDF, ✓/✗ desenhados a vetor (a fonte do PDF não
  tem esses glifos). Marcas antigas em texto livre continuam a ser mostradas.
- Dízimos no cartão: **totais mensais** a partir da coleção `tithes` já existente
  (decisão da liderança: sem colunas de semana 1ª-4ª; quando há várias entregas no
  mês o cartão mostra «(n×)»).
- Donativos: coleção própria — `offerings` continua a ser as ofertas da igreja
  (sem memberId), para não misturar.

⚠️ Depois de publicar este release é preciso **publicar também as regras**:
`npx firebase deploy --only firestore:rules` (ou o workflow deploy-firebase).
Sem isso, as coleções novas ficam bloqueadas e o cartão aparece vazio.


## v1.7.2 (2026-10-22) — **Correção: a leitura do BI por fotografia não funcionava**

> **CAUSA REAL, medida em 2026-10-22:** o Worker chamava `gemini-3.8-flash`, que
> demorou **170 s** e **390 s** no mesmo pedido em que `gemini-3.6-flash` demorou
> **3,0 s** (6/6 campos em ambos). Um subrequest de um Worker da Cloudflare é
> cortado aos **~100 s**, portanto a chamada nunca chegava ao fim e a app recebia
> 5xx. `gemini-2.5-flash` devolve `404 no longer available to new users`.
> **Worker v2.1.0:** modelos rápidos (`3.6-flash → 3.5-flash-lite → 3.1-flash-lite`),
> timeout de 45 s por tentativa, fallback alargado a `408/429/5xx`,
> `thinkingLevel: low`. Depois da correção: **4,8–10,3 s, 6/6 campos**.
>
> Nota de honestidade: a primeira versão de `docs/FIX-LEITURA-BI.md` apontava como
> causa principal o Worker estar desatualizado. **Estava errado** — a inspeção pela
> API mostrou que o código publicado já era a v1.7.1, com as rotas de visão. O
> documento foi corrigido com as medições.

> Guia completo em [`docs/FIX-LEITURA-BI.md`](./FIX-LEITURA-BI.md).

**Três causas, todas corrigidas:**

1. **O Worker na Cloudflare estava desatualizado** (causa principal, confirmada:
   `GET /__health` devolve 401). As rotas `/assistant/extract-member` e
   `/assistant/extract-receipt` só existem a partir da v1.7.0, mas o Worker era
   publicado **à mão** (colar no editor da Cloudflare) — o APK novo não o atualiza.
   Sem as rotas, a app recebia `404 "Rota nao encontrada"`.
   → **Novo:** `worker/wrangler.toml` + `.github/workflows/deploy-ai-worker.yml`
   (deploy automático em cada push que mude `worker/**`), `npm run deploy:worker`,
   `npm run worker:health`, rotas `/__health` e `/assistant/selftest` de diagnóstico,
   e `WORKER_VERSION` no código. O 404 passa a explicar o que fazer.
2. **O pedido ao Gemini não tinha resolução para OCR.** Sem `mediaResolution`, o
   Gemini 3 dedica poucos tokens à imagem e não lê o texto pequeno do BI (nº,
   emissão, morada). Além disso o texto ia **antes** da imagem (a Google recomenda o
   inverso), `temperature: 0.1` pode provocar `400` nos modelos 3.x, e não havia
   `responseSchema`.
   → **Corrigido:** `MEDIA_RESOLUTION_HIGH` (global e por parte), imagem antes do
   prompt, `responseSchema` por tipo de documento, remoção do `temperature`,
   **fallback de modelos** (`3.8-flash → 3.6-flash → 2.5-flash`) e 4 configurações
   tentadas por ordem. Aceita data URL, valida o MIME e o limite de 20 MB.
3. **A app lia mas deitava os dados fora.** `Members.tsx → onApply` ignorava
   `documentNumber`, `gender` e `issueDate`; `birthDate` vinha `07/03/1990` mas o
   `<input type="date">` exige `1990-03-07`; `gender` vinha `M` mas o `<Select>`
   exige `Masculino` — ambos rejeitados **em silêncio**. E o tipo `Member` nem tinha
   campo para o nº do BI.
   → **Corrigido:** `Member.documentNumber`/`issueDate` + campo "Nº do Bilhete de
   Identidade" no formulário e no perfil; normalizadores `normalizeDate`,
   `normalizeGender`, `normalizePhone`, `normalizeDocumentNumber`,
   `normalizeMemberFields`; toast a dizer exatamente o que a IA preencheu.

**Armadilha do Wrangler (documentada e contornada):** `wrangler deploy` apaga os
segredos do Worker que não estiverem no `wrangler.toml` — destruiria
`GEMINI_API_KEY` e `FIREBASE_SA_JSON`. Acrescentado `scripts/deploy-worker-api.mjs`,
que publica pela API da Cloudflare **reenviando os bindings existentes** (preserva os
segredos), pára se faltar algum, e confirma o `/__health` no fim. O
`wrangler.toml`, o `deploy-ai-worker.yml` e os guias ficaram com o aviso; o
workflow fotografa os segredos antes/depois e falha se algum desaparecer.
Guia curto para não-técnicos: `docs/INICIO-RAPIDO.md`.

**Ferramentas novas:** `npm run test:bi` corre a mesma foto em 3 modos (v1.7.x vs.
corrigido vs. corrigido+schema) usando `scripts/testdata/exemplo-bi-angola.jpg`
(BI fictício) — isola em segundos se o problema é o Gemini, o Worker ou a app.
O `DocumentReaderModal` ganha botão **"Testar ligação"**, painel de **Diagnóstico**
(versão do Worker, segredos presentes, papel do utilizador, Gemini alcançável),
**"Tentar novamente"** e mostra a dimensão/peso da imagem optimizada.
`compressImageFile` passa a ter fundo branco (PNG transparente não fica preto) e
*fallback* para os bytes originais quando o `<canvas>` não descodifica (HEIC/HEIF).

**Novo separador «Diagnóstico IA» em *Suporte***: corre automaticamente ao abrir e
mostra, em linguagem simples, a versão do Worker, se a leitura de documentos está
publicada, se os segredos `GEMINI_API_KEY`/`FIREBASE_SA_JSON`/`PROJECT_ID` existem,
o papel do utilizador e se o Gemini responde — com a indicação do que fazer em cada
falha. A lógica é partilhada com o modal de documentos através de
`runAiDiagnostics()` em `src/lib/ai.ts` (um só sítio para manter).

Validação: `npx tsc --noEmit` ✅ · `node --check worker/ai-worker.js` ✅

---

## v1.7.0 (2026-10-22) — Visão com IA: ler documentos por fotografia

- **Novo no Worker** (colar no painel Cloudflare!): `/assistant/extract-member` (BI e cartão de
  membro batizado, impresso ou **manuscrito**) e `/assistant/extract-receipt` (comprovativos
  bancários angolanos). Gemini com `inlineData` + `responseMimeType: application/json`
  → campos estruturados, `temperature 0.1`, nunca inventa (null se ilegível).
- **Novo na app**: `DocumentReaderModal` (fotografar/escolher → compressão no dispositivo
  máx. 1280 px JPEG → leitura → tabela de campos → **Aplicar**).
  - Membros: botões «🪪 Bilhete de Identidade» e «✝️ Cartão de Membro» no formulário —
    preenchem nome, telefone, nascimento, batismo, morada e célula automaticamente.
  - Finanças: «🧾 Ler comprovativo com IA» no registo de entrada — preenche o valor e
    acrescenta data/banco/pagador/referência aos detalhes.
- Segurança: as rotas exigem sessão Firebase + papel de liderança, com rate limit.

---
## v1.6.0 (2026-10-22) — Sistema de design: duas paletas à escolha nas Definições

- **Modo e Paleta separados**: o modo (claro/escuro/sistema) controla os cinzas; a paleta
  controla a cor de ação/destaques. Definições → Aparência tem agora dois seletores.
- **Paleta «IESA Clássico»** (predefinida): vermelho da cruz `#B4232A` para ações +
  dourado do selo `#C99A2E` para rádio/destaques; versões dark ajustadas para contraste AA.
- **Paleta «Executivo»**: grafite `#101828` para ações + dourado como único acento
  (no escuro: botões claros com tinta escura).
- Tokens expostos ao Tailwind (`bg-brand`, `text-brand`, `bg-brand/10`, `--gold`) e
  utilitários `.acc-*` para as barras de acento dos cartões de estatística.
- Barra de navegação inferior e botões primários passam a seguir a paleta escolhida.
- Separadores com pill ativa de contraste garantido nos dois modos.
- Os 4 temas completos legados (cósmico/floresta/oceano/pôr-do-sol) mantêm-se como paletas
  «tema completo» e continuam a funcionar como dantes.

---
## v1.5.5 (2026-10-22) — Administração 100% na base de dados + Worker endurecido

- **Removido o admin hardcoded** (`cadupaulino99@gmail.com`) dos 3 sítios
  (AuthContext, Worker, Cloud Functions). Todo o poder de admin vem agora do documento
  `admins/{email}` no Firestore (criado manualmente no console antes deste release).
  Dar/tirar admins passa a ser só editar a coleção `admins` — sem tocar no código.
- **Worker endurecido** (colar também no painel Cloudflare!): cache de papéis 5 min,
  rate limit 60 pedidos de IA / 10 min por utilizador (HTTP 429 amigável),
  token OAuth com `expires_in` real.

---
## v1.5.4 (2026-10-22) — Aviso de atualização dentro da app

- Ao abrir, a app consulta `releases/latest` no GitHub (1x/hora, falha em silêncio)
  e compara com a versão embutida no build (`__APP_VERSION__` via vite `define`).
- Banner no topo: «Nova versão disponível» + **Instalar** (abre o APK assinado numa
  Custom Tab do Chrome via `@capacitor/browser`; na web abre separador) + «Agora não»
  (guarda a decisão por versão).
- Inclui também as correções visuais da v1.5.3 (stats 2 colunas, tabs legíveis,
  IA empilhada, timeout da rádio, zona 640-767 px).

---
## v1.5.3 (2026-10-22) — Afinação fina com capturas reais do telemóvel

- Correções móveis passam a cobrir **toda a zona < 768 px** (antes só ≤640 px,
  e o telemóvel de teste vive na zona intermédia).
- Dashboard: cartões de estatística em **2 colunas** no telemóvel, valores compactos
  (`text-lg`), título «Painel de Controlo» contido.
- **Separador ativo legível no tema escuro** (texto escuro sobre a pill branca).
- Cartão «Parecer Executivo & IA»: empilha no telemóvel (título → descrição → botão a largura inteira).
- Gráficos (Recharts) com `min-w-0`/`max-width:100%` — nunca mais empurram cards para fora do ecrã.
- Rádio: **timeout de 12 s** ao ligar — se a emissão não responder, mostra mensagem e libera o botão.

---
## v1.5.2 (2026-10-21) — Correções de visualização móvel

- **Nada fica debaixo do rodapé**: a barra de navegação inferior passa a estar **em fluxo**
  (faz parte da coluna flex do ecrã), em vez de `fixed` sobre o conteúdo.
- **Altura real do ecrã**: `h-dvh`/`min-h-dvh` (viewport dinâmico) em vez de `100vh`,
  que em WebViews Android cortava conteúdo atrás das barras do sistema.
- **Menu «Mais» como bottom-sheet nativo** (grelha 2 colunas + alça + fechar),
  em vez de gaveta lateral que "partia" o ecrã ao meio.
- **Fim da inflação de texto da WebView**: `-webkit-text-size-adjust: 100%`
  (era a causa dos textos gigantes e desajustados).
- Escala tipográfica contida em ≤640 px (h1/h2/h3, células de tabela),
  inputs a 16 px (sem zoom ao focar), diálogos/paleta limitados à largura do ecrã,
  toasts a largura inteira, `viewport-fit=cover` para safe-areas.
- **Gravações da rádio** com scroll próprio (máx. 340 px) — a lista nunca empurra
  conteúdo para debaixo do rodapé, mesmo com muitas gravações.
- Mini-player assenta exatamente acima da barra de navegação (CSS com safe-area).

---
## v1.5.0 (2026-10-21) — Visual de app nativa + Rádio Maranata

### Casca com sensação nativa (Android)
- **Barra de navegação inferior** com 5 separadores (Início, Membros, Finanças, Rádio, Mais) —
  padrão Material/Android; a sidebar passa a ser só para desktop/tablet.
- **Mini-player da rádio** flutuante: a emissão continua a tocar ao navegar e volta a aparecer
  numa barra por cima dos separadores (pausar / abrir).
- **Barra de estado nativa** acompanha o tema (`@capacitor/status-bar`: ícones + cor de fundo).
- **Safe-areas** (notch e gestos), sem *tap highlight*, sem *overscroll* de browser,
  scroll sem scrollbar visível (utility `scrollbar-hide` que faltava), alvos de toque ≥ 44 dp.
- **Textos revistos (pt-PT)**: Início, Finanças, Obrigações, Fundo de Construção, Património,
  Orçamento, Relatórios, Rádio Maranata, Administração, Suporte & IA.

### Rádio Maranata 91.9 FM (Lubango) — nova aba
- Stream oficial: `https://azura4.cmaudioevideo.com:8450/radio.aac` (Icecast/AzuraCast, AAC 48 kbps).
- Player ao vivo com estado (A ligar / Em direto / erro), equalizador animado e volume.
- «A tocar agora» + nº de ouvintes via API pública do AzuraCast (falha em silêncio se offline).
- **Gravação da transmissão em tempo real**: `fetch` + ReadableStream (o servidor reflete CORS),
  bytes AAC guardados em `Documentos/Radio/Maranata_AAAA-MM-DD_HHhMM.aac` (`@capacitor/filesystem`).
- **Biblioteca de gravações no telemóvel**: reproduzir, partilhar/exportar e apagar.
- Na web (desktop), a gravação é transferida como ficheiro `.aac`.

### Técnico
- Dependências novas: `@capacitor/filesystem`, `@capacitor/status-bar` → `cap sync` → 5 plugins.
- `src/lib/radio.ts` (player singleton + gravador + biblioteca), `src/pages/Radio.tsx`,
  rota `/radio`, entrada na paleta de comandos.
- **Antes do build**: subir as variables do Actions para `VERSION_NAME=1.5.0` e `VERSION_CODE=5`
  (senão o passo da Release substitui os ficheiros da tag v1.4.0).

---

Original: `github.com/cadupaulino99/Gest-o_Emanuel_Xangongo` (cópia intacta em `01_prototipo/`).
Projeto corrigido: esta pasta (`03_android/`). Validação: `tsc --noEmit` ✅ (web e functions).

## Bloqueios críticos resolvidos
| # | Problema original | Solução | Ficheiros |
|---|---|---|---|
| C1 | Login Google por popup (bloqueado na WebView) | Google **nativo** via `@capacitor-firebase/authentication` + **email/password** + recuperação de palavra-passe | `src/context/AuthContext.tsx`, `src/App.tsx` |
| C2 | Firebase temporário do AI Studio | Guia completo para projeto próprio; config isolada | `docs/GUIA-FIREBASE.md`, `firebase-applet-config.json` (a substituir) |
| C3 | `/api/assistant/*` só no Express do AI Studio | 3 **Cloud Functions callable** (auth obrigatória, só liderança) | `functions/src/index.ts`, `src/lib/ai.ts`, 3 componentes |
| C4 | Modelo `gemini-3.5-flash` não existe | `gemini-3.8-flash` (estável, verificado na doc. oficial) | `functions/src/index.ts`, `server.ts` |
| C5 | Plugins Capacitor não sincronizados | `cap sync` no workflow + guia; config de plugins | `capacitor.config.ts`, `.github/workflows/build-android.yml` |

## Problemas importantes resolvidos
| # | Problema | Solução |
|---|---|---|
| I1 | Logótipo em URL morta do AI Studio | Logótipo novo **embutido** (`public/logo-iesa.png`) + todos os ícones/splashes **regenerados** (os PNG do repo estavam **corrompidos**: byte `0x89`→`EF BF BD`) |
| I2 | Fontes Google via rede | Fontes de sistema (robusto offline); sem `@import` remoto |
| I3 | Faltavam permissões Android | `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK` |
| I5 | `localStorage` volátil na WebView | `src/lib/prefs.ts`: espelho em `@capacitor/preferences` + hidratação no arranque (9 ficheiros ligados) |
| I6 | Sem assinatura de release | `signingConfigs` + `keystore.properties` opcional (fallback debug) |
| I7 | Functions em Node 18 | Node **22** + `tsconfig.json` das funções (não existia!) |
| I8 | Service worker PWA dentro do APK | `vite-plugin-pwa` removido; `base: './'` |

## Identidade e loja
- Nome: **"Gestão IESA Emanuel"**; package id **`ao.co.iesa.emanuelxangongo.gestao`**
  (Android: namespace, applicationId, pasta Java, strings).
- Ícone adaptativo, splash portrait/landscape em 5 densidades, favicon, `logo192/512`.
- `index.html` em `pt` + `theme-color`.
- `versionCode/versionName` por variáveis de ambiente (CI).

## Funcionalidades novas
- **Criação de contas por admin**: ao adicionar um utilizador em *Admin*, a Cloud Function
  `createAuthAccount` cria a conta Auth com palavra-passe temporária (mostrada uma vez).
- **Ecrã de login** com separadores Google / Email + erros em português + recuperação.
- **CI/CD**: `build-android.yml` (APK debug+release e AAB como artifacts) e
  `deploy-firebase.yml` (regras+índices+funções, manual).

## Sem alterações (deliberado)
- `firestore.rules` — validação excelente; mantém-se.
- `firestore.indexes.json` — análise: as queries compostas usadas já estão cobertas;
  queries de campo único não precisam de índice composto.
- Triggers `sync*` de resumos financeiros — lógica correta, mantida.
- Páginas/componentes de gestão (membros, finanças, relatórios…) — só toques pontuais
  (IA, prefs, logótipo).

## Para fazer POR TI (não posso fazer daqui)
1. Criar projeto Firebase + `google-services.json` → `docs/GUIA-FIREBASE.md`.
2. Chave Gemini → `firebase functions:secrets:set GEMINI_API_KEY`.
3. Compilar o APK → `docs/GUIA-BUILD-APK.md` (GitHub Actions ou Android Studio).
4. Revogar o token de GitHub que partilhaste no chat.
