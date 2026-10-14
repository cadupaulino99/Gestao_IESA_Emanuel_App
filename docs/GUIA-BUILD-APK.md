# 📱 GUIA BUILD — gerar o APK/AAB da app

> **Importante:** este chat/sandbox **não tem Java nem Android SDK**, por isso o APK é
> compilado **fora daqui**: ou na nuvem (GitHub Actions, grátis — recomendado) ou no teu PC
> (Android Studio). O projeto em `03_android/` já está **pronto a compilar**: só falta o
> `google-services.json` (GUIA-FIREBASE, passo 5).

---

## Opção A — GitHub Actions (recomendado: não instalas nada)

### A1. Atualizar o teu repositório com o código corrigido
Eu entreguei-te a pasta corrigida (ou um `.zip`). No teu PC:
```bash
git clone https://github.com/cadupaulino99/Gest-o_Emanuel_Xangongo.git
cd Gest-o_Emanuel_Xangongo
# copia o CONTEÚDO da pasta corrigida por cima desta (substitui tudo)
git add -A
git commit -m "App Android pronta: auth nativa, IA em Cloud Functions, identidade IESA"
git push
```
> O workflow compila **automaticamente** a cada push para `main`.
> Também podes disparar à mão: **Actions → "Build Android (APK + AAB)" → Run workflow**.

### A2. Secrets do repositório (Settings → Secrets and variables → Actions)
| Secret | Obrigatório? | Valor |
|---|---|---|
| `GOOGLE_SERVICES_JSON` | ✅ sim | conteúdo do `google-services.json` |
| `KEYSTORE_B64` | opcional | `base64 -w0 release.keystore` (sem keystore, o release é assinado com debug — serve para testes, **não** para a Play Store) |
| `KEYSTORE_PASSWORD` | se houver keystore | password do keystore |
| `KEY_ALIAS` | se houver keystore | ex.: `iesa` |
| `KEY_PASSWORD` | se houver keystore | password da chave |

### A3. Criar o keystore (uma vez na vida — guarda-o PARA SEMPRE)
```bash
keytool -genkeypair -v -keystore release.keystore -alias iesa \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -storepass MUDAR-ME -keypass MUDAR-ME \
        -dname "CN=IESA Emanuel Xangongo, OU=TI, O=IESA, L=Xangongo, C=AO"
```
⚠️ Perder o keystore = nunca mais conseguir atualizar a app na Play Store.

### A4. Obter o APK
**Actions → build escolhido → Artifacts → `gestao-iesa-android-N`** (ZIP com):
- `app-debug.apk` — para testes imediatos;
- `app-release.apk` / `app-release.aab` — para distribuição/Play Store (assinado se houver keystore).

---

## Opção B — Android Studio (no teu PC)

1. Instala o [Android Studio](https://developer.android.com/studio) (aceita tudo; ~1,5 GB).
2. **Primeiro**, na raiz do projeto (onde está o `package.json`):
   ```bash
   npm install
   npm run build
   npx cap sync android     # liga os plugins e copia o build para dentro do Android
   ```
3. No Android Studio: **Open** → escolhe a pasta **`android/`** do projeto (não a raiz).
4. Aguarda o *Gradle sync* (primeira vez: 5–10 min a descarregar dependências).
5. Liga o telemóvel por USB com **Depuração USB** ativa (ou usa o emulador).
6. ▶ **Run 'app'** → a app instala e abre.
7. APK manual: menu **Build → Build Bundle(s)/APK(s) → Build APK(s)** →
   fica em `android/app/build/outputs/apk/debug/app-debug.apk`.
8. Release assinado: coloca `keystore.properties` + `release.keystore` em `android/app/`
   (formato no `build.gradle`) e **Build → Generate Signed Bundle / APK**.

---

## Instalar o APK no telemóvel
1. Copia o `app-debug.apk` (WhatsApp Drive, cable, ou `adb install app-debug.apk`).
2. No telemóvel: abre o ficheiro → **Instalar mesmo assim** (origens desconhecidas).
3. Abre a app → dá permissão de **notificações** quando pedir → entra com Google ou email.

---

## Resolução de problemas
| Sintoma | Causa / solução |
|---|---|
| Aviso `google-services.json not found` | Falta o ficheiro em `android/app/` (GUIA-FIREBASE passo 5). Sem ele o login Google nativo não funciona (email funciona). |
| Login Google falha no telemóvel | Falta o **SHA-1** do keystore no Firebase (GUIA-FIREBASE passo 5.5). |
| `permission-denied` ao ler dados | Regras/índices não implantados: `firebase deploy --only firestore:rules,firestore:indexes` |
| IA dá erro | `firebase functions:secrets:set GEMINI_API_KEY` e `firebase deploy --only functions` |
| Build morre por memória (PC fraco) | `org.gradle.jvmargs=-Xmx3072m` já está posto; fecha o browser durante o build |
| Notificações não aparecem | Android 13+: dá a permissão de notificações nas definições do sistema |

## Versionamento
O `versionCode/versionName` vêm de variáveis de ambiente (`ANDROID_VERSION_CODE`,
`ANDROID_VERSION_NAME`; por defeito `2` / `1.1.0`). Para subir a versão num release,
define-as no workflow ou no PC antes do build. **Cada atualização instalável precisa de
`versionCode` maior.**
