# 🔥 GUIA FIREBASE — criar o projeto da igreja (passo a passo)

> **Objetivo:** substituir o projeto temporário do AI Studio (`gen-lang-client-0589830987`)
> por um projeto Firebase **teu**, permanente, com base de dados 24/24.
> **Tempo estimado:** 15–20 minutos. **Custo:** 0 € (plano Spark).
> Faz tudo com a conta Google `cadupaulino99@gmail.com` (é o admin de arranque das regras).

---

## 1. Criar o projeto
1. Abre <https://console.firebase.google.com> → **Add project / Adicionar projeto**.
2. Nome: `iesa-emanuel-xangongo` → **Continue**.
3. Google Analytics: **não atives** (não é preciso) → **Create project**.

## 2. Criar a base de dados (Firestore)
1. Menu lateral → **Build → Firestore Database → Create database**.
2. Localização: **`eur3` (Europe)** — é a mais próxima de Angola. ⚠️ Não dá para mudar depois.
3. Modo: **Production** → **Enable**.

## 3. Ativar a autenticação
1. **Build → Authentication → Get started**.
2. Separador **Sign-in method** → ativa:
   - **Google** → escolhe o email de suporte da igreja → **Save**;
   - **Email/Password** → **Save** (sem "passwordless").

## 4. Substituir a configuração no código
1. **Project settings** (roda dentada junto a *Project Overview*).
2. Em *Your apps* → ícone **Web `</>`** → regista uma app web (nome: `web`) → **Register app**.
3. Copia o objeto `firebaseConfig` que aparece e **substitui o conteúdo inteiro** do ficheiro
   `firebase-applet-config.json` (na raiz do projeto) por este modelo:

```json
{
  "projectId": "O-TEU-projectId",
  "appId": "O-TEU-appId",
  "apiKey": "A-TUA-apiKey",
  "authDomain": "O-TEU-projectId.firebaseapp.com",
  "storageBucket": "O-TEU-projectId.firebasestorage.app",
  "messagingSenderId": "O-TEU-senderId",
  "measurementId": "",
  "firestoreDatabaseId": "(default)"
}
```

> A `apiKey` aqui é **pública por desenho** (o Firebase protege tudo com as regras de
> segurança). Não a reutilizes para outros serviços.

## 5. Registar a app Android
1. **Project settings → Your apps → ícone Android**.
2. **Android package name:** `ao.co.iesa.emanuelxangongo.gestao`
   (tem de ser **exatamente** isto — é o `applicationId` do `android/app/build.gradle`).
3. App nickname: `Gestão IESA Emanuel` → **Register app**.
4. **Download google-services.json** → coloca-o em `android/app/google-services.json`.
5. **Adicionar a impressão SHA-1** (obrigatório para o Google Sign-In no Android):
   - No teu PC, com JDK instalado:
     ```bash
     cd android
     ./gradlew signingReport        # copia a linha "SHA-1" da variante debug
     ```
     (ou, para o keystore de release: `keytool -list -v -keystore release.keystore`)
   - Volta ao Firebase → **Project settings → Your apps → [Android] → Add fingerprint**
     → cola o SHA-1 (debug **e** release) → **Save**.

## 6. (Só para login Google na web) Web client ID
**Project settings → Your apps → [Web app] → SDK setup and configuration** → copia o
**Web Client ID** (`….apps.googleusercontent.com`) e, se quiseres usar a app no browser,
descomenta o bloco `FirebaseAuth` no `capacitor.config.ts` e cola-o lá.
*No Android não é preciso — o `google-services.json` chega.*

## 7. Implantar regras e índices de segurança
```bash
npm install -g firebase-tools
firebase login
firebase use --add          # escolhe o projeto iesa-emanuel-xangongo
firebase deploy --only firestore:rules,firestore:indexes
```
> Sem isto, **toda a leitura/escrita é recusada** (as regras originais fecham tudo por defeito).

## 8. Implantar as Cloud Functions (IA + criação de contas)
```bash
cd functions && npm install && cd ..
firebase deploy --only functions
firebase functions:secrets:set GEMINI_API_KEY
#   cola a chave que criares em https://aistudio.google.com/apikey
```
Ficam disponíveis 24/24 em `https://<região>-<projeto>.cloudfunctions.net/...` e a app
chama-as automaticamente (assistente, parecer financeiro, mensagem pastoral, criação de contas).

## 9. (Opcional) Deploy automático pelo GitHub
1. **Project settings → Service accounts → Generate new private key** → ficheiro JSON.
2. No GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   | Secret | Valor |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | conteúdo **inteiro** do JSON do passo 1 |
   | `FIREBASE_PROJECT_ID` | id do projeto (ex.: `iesa-emanuel-xangongo`) |
   | `GOOGLE_SERVICES_JSON` | conteúdo do `google-services.json` (para o build do APK) |
3. Depois: **Actions → "Deploy Firebase" → Run workflow**.

## 10. Primeiros acessos
1. Abre a app (web ou APK) → **Entrar com Google** (`cadupaulino99@gmail.com`) → entras como **admin** (bootstrap das regras).
2. **Admin → Controlo de acesso** → adiciona o email do pastor/tesoureiro →
   a app cria-lhes automaticamente a conta de email com **palavra-passe temporária**
   (mostrada num aviso; eles podem repô-la com "Esqueci-me da palavra-passe").
3. Os **membros** entram com o email registado na ficha de membro + palavra-passe
   que o admin criar (ou pedem ao admin para a repor) → veem o **Portal do Membro**.

---

## ⚠️ Migrar dados do projeto antigo (se já tiveres dados no AI Studio)
O projeto antigo pode ser apagado pelo Google a qualquer momento. Se lá tiveres dados
reais, exporta-os já (Console do projeto antigo → Firestore → …) e importa-os para o novo
com `firebase firestore:delete` + script, ou manualmente. **Pede-me que eu preparo o
script de migração** (copia coleção a coleção com o SDK de admin).
