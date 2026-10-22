# 🪪 Leitura do BI por fotografia — diagnóstico e correção (v1.7.2)

> **Sintoma:** no ecrã *Membros → Novo → "🪪 Bilhete de Identidade"*, a app tira a
> foto mas **não preenche os dados** (ou dá erro / "não consegui ler nada").

---

## 1. Causa principal — o Worker na Cloudflare está desatualizado

Esta é a causa nº 1 e foi **confirmada em 2026-10-23**:

```bash
$ node scripts/worker-health.mjs
GET https://iesa-ai.cadupaulino99.workers.dev/__health → HTTP 401
{"error":"Não autenticado."}
❌ O Worker no ar é ANTIGO
```

**Porquê:** as rotas que leem documentos (`/assistant/extract-member` e
`/assistant/extract-receipt`) só foram criadas no commit `98541bd` (v1.7.0).
O Worker, porém, **não é publicado pelo APK nem pelo GitHub Actions** — o
`docs/GUIA-CLOUDFLARE-WORKER.md` manda *colar o código à mão* no editor da
Cloudflare. Se essa colagem não foi repetida depois da v1.7.0, o servidor continua
com a versão do commit `75f6294`, que só tem 4 rotas:

| Rota | Worker antigo (`75f6294`) | Worker novo (`2.0.0`) |
|---|---|---|
| `/assistant/chat` | ✅ | ✅ |
| `/assistant/financial-insights` | ✅ | ✅ |
| `/assistant/draft-message` | ✅ | ✅ |
| `/admin/create-auth-account` | ✅ | ✅ |
| `/assistant/extract-member` (BI / cartão) | ❌ **404 "Rota nao encontrada"** | ✅ |
| `/assistant/extract-receipt` (comprovativo) | ❌ **404 "Rota nao encontrada"** | ✅ |
| `/__health` (diagnóstico) | ❌ | ✅ |
| `/assistant/selftest` (diagnóstico) | ❌ | ✅ |

> Instalar um APK novo **não** resolve: o APK é só o cliente. O código que fala com
> o Gemini vive na Cloudflare.

### ✅ Correção (escolha A ou B)

**A — Automática (recomendada, fica para sempre)**
1. Cloudflare → *My Profile* → **API Tokens** → *Create Token* → template
   **"Edit Cloudflare Workers"** → criar → copiar o token.
2. No dashboard da Cloudflare copie o **Account ID** (coluna direita).
3. GitHub → repositório → *Settings* → *Secrets and variables* → **Actions** →
   *New repository secret*:
   - `CLOUDFLARE_API_TOKEN` = o token
   - `CLOUDFLARE_ACCOUNT_ID` = o id da conta
4. Faça `git push`. O workflow `.github/workflows/deploy-ai-worker.yml` publica o
   Worker sozinho sempre que `worker/**` mudar.

**B — Manual (2 minutos)**
```bash
npm install -g wrangler
wrangler login
cd Gestao_IESA_Emanuel_App
npx wrangler secret put GEMINI_API_KEY   --config worker/wrangler.toml
npx wrangler secret put FIREBASE_SA_JSON --config worker/wrangler.toml
npm run deploy:worker
npm run worker:health     # tem de mostrar version 2.0.0 e vision: true
```
*(ou: Cloudflare → Workers → `iesa-ai` → **Edit code** → apagar tudo → colar
`worker/ai-worker.js` → **Save and Deploy**)*

---

## 2. Causa técnica — o Gemini não recebia resolução suficiente para OCR

Mesmo com o Worker publicado, a versão v1.7.x lia mal o BI. Três erros no pedido
ao Gemini, todos corrigidos em `worker/ai-worker.js` (v2.0.0):

| # | Antes (v1.7.x) | Agora (v2.0.0) | Porquê |
|---|---|---|---|
| **A** | sem `mediaResolution` | `MEDIA_RESOLUTION_HIGH` (global **e** por parte) | O Gemini 3 decide quantos tokens dedica à imagem. Sem isto, o texto pequeno do BI (nº, data de emissão, morada) fica ilegível. É o parâmetro oficial para *"dense document comprehension"*. |
| **B** | `parts: [ {text}, {inlineData} ]` | `parts: [ {inlineData}, {text} ]` | Recomendação oficial da Google: com uma imagem + prompt, **o texto vai depois da imagem**. |
| **C** | só `responseMimeType: 'application/json'` | + `responseSchema` (structured output) | Garante as chaves/tipos exatos. Acaba o erro *"A IA não devolveu JSON válido"*. |

Outras robustezes acrescentadas:

- **Fallback de modelos** — `gemini-3.8-flash → gemini-3.6-flash → gemini-2.5-flash`.
  Se a Google mudar/retirar um nome, a app continua a funcionar (foi exatamente o
  que aconteceu no passado com `gemini-3.5-flash`, ver `docs/MUDANCAS.md` C4).
- **`temperature: 0.1` removido** do pedido de visão — os modelos Gemini 3 usam
  *thinking* e rejeitam/ignoram `temperature`; um `400 INVALID_ARGUMENT` aqui
  matava a leitura inteira. Agora o Worker tenta 4 configurações por ordem até
  uma ser aceite.
- **Data URL aceite** — se o cliente mandar `data:image/jpeg;base64,…` inteiro, o
  Worker separa o prefixo (antes o Gemini rejeitava).
- **MIME validado** contra os formatos suportados (PNG, JPEG, WEBP, HEIC, HEIF).
- **Limite de 20 MB** verificado antes de enviar, com mensagem clara.
- **Erros com detalhe** — o Worker devolve `status`, `model`, `detalhe` e
  `workerVersion`; a app mostra-os em vez de um erro genérico.
- **Prompts reforçados** — "não invente", "use `null`", datas `AAAA-MM-DD`,
  orientação 90/180°, modelos antigo e novo do BI angolano, ignorar o campo *Filiação*.

---

## 3. Causa de interface — a app lia mas **deitava os dados fora**

O `onApply` de `src/pages/Members.tsx` só copiava 6 campos e **ignorava** três dos
mais importantes do BI:

```ts
// ANTES — documentNumber, gender e issueDate nunca chegavam ao formulário
if (s(f.name) !== undefined)      setValue('name', s(f.name));
if (s(f.phone) !== undefined)     setValue('phone', s(f.phone));
if (s(f.birthDate) !== undefined) setValue('birthDate', s(f.birthDate));
if (s(f.baptismDate) !== undefined) setValue('baptismDate', s(f.baptismDate));
if (s(f.address) !== undefined)   setValue('address', s(f.address));
if (s(f.groupCell) !== undefined) setValue('groupCell', s(f.groupCell));
```

Pior: dois **descasamentos de formato** faziam o formulário rejeitar valores válidos:

| Campo | A IA devolvia | O controlo exigia | Resultado |
|---|---|---|---|
| `birthDate` | `07/03/1990` (formato do BI) | `1990-03-07` (`<input type="date">`) | **silenciosamente ignorado** |
| `gender` | `M` / `F` | `Masculino` / `Feminino` / `Outro` (`<Select>`) | **silenciosamente ignorado** |
| `documentNumber` | `004578123LA040` | *não existia campo nem no tipo `Member`* | **perdido** |

### ✅ O que mudou

- `src/types.ts` — `Member` tem agora `documentNumber` e `issueDate`.
- `src/pages/Members.tsx` — novo campo **"Nº do Bilhete de Identidade"** no
  formulário, visível também no *Perfil do Membro*; `onApply` copia os 8 campos e
  mostra um *toast* com o que foi preenchido ("IA preencheu: Nome, Nº do BI,
  Nascimento, Morada, Género").
- `src/lib/ai.ts` — normalizadores novos, usados antes de tocar no formulário:
  - `normalizeDate()` — aceita `DD/MM/AAAA`, `DD-MM-AAAA`, `AAAA/MM/DD`,
    `AAAAMMDD`, `7 de Março de 1990`, só o ano → devolve sempre `AAAA-MM-DD`
  - `normalizeGender()` — `M`/`masc`/`male`/`homem` → `Masculino` (idem `F`)
  - `normalizePhone()` — `923 000 000` → `+244923000000`
  - `normalizeDocumentNumber()` — só dígitos
  - `normalizeMemberFields()` — aplica tudo de uma vez
- `compressImageFile()` — fundo branco ao converter (PNG transparente deixava de
  ficar preto), **fallback para os bytes originais** quando o `<canvas>` não
  consegue descodificar (HEIC/HEIF), e devolve `width`/`height`/`approxKb`.
- `DocumentReaderModal` — mostra a dimensão/peso da imagem optimizada, botão
  **"Testar ligação"**, painel de **Diagnóstico** e botão **"Tentar novamente"**.

---

## 4. Como verificar, passo a passo

```bash
# 0. Instalar dependências (uma vez)
npm install

# 1. Que versão do Worker está no ar?  → tem de dar version 2.0.0, vision true
npm run worker:health

# 2. O Gemini lê mesmo um BI?  (teste fora da app, isola o problema)
export GEMINI_API_KEY=AIza...
npm run test:bi                                   # usa o BI fictício de exemplo
npm run test:bi -- /caminho/foto-do-bi-real.jpg   # ou uma foto verdadeira
```

`npm run test:bi` corre a **mesma imagem em 3 modos** e imprime os campos lidos:

1. como a v1.7.x chamava (sem `mediaResolution`, texto antes da imagem);
2. corrigido (imagem primeiro + `MEDIA_RESOLUTION_HIGH`);
3. corrigido + `responseSchema`.

Assim vê-se na hora se a diferença vem da resolução ou de outra coisa.

### Ler o resultado

| O que acontece | Onde está o problema | O que fazer |
|---|---|---|
| `worker:health` dá 401/404 | Worker antigo na Cloudflare | Secção **1** |
| `worker:health` OK, `test:bi` falha | Chave Gemini / quota | Ver mensagem (`403` = sem acesso, `429` = quota) |
| `worker:health` OK, `test:bi` lê bem, app falha | app/APK ou sessão | Botão **"Testar ligação"** no modal |
| "Testar ligação" → *papel: (nenhum)* | Falta o registo em `admins` | *Admin → Utilizadores →* adicionar o email com papel `admin`/`pastor`/`treasurer` |

> O mesmo diagnóstico está na página **Suporte → separador «Diagnóstico IA»**
> (`src/pages/Support.tsx`), que corre o teste automaticamente ao abrir e tem botão
> *Repetir* e *copiar /__health*. A lógica é partilhada: `runAiDiagnostics()` em
> `src/lib/ai.ts`.
| "Sessão terminada — entre novamente" | `auth.currentUser` nulo | Sair e voltar a entrar na app |

---

## 5. Boas práticas na fotografia do BI (a qualidade manda)

O botão **"Testar ligação"** existe, mas 90% das falhas de OCR são de fotografia:

- Enquadre o BI **inteiro**, na horizontal, a ocupar ~80% do ecrã.
- Luz **uniforme e indireta** — o plastificado do BI reflete o flash e apaga o nº.
  Desligue o flash e use luz do dia.
- Fundo **escuro e contrastante** (mesa de madeira/mesa escura), nunca branco.
- Firme: apoie os cotovelos. Texto tremido = `null`.
- Se o BI for o **modelo antigo** (castanho), fotografe frente **e** verso e
  faça duas leituras — a morada costuma estar no verso.
- Não fotografe o ecrã de outro telemóvel (moiré destrói o OCR).

---

## 6. Ficheiros alterados nesta correção

```
worker/ai-worker.js                          ← mediaResolution HIGH, imagem antes do
                                               texto, responseSchema, fallback de
                                               modelos, /__health, /assistant/selftest,
                                               WORKER_VERSION, erros detalhados
worker/wrangler.toml                         ← NOVO: deploy por CLI/CI
.github/workflows/deploy-ai-worker.yml       ← NOVO: publica o Worker automaticamente
scripts/worker-health.mjs                    ← NOVO: que versão está no ar
scripts/test-gemini-bi.mjs                   ← NOVO: teste de OCR fora da app (3 modos)
scripts/testdata/exemplo-bi-angola.jpg       ← NOVO: BI fictício para testes
src/lib/ai.ts                                ← normalizadores (data/sexo/tel./nº BI),
                                               compressImageFile robusto, erros claros,
                                               checkWorkerHealth(), aiSelfTest()
src/components/documents/DocumentReaderModal.tsx ← "Testar ligação", painel de
                                               diagnóstico, "Tentar novamente",
                                               metadados da imagem
src/pages/Members.tsx                        ← campo "Nº do BI", onApply completo,
                                               toast com o que foi preenchido,
                                               perfil mostra BI/nascimento/morada
src/pages/Support.tsx                        ← NOVO separador "Diagnóstico IA"
                                               (Worker + segredos + papel + Gemini)
src/types.ts                                 ← Member.documentNumber, Member.issueDate
package.json                                 ← v1.7.2 + scripts
                                               (deploy:worker, worker:health, test:bi)
docs/FIX-LEITURA-BI.md                       ← este ficheiro
docs/MUDANCAS.md                             ← registo da v1.7.2
```

Validação: `npx tsc --noEmit` ✅ · `node --check worker/ai-worker.js` ✅

---

## 7. Nota de privacidade (importante, tratando-se de BI)

O BI é um documento de identidade: trate-o como dado pessoal sensível.

- A imagem **não é gravada** em lado nenhum — vai do telemóvel para o Worker e do
  Worker para o Gemini, em memória, e é descartada. **Mantenha assim.**
- Não ative logs de corpo de pedido no Worker (o `[observability]` do
  `wrangler.toml` regista só métricas, não payloads).
- A chave `GEMINI_API_KEY` e a `FIREBASE_SA_JSON` vivem **apenas** nos segredos da
  Cloudflare — nunca no APK, nunca no repositório.
- Se um dia guardar a foto do BI no Firestore/Storage, acrescente regras de acesso
  restritas a `hasFinancialWriteAccess()` e registe-o em `audit_logs`.
- O `GEMINI_API_KEY` que foi partilhado em chats/prints deve ser **revogado e
  recriado** (https://aistudio.google.com/apikey).
