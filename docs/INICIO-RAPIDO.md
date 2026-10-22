# 🚀 GUIA MÍNIMO — pôr a leitura do BI a funcionar

> Esqueça todos os outros guias por agora. **Só precisa disto.**
> Tempo total: ~10 minutos. Não precisa de instalar nada se escolher a Via A.

---

## O problema em 1 frase

O código que fala com a IA (o *Worker*) vive na Cloudflare e **está numa versão
antiga que não tem a leitura de documentos** — por isso a app recebe "rota não
encontrada". Corrigir o APK não resolve; é preciso publicar o Worker.

Confirmado em 2026-10-23:
```
GET https://iesa-ai.cadupaulino99.workers.dev/__health → 401 "Não autenticado."
                                        ^^^^^^^^^^^^^ se fosse a versão nova, devolvia JSON
```

---

## VIA A — Só com o browser (sem instalar nada) ⭐ mais simples

Já tem conta na Cloudflare (o Worker `iesa-ai` é seu). São 6 passos:

**1.** Abra https://dash.cloudflare.com e entre na sua conta.

**2.** Menu esquerdo → **Workers & Pages** → clique em **iesa-ai**.

**3.** Botão **Edit code** (abre o editor no browser).

**4.** Clique dentro do editor e faça **Ctrl+A** → **Delete** (apagar tudo).
Depois abra o ficheiro `worker/ai-worker.js` do repositório, **Ctrl+A** → **Ctrl+C**
e cole no editor (**Ctrl+V**).

**5.** Verifique os segredos: aba **Settings** → **Variables and Secrets**.
Têm de existir estes três (já devem existir da primeira instalação):

| Tipo | Nome |
|---|---|
| Secret | `GEMINI_API_KEY` |
| Secret | `FIREBASE_SA_JSON` |
| Variable | `PROJECT_ID` = `iesa-emanuel-xangongo` |

Se algum faltar, clique **Add** e crie-o. *(Se não souber o valor de
`FIREBASE_SA_JSON`, é o conteúdo do ficheiro `firebase-adminsdk-….json` que já
está nos secrets do GitHub.)*

**6.** Botão **Save and Deploy** (canto superior direito). ✅

### Confirmar que resultou

Abra num novo separador:

```
https://iesa-ai.cadupaulino99.workers.dev/__health
```

Deve aparecer algo como:

```json
{ "ok": true, "service": "iesa-ai", "version": "2.0.0", "vision": true,
  "config": { "GEMINI_API_KEY": true, "FIREBASE_SA_JSON": true,
              "PROJECT_ID": "iesa-emanuel-xangongo" } }
```

Se `"version": "2.0.0"` e `"vision": true` aparecerem → **está feito.**

Depois: na app, **Membros → Novo → 🪪 Bilhete de Identidade → Testar ligação**.

---

## VIA B — Deixar o GitHub fazer tudo (precisa de 2 tokens)

Isto é o que impede o problema de voltar a acontecer: de cada vez que o código do
Worker mudar, ele publica-se sozinho.

**Passo 1 — Token da Cloudflare**
1. https://dash.cloudflare.com/profile/api-tokens
2. **Create Token** → em *Custom token*:
   - Permissions: **Account** → `Workers Scripts` → **Edit**
   - Account Resources: a sua conta
   - **Continue to summary** → **Create Token** → **copie o token** (aparece 1 vez)
3. O **Account ID** está na página inicial do dashboard, coluna direita.

**Passo 2 — Token do GitHub**
1. https://github.com/settings/tokens?type=beta (Fine-grained)
2. **Generate new token**
   - Repository access: **Only select repositories** → `Gestao_IESA_Emanuel_App`
   - Permissions → Repository permissions → **Contents: Read and write**
     e **Workflows: Read and write**
3. **Generate token** → **copie**

**Passo 3 — Diga-me que tem os dois.** Eu trato do resto (push do código,
configuração dos secrets, deploy e verificação) e depois **revoga os dois tokens**.

> Também precisa de, **uma única vez**, definir os segredos do Worker
> (`GEMINI_API_KEY` e `FIREBASE_SA_JSON`) — isso faz-se no painel da Cloudflare
> (Via A, passo 5) ou por linha de comandos. Sem eles o Worker não fala com o
> Gemini. Se já lá estão da instalação anterior, não precisa de fazer nada.

---

## E o APK?

Só depois do Worker estar novo:

```bash
npm install
npx tsc --noEmit      # deve terminar sem erros
npm run build:android
```

Ou, mais simples: faça `git push` e o GitHub Actions
(`.github/workflows/build-android.yml`) gera o APK na página de **Releases**.

⚠️ **Atenção:** o APK traz as melhorias de interface (campo "Nº do BI", datas e
sexo a serem bem preenchidos, botão "Testar ligação"). Mas **a leitura em si passa
a funcionar assim que o Worker for publicado** — mesmo no APK que já tem
instalado, desde que a v1.7.0 já esteja nele.

---

## Se algo falhar

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `/__health` dá 401 ou 404 | Worker ainda antigo | Repita a Via A, passo 6 (**Save and Deploy**) |
| `"GEMINI_API_KEY": false` | Segredo em falta | Via A, passo 5 |
| `"vision": false` | Colou uma versão errada | Volte a colar `worker/ai-worker.js` |
| App: "Apenas a liderança pode usar a IA" | O seu email não está em `admins` | App → **Admin → Utilizadores** → adicione o seu email com papel `admin` |
| App: "Sessão terminada" | Sessão expirada | Saia e volte a entrar |
| Gemini: `API key not valid` | Chave Gemini inválida/revogada | Crie outra em https://aistudio.google.com/apikey e actualize o segredo |
| Gemini: erro 429 | Quota esgotada | Aguarde uns minutos |
| Lê mas campos ficam vazios | Foto má | Luz uniforme, sem flash (o plástico reflete), BI todo enquadrado, fundo escuro |

Guia técnico completo: [`docs/FIX-LEITURA-BI.md`](./FIX-LEITURA-BI.md)
