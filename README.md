# Gestão IESA Emanuel — Xangongo

Sistema de gestão da **Igreja Evangélica Sinodal de Angola (IESA) — Igreja Local de
Emanuel, Xangongo (Cunene)**. Aplicação **Android + Web** para a liderança
(administradores, pastores, tesoureiros) e um **portal próprio para membros**:
cadastro de membros, dízimos e ofertas, obrigações sinodais, fundo de construção,
património, relatórios, rádio da igreja, avisos e — desde a v1.8.0 — o
**cartão de membro digital**, réplica fiel do cartão de papel (frente e verso,
comunhão, donativos voluntários, dízimos, renovações e PDF imprimível).

---

## Stack

| Camada | Tecnologia |
|---|---|
| App | React 19 + TypeScript + Vite 6 |
| Móvel | Capacitor 8 (Android; o mesmo código web empacotado como APK) |
| UI | Tailwind CSS 4 + shadcn/ui (Radix) + lucide-react |
| Estado/servidor | @tanstack/react-query |
| Backend de dados | Firebase Firestore + Firebase Auth |
| Backend de IA | **Cloudflare Worker** (`worker/ai-worker.js`) → Gemini (visão + texto) |
| PDF | jsPDF + jspdf-autotable |
| Testes | Vitest |
| CI/CD | GitHub Actions (APK, regras Firestore, Worker, testes) |

> **Porquê um Worker e não Cloud Functions?** O projeto Firebase está no plano
> gratuito (Spark), que não permite Functions. O Worker dá 100 000 pedidos/dia
> grátis, sem cartão. Ver `docs/GUIA-CLOUDFLARE-WORKER.md`.

---

## Pré-requisitos

- Node.js ≥ 20 e npm
- Uma conta Firebase com o projeto da igreja (ou o `google-services.json` para builds Android)
- Uma conta Cloudflare (plano Free) para o Worker de IA
- Uma chave Gemini em <https://aistudio.google.com/apikey>

## Configuração local

```bash
git clone https://github.com/cadupaulino99/Gestao_IESA_Emanuel_App.git
cd Gestao_IESA_Emanuel_App
npm install
npm run dev          # web em http://localhost:3000 (ou a porta que o Vite indicar)
```

### Credenciais do Firebase (passo a passo)

1. <https://console.firebase.google.com> → criar/abrir o projeto.
2. **Auth** → ativar *Google* e *Email/password*.
3. **Firestore** → criar base de dados; depois publicar as regras e índices deste
   repositório:
   ```bash
   npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project <ID>
   ```
   (ou workflow *Deploy Firebase* com os secrets `FIREBASE_SERVICE_ACCOUNT` e
   `FIREBASE_PROJECT_ID`).
4. **Configuração web**: o ficheiro `firebase-applet-config.json` (raiz) contém a
   configuração pública do projeto (apiKey, authDomain…). Esta chave `AIza…`
   **não é segredo** — é o identificador público do projeto, protegido pelas
   regras do Firestore. Para outro projeto, substitua o conteúdo desse ficheiro
   pelo *Web app config* do seu projeto.
5. **Android**: colocar o `google-services.json` em `android/app/` (ou no secret
   `GOOGLE_SERVICES_JSON` do GitHub Actions).
6. **Conta de serviço** (só para o Worker): *Project settings → Service accounts →
   Generate new private key*. O JSON resultante é **segredo**: vive apenas nos
   segredos da Cloudflare (`FIREBASE_SA_JSON`). Nunca no repositório.
7. **Primeiro admin**: crie manualmente o documento `admins/<email-minúsculo>`
   com `{ email, role: 'admin', createdAt: <timestamp> }` no Firestore — ou use o
   bootstrap `cadupaulino99@gmail.com` previsto nas regras e no Worker.

Guia completo: `docs/GUIA-FIREBASE.md`.

### Worker de IA (Cloudflare)

```bash
npm install -g wrangler && wrangler login
npx wrangler secret put GEMINI_API_KEY   --config worker/wrangler.toml
npx wrangler secret put FIREBASE_SA_JSON --config worker/wrangler.toml
npm run deploy:worker          # publica pela API preservando os segredos
npm run worker:health          # confirma versão/visão/segredos no ar
```

⚠️ **Nunca use `wrangler deploy` directamente**: apaga os segredos que não
estiverem no `wrangler.toml` (ver comentário no topo desse ficheiro).
Guia: `docs/GUIA-CLOUDFLARE-WORKER.md` · diagnóstico: `docs/FIX-LEITURA-BI.md`.

---

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` / `npm start` | servidor de desenvolvimento (Express + Vite) |
| `npm run build` | build web de produção |
| `npm run lint` | typecheck (`tsc --noEmit`) |
| `npm test` | testes unitários (Vitest) |
| `npm run test:watch` | testes em modo watch |
| `npm run test:bi` | teste de OCR do BI directo ao Gemini (3 modos, com tempos) |
| `npm run build:android` | build web + `cap sync android` (abrir no Android Studio) |
| `npm run deploy:worker` | publica o Worker pela API **preservando segredos** |
| `npm run deploy:worker:check` | só inspecciona o Worker no ar (não publica) |
| `npm run worker:health` | versão/rotas/segredos do Worker publicado |

---

## Estrutura de pastas

```
├── android/                  # projeto nativo Capacitor (Gradle, manifest, ícones)
├── apk/                      # APKs de distribuição publicados no repo
├── docs/                     # guias (Firebase, Worker, APK, FIX-LEITURA-BI, SUA-VEZ…)
├── functions/                # Cloud Functions LEGADO (não deployado: plano Spark)
├── public/                   # logotipo e estáticos
├── scripts/                  # ferramentas de bancada (deploy do Worker, teste BI, health)
├── src/
│   ├── components/           # UI (ui/ = shadcn; members/ = cartão, dízimos, mensagens)
│   ├── context/              # Auth, Theme, Settings, Confirm, CommandPalette
│   ├── hooks/                # useNotifications, useDevice
│   ├── lib/                  # firebase, ai (cliente do Worker), finance, retry, pdf…
│   │   └── __tests__/        # testes Vitest (normalizadores, finanças, retry)
│   ├── pages/                # uma página por rota (lazy loading)
│   └── types.ts              # modelos de domínio (Member, Tithe, Donation…)
├── worker/                   # Cloudflare Worker (IA) + wrangler.toml
├── .github/workflows/        # build-android, deploy-firebase, deploy-ai-worker, ci
├── firestore.rules           # regras de segurança (auditadas em 2026-10-24)
└── firebase-applet-config.json  # config PÚBLICA do projeto Firebase
```

---

## Segurança (resumo da auditoria de 2026-10-24)

- `.env*` está no `.gitignore`; não há segredos no repositório. As chaves `AIza…`
  presentes em `firebase-applet-config.json` / `google-services.json` são a
  **configuração pública** do Firebase (por desenho, embarcada no APK); o que é
  sensível (service account, chave Gemini) vive cifrado nos segredos da Cloudflare.
- Firestore: escrita de dados de gestão **só liderança** (`admin`/`pastor`/
  `treasurer`); documentos *por membro* (dízimos, comunhão, donativos) legíveis
  pelo **próprio** (`memberEmail` == email do token) ou pela liderança; finanças
  da igreja (ofertas, despesas, orçamentos, meses/anos financeiros, património)
  **só liderança lê**. Documentos antigos sem `memberEmail` mantêm leitura
  autenticada (migração natural).
- Firebase **Storage não é utilizado** (não há regras a auditar; se vier a ser
  ativado, restringir a liderança).
- Worker: verifica o ID token do Firebase (RS256, chaveiro securetoken+JWKS),
  confirma o papel em `admins/{email}`, rate-limit por utilizador, e as chaves
  de terceiros estão em `secret_text` (a API nunca devolve os valores).
- Rotação de credenciais e revogação de tokens: procedimento em
  `docs/FIX-LEITURA-BI.md` §8-9.

## Testes e CI

- `npm test` (Vitest): normalizadores de dados do OCR (datas/sexo/telefones),
  agregações financeiras e a lógica de retries/backoff.
- `.github/workflows/ci.yml`: em cada PR e push → `tsc --noEmit` + `vitest run`
  + `node --check worker/ai-worker.js`.
- Teste de OCR ponta-a-ponta (requer chave Gemini no ambiente): `npm run test:bi`.

## Contribuir

Ver `CONTRIBUTING.md`.

## Licença / uso

Uso interno da IESA — Igreja Local de Emanuel, Xangongo.
