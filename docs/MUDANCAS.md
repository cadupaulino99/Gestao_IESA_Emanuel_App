# 🔧 MUDANÇAS face ao repositório original

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
