# 🔧 MUDANÇAS face ao repositório original

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
