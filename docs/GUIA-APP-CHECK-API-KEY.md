# Guia — App Check e restrição da API key

Objectivo: reduzir abuso da `apiKey` do cliente e exigir que pedidos venham de apps legítimas (web / APK).

O código em `src/lib/firebase.ts` **já suporta App Check**, mas só activa se existir a variável de ambiente `VITE_FIREBASE_APPCHECK_SITE_KEY`. Sem ela a app continua a funcionar como antes.

---

## Parte A — Restringir a API key (Google Cloud)

A chave em `firebase-applet-config.json` é **pública por desenho** do Firebase. O que impede abuso são **restrições** na Google Cloud.

1. Abra [Google Cloud Console](https://console.cloud.google.com/) → projecto **iesa-emanuel-xangongo**.
2. **APIs e serviços** → **Credenciais**.
3. Abra a chave de API usada pela app web (a mesma do `firebase-applet-config.json`).
4. **Restrições de aplicação**:
   - **Sites HTTP (web):**
     - `https://iesa-emanuel-xangongo.web.app/*`
     - `https://iesa-emanuel-xangongo.firebaseapp.com/*`
     - (se tiver domínio próprio) `https://SEU-DOMINIO/*`
     - Para desenvolvimento local: `http://localhost:*` (remover em produção se possível)
   - **Apps Android** (APK):
     - Nome do pacote: `ao.co.iesa.emanuelxangongo.gestao`
     - SHA-1 do keystore de **release** (e debug se precisar)
5. **Restrições de API** — limitar às APIs necessárias, por exemplo:
   - Identity Toolkit API
   - Token Service API
   - Cloud Firestore API
   - Firebase App Check API
   - Cloud Storage for Firebase API
   - (outras que a consola indicar como em uso)
6. Guardar e testar login + leitura Firestore na web e no telemóvel.

> Se a app Android deixar de autenticar, confirme o SHA-1 do keystore de release em Firebase → Definições do projecto → As suas apps → Android.

---

## Parte B — App Check (reCAPTCHA v3 na web)

### B1. Consola Firebase

1. [Firebase Console](https://console.firebase.google.com/) → projecto **iesa-emanuel-xangongo**.
2. **App Check** no menu.
3. Registe a app **Web** com fornecedor **reCAPTCHA v3** (ou Enterprise se já usar).
4. Copie a **site key** do reCAPTCHA.
5. Deixe os produtos (**Authentication**, **Firestore**, **Storage**) em modo **Monitor** (não Enforce) durante alguns dias.
6. Confirme no painel App Check que aparecem tokens **válidos** da sua web/APK.

### B2. Variáveis no build

No CI / secrets do GitHub Actions (build Hosting e Android), ou ficheiro `.env` local:

```bash
# Site key reCAPTCHA v3 (App Check Web)
VITE_FIREBASE_APPCHECK_SITE_KEY=6L................................

# Opcional — desenvolvimento:
# true = o SDK gera um debug token (registar na consola App Check)
# ou cole um UUID já registado em Manage debug tokens
# VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=true
```

Depois: novo deploy Hosting e/ou novo APK para a chave entrar no bundle.

### B3. Enforce (só depois de validar)

Quando o monitor mostrar tráfego legítimo estável:

1. App Check → cada produto → **Enforce**.
2. Teste de imediato: login, membros, finanças, upload de cartaz.
3. Se algo falhar, volte temporariamente a Monitor e verifique debug tokens / site key.

**Não active Enforce** antes de a variável `VITE_FIREBASE_APPCHECK_SITE_KEY` estar no build em produção.

---

## Parte C — Android (Capacitor)

A APK usa o SDK JS dentro da WebView: o **reCAPTCHA v3** também cobre a app se a site key estiver no build.

Para Play Integrity nativo (mais forte) no futuro:

- Registar a app Android no App Check com Play Integrity
- SHA-1 de release correcto
- Avaliar plugin nativo (ex. Capacitor Firebase App Check) numa fase posterior

---

## Checklist rápido

| Passo | Feito? |
|-------|--------|
| API key com restrição HTTP (Hosting) | ☐ |
| API key com restrição Android (pacote + SHA-1) | ☐ |
| API key limitada às APIs Firebase necessárias | ☐ |
| App Check Web registado (reCAPTCHA v3) | ☐ |
| `VITE_FIREBASE_APPCHECK_SITE_KEY` no build de produção | ☐ |
| Modo Monitor com tokens válidos | ☐ |
| Enforce Auth / Firestore / Storage | ☐ (só no fim) |

---

## Comportamento do código

| Situação | Resultado |
|----------|-----------|
| Sem `VITE_FIREBASE_APPCHECK_SITE_KEY` | App igual à actual; sem tokens App Check |
| Com site key | `initializeAppCheck` + refresh automático |
| Debug token definido | Facilita testes locais com Enforce |
