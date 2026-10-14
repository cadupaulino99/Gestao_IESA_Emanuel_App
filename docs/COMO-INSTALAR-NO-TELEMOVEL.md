# 📱 COMO TER O APK NO TEU TELEMÓVEL (passo a passo)

> **O princípio é simples:** eu não consigo compilar o APK neste chat (não há Android SDK
> aqui), por isso o APK é produzido **ou na nuvem do GitHub (grátis)** ou **no teu PC com
> Android Studio**. Depois é só copiar o ficheiro `.apk` para o telemóvel e instalar,
> como qualquer outra app fora da Play Store.

**Escolhe uma rota:**

| Rota | Precisa de… | Demora | Ideal se… |
|---|---|---|---|
| **A — GitHub Actions** | conta GitHub + git (ou GitHub Desktop) | ~15 min (a maior parte é espera) | não queres instalar nada pesado |
| **B — Android Studio** | PC com ~8 GB RAM e 10 GB livres | ~40 min (downloads) | queres instalar por cabo USB e ir ajustando |

---

## ⏱️ Antes de qualquer rota (5 min de leitura)

O APK **instala-se** mesmo sem o Firebase configurado — mas o **login só funciona**
depois de fazeres o `docs/GUIA-FIREBASE.md` (passos 1–7, ~15 min). Ordem recomendada:

1. **GUIA-FIREBASE** (criar projeto + `google-services.json` + regras) ← faz isto primeiro
2. **Este guia** (compilar + instalar)

---

## 🅰️ ROTA A — GitHub Actions (recomendada)

### A1. Põe o código corrigido no GitHub (uma vez)
No teu PC (Windows/Mac), instala o git se não tiveres (<https://git-scm.com>) e:

```bash
git clone https://github.com/cadupaulino99/Gest-o_Emanuel_Xangongo.git
cd Gest-o_Emanuel_Xangongo
```
1. Descompacta o ZIP que te entreguei (`Gestao_IESA_Emanuel_Android_v1.1.0.zip`).
2. **Copia todo o conteúdo** descompactado para dentro da pasta `Gest-o_Emanuel_Xangongo`
   (substitui os ficheiros antigos; o `google-services.json` do GUIA-FIREBASE vai para
   `android/app/google-services.json`).
3. Volta ao terminal:
```bash
git add -A
git commit -m "App Android v1.1.0"
git push
```
> Sem linha de comandos? Usa o **GitHub Desktop** (mesmos 3 botões: *add → commit → push*)
> ou arrasta os ficheiros na página do repositório (**Add file → Upload files**) —
> para ~140 ficheiros o GitHub Desktop é mais prático.

### A2. Secrets (uma vez)
No GitHub: **Settings → Secrets and variables → Actions → New repository secret**
| Secret | Valor |
|---|---|
| `GOOGLE_SERVICES_JSON` | conteúdo do ficheiro `google-services.json` |
| *(opcional keystore)* | ver GUIA-BUILD-APK.md |

### A3. Compilar
1. GitHub → separador **Actions**.
2. **"Build Android (APK + AAB)"** → **Run workflow** (ou espera: o push já o disparou).
3. ~7–10 minutos depois fica **verde** ✅.
4. Entra no run → lá em baixo, **Artifacts → `gestao-iesa-android-N`** → descarrega o ZIP.
5. Descompacta: dentro está o **`app-debug.apk`** (é este o ficheiro mágico).

### A4. Levar o APK ao telemóvel (escolhe 1 método)
- **Google Drive / OneDrive:** sobe o APK do PC → no telemóvel, abre a app Drive →
  descarrega o ficheiro → toca-lhe → **Instalar**.
- **WhatsApp:** envia o APK a ti próprio ("Tu" / mensagens guardadas) → no telemóvel,
  abre a mensagem → toca no ficheiro → **Instalar**. (Limite 2 GB, chega e sobra.)
- **Cabo USB:** copia o APK para a pasta *Download* do telemóvel → gestor de ficheiros →
  toca no APK → **Instalar**.
- **Sem PC por perto?** No telemóvel: abre o GitHub no **browser**, entra em
  *Actions → run → Artifacts* e descarrega o ZIP diretamente (o browser descompacta-o
  ou usas uma app de descompactar, ex.: ZArchiver).

### A5. Instalar (Android)
1. Ao tocar no APK, o Android avisa: *"Fonte desconhecida"* → **Definições → Permitir
   desta fonte** → voltar → **Instalar**.
2. Abre a app → dá a permissão de **notificações** → **Entrar com Google** ou **Email**.
3. 🎉 Se aparecer o ecrã de login com o logótipo da igreja, está vivo.

---

## 🅱️ ROTA B — Android Studio (instalação por cabo USB)

1. Instala o **Android Studio** (<https://developer.android.com/studio>) — aceita tudo.
2. Descompacta o ZIP entregue e, dentro da pasta (onde está o `package.json`):
   ```bash
   npm install
   npm run build
   npx cap sync android
   ```
   (precisas do Node.js: <https://nodejs.org> — versão 22)
3. Android Studio → **Open** → escolhe a subpasta **`android`** → aguarda o *sync*
   (primeira vez: 5–10 min).
4. No telemóvel: **Definições → Acerca do telefone → toca 7× em "Número de compilação"**
   (ativa as opções de programador) → **Opções do programador → Depuração USB = ON**.
5. Liga o telemóvel por USB → aceita o aviso *"Permitir depuração?"* → o nome do
   telemóvel aparece no topo do Android Studio → carrega em **▶ Run**.
6. A app compila, instala e abre sozinha no telemóvel. (Fica instalada como qualquer app.)

> O APK desta rota fica também em `android/app/build/outputs/apk/debug/app-debug.apk`
> (podes copiá-lo para outros telemóveis).

---

## 🆘 Se algo falhar na instalação

| Sintoma | Solução |
|---|---|
| "App não instalada" | APK assinado com debug de **outro** PC/keystore já instalado: desinstala a versão anterior e repete |
| Botão **Entrar com Google** não faz nada | Falta `google-services.json`/SHA-1 (GUIA-FIREBASE passos 5–6) — usa **Email** entretanto |
| Login email dá "incorretos" | A conta ainda não foi criada: entra primeiro como admin (`cadupaulino99@gmail.com`) e cria os acessos em **Admin** |
| "Sem ligação" mas tenho rede | Regras Firestore não implantadas: `firebase deploy --only firestore:rules,firestore:indexes` |
| Artifact não aparece | O run ficou **vermelho**: entra no run → job → copia o erro e envia-mo |

## 🔁 Atualizar a app mais tarde
Cada nova versão = novo push → novo artifact → novo APK por cima do antigo
(mesmo nome de pacote → os dados mantêm-se). Aumenta o `versionCode` se fores publicar
na Play Store (GUIA-BUILD-APK.md).
