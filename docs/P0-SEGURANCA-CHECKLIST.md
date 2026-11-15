# P0 Segurança — checklist passo a passo (operador)

Itens que **não se resolvem só com código**. Marque conforme for concluindo.

Actualizado: 2026-11-15.

---

## Estado verificado automaticamente (repo + produção)

| Item | Resultado | Evidência |
|------|-----------|-----------|
| `package.json` versão | **OK** | `1.21.28` |
| Release GitHub com APK | **OK** | tag `v1.21.28` com `app-release.apk` e `app-debug.apk` |
| Hosting no ar | **OK** | https://iesa-emanuel-xangongo.web.app → HTTP 200 |
| Worker no ar | **OK** | `/__health` → `ok: true`, R2 bound |
| Código App Check no cliente | **OK** | `src/lib/firebase.ts` — activa se existir site key |
| Build passa `VITE_FIREBASE_APPCHECK_SITE_KEY` | **OK** (após este commit) | `deploy-hosting.yml` + `build-android.yml` |
| Restrições API key na Google Cloud | **PENDENTE (você)** | Só visível na consola GCP |
| App Check registado + Monitor | **PENDENTE (você)** | Só na consola Firebase |
| Secret `VITE_FIREBASE_APPCHECK_SITE_KEY` no GitHub | **PENDENTE (você)** | Settings → Secrets |
| MFA super admin Google | **PENDENTE (você)** | Conta Google |
| Telemóveis com APK ≥ 1.21.28 | **PENDENTE (equipa)** | Versão no ecrã de login |

---

## 1. Restringir a API key (Google Cloud)

**Dados da app**

- Projecto: `iesa-emanuel-xangongo`
- API key (cliente): a de `firebase-applet-config.json`
- Web: `https://iesa-emanuel-xangongo.web.app/*` e `https://iesa-emanuel-xangongo.firebaseapp.com/*`
- Android package: `ao.co.iesa.emanuelxangongo.gestao`

**Passos**

1. Abra [Google Cloud → Credenciais](https://console.cloud.google.com/apis/credentials?project=iesa-emanuel-xangongo).
2. Clique na **chave de API** usada pelo Firebase (mesma do ficheiro de config).
3. **Restrições de aplicação**:
   - **Sites HTTP:** adicione
     - `https://iesa-emanuel-xangongo.web.app/*`
     - `https://iesa-emanuel-xangongo.firebaseapp.com/*`
     - (opcional dev) `http://localhost/*`
   - **Apps Android:**
     - Nome do pacote: `ao.co.iesa.emanuelxangongo.gestao`
     - SHA-1 do keystore de **release** (Firebase Console → Definições do projecto → Sua app Android, ou `keytool -list -v -keystore ...`).
4. **Restrições de API:** limite a Identity Toolkit, Token Service, Firestore, App Check, Storage (e as que a consola mostrar em uso).
5. **Guardar**.

**Verificar se OK**

- [ ] Login na **web** (Hosting) funciona.
- [ ] Login no **APK release** funciona.
- Se um dos dois falhar com erro de API key / blocked → rever referrers ou SHA-1.

**Nota:** Não é possível confirmar restrições só a partir do repositório; só você vê a consola.

---

## 2. App Check (reCAPTCHA v3) — Monitor primeiro

**Passos Firebase**

1. [Firebase Console](https://console.firebase.google.com/) → projecto **iesa-emanuel-xangongo**.
2. Menu **App Check** → registar app **Web** → fornecedor **reCAPTCHA v3**.
3. Copiar a **site key**.
4. Em cada produto (Authentication, Firestore, Storage) deixar **Monitor** (não Enforce).

**Passos GitHub (para a key entrar no build)**

1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**:
   - Nome: `VITE_FIREBASE_APPCHECK_SITE_KEY`
   - Valor: a site key do reCAPTCHA.
3. Correr **Deploy Firebase Hosting (web)** e, se quiser no telemóvel, **Build Android (APK + AAB)**.

**Verificar se OK**

- [ ] App Check → métricas mostram pedidos **com token válido** (Monitor).
- [ ] App continua a funcionar na web e no APK.
- **Só depois de dias estáveis:** Enforce em Auth / Firestore / Storage, um de cada vez, testando login após cada um.

**Não active Enforce** antes do secret estar no build e do Monitor mostrar tráfego válido.

---

## 3. MFA na conta Google do super admin

1. Entre em https://myaccount.google.com/security com a conta do super admin (ex. a do fundador).
2. **Verificação em duas etapas** → activar (SMS, app Authenticator ou chave de segurança).
3. Guardar códigos de recuperação num sítio seguro (não só no telemóvel).

**Verificar se OK**

- [ ] Ao voltar a entrar na conta Google, pede o 2.º factor.

---

## 4. Equipa com APK da última release

**Já verificado no GitHub**

- Tag **`v1.21.28`** = `package.json` em `main`.
- Artefactos: `app-release.apk`, `app-debug.apk`.
- Download: https://github.com/cadupaulino99/Gestao_IESA_Emanuel_App/releases/tag/v1.21.28

**Passos na equipa**

1. Desinstalar APK antiga (opcional mas evita confusão) ou instalar por cima.
2. Instalar **app-release.apk** da release `v1.21.28` (ou superior).
3. Abrir a app → ecrã de login → confirmar **v1.21.28** (ou a versão nova).

**Verificar se OK**

- [ ] Cada telemóvel de teste mostra ≥ 1.21.28.
- [ ] Login admin e, se possível, membro de teste funcionam.

---

## Ordem recomendada (para não partir a app)

1. MFA (não afecta a app).
2. Instalar APK 1.21.28 em todos os aparelhos de teste.
3. Restringir API key → testar web + APK de imediato.
4. App Check em **Monitor** + secret + redeploy Hosting/APK → observar métricas.
5. Só no fim: **Enforce** App Check.

---

## Se algo falhar

| Sintoma | Acção |
|---------|--------|
| Web deixa de autenticar após restringir key | Incluir domínio Hosting nos referrers HTTP |
| APK deixa de autenticar | SHA-1 de **release** na restrição Android + no Firebase |
| App Check Enforce e app “morta” | Voltar a Monitor; confirmar secret no último build |
| Versão errada no telemóvel | Reinstalar APK da release GitHub correcta |
