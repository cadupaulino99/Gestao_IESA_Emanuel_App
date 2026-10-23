# 🪪 Leitura do BI por fotografia — diagnóstico e correção

**App v1.7.2 · Worker v2.1.0 · 2026-10-22**

> **Sintoma:** no ecrã *Membros → Novo → "🪪 Bilhete de Identidade"*, a app tira a
> foto mas **não preenche os dados** (ou dá erro / "não consegui ler nada").

---

## 1. Causa principal — o modelo Gemini era lento demais para um Worker

> ⚠️ **Correção (2026-10-22):** a primeira versão deste documento apontava como
> causa principal "o Worker na Cloudflare está desatualizado". **Estava errado.**
> Inspecionei o Worker pela API da Cloudflare e o código publicado (19 559 bytes)
> é exatamente a v1.7.1 do repositório — as rotas `/assistant/extract-member` e
> `/assistant/extract-receipt` **já lá estavam**. Conclusão retirada dessa
> hipótese, causa real abaixo, medida.

O Worker chamava **`gemini-3.8-flash`**. Medições reais com a chave do projeto,
no mesmo pedido (BI de exemplo, 6 campos):

| Modelo | Tempo | Campos lidos |
|---|---|---|
| `gemini-3.8-flash` | **170,0 s** | 6/6 |
| `gemini-3.8-flash` (2ª tentativa) | **390,6 s** | 6/6 |
| `gemini-3.6-flash` | **3,0 s** | 6/6 |
| `gemini-3.5-flash-lite` | **1,9 s** | 6/6 |
| `gemini-3.1-flash-lite` | **2,2 s** | 6/6 |
| `gemini-2.5-flash` | HTTP **404** — *"no longer available to new users"* | — |

**Porque é que isto parte tudo:** um subrequest de um Worker da Cloudflare é
cortado aos **~100 s**. Uma chamada de 170–390 s **nunca chega ao fim** — a
Cloudflare desliga e a app recebe 5xx/502. E o fallback que existia só cobria
`400/404` de modelo inválido, portanto não havia rede de segurança. Há um relato
público de latência extrema no Gemini 3 Flash (*"API requests that would take
seconds now take over 5 minutes"*), o que bate certo com a medição.

### ✅ Correção (`worker/ai-worker.js` v2.1.0)

```js
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const GEMINI_TIMEOUT_MS = 45_000;   // abaixo do limite de ~100 s da Cloudflare
```

- **Timeout explícito** de 45 s por tentativa (`AbortSignal.timeout`) — assim é o
  Worker que desliga e o fallback corre, em vez de ser a Cloudflare a cortar.
- **Fallback alargado**: repete noutro modelo em `400/404` (modelo/config),
  `408` (timeout), `429` (quota) **e `5xx`** — incluindo o `503 "This model is
  currently experiencing high demand"`, que é frequente no escalão gratuito e
  transitório.
- `gemini-2.5-flash` **removido**: devolve 404 em chaves novas e só queimava tempo.
- `thinkingConfig.thinkingLevel: 'low'` nos pedidos de visão — OCR não precisa de
  raciocínio profundo e o nível baixo corta latência.

**Resultado medido depois da correção** (`npm run test:bi`, 3 modos):

```
1) v1.7.x — sem mediaResolution, texto antes da imagem   gemini-3.6-flash   6,8 s   6/6
2) corrigido — imagem primeiro + MEDIA_RESOLUTION_HIGH   gemini-3.6-flash   4,8 s   6/6
3) corrigido + responseSchema                            gemini-3.5-flash-lite 10,3 s  6/6
✅ Todos os modos responderam.
```

---

## 2. Robustez do pedido de visão (não era a causa, mas ajuda em fotos reais)

Com uma imagem limpa, o modo antigo e o novo leem igualmente bem (ver quadro
acima). Numa **foto real de telemóvel** — brilho no plastificado, sombra, rotação,
resolução baixa — os três acertos abaixo são o que separa "lê" de "devolve null":

| # | Antes (v1.7.x) | Agora (v2.1.0) | Porquê |
|---|---|---|---|
| **A** | sem `mediaResolution` | `MEDIA_RESOLUTION_HIGH` (global **e** por parte) | O Gemini 3 decide quantos tokens dedica à imagem. É o parâmetro oficial para *"dense document comprehension"* — texto pequeno (nº do BI, emissão, morada). |
| **B** | `parts: [ {text}, {inlineData} ]` | `parts: [ {inlineData}, {text} ]` | Recomendação oficial da Google: com uma imagem + prompt, **o texto vai depois da imagem**. |
| **C** | só `responseMimeType: 'application/json'` | + `responseSchema` (structured output) | Garante chaves/tipos exatos. Acaba o erro *"A IA não devolveu JSON válido"*. |

Outras robustezes acrescentadas:

- **`temperature: 0.1` removido** — os modelos Gemini 3 usam *thinking* e podem
  rejeitar `temperature` com `400 INVALID_ARGUMENT`, o que matava a leitura.
  Agora o Worker tenta 5 `generationConfig` por ordem até um ser aceite.
- **Data URL aceite** — se o cliente mandar `data:image/jpeg;base64,…` inteiro, o
  Worker separa o prefixo (antes o Gemini rejeitava).
- **MIME validado** contra os formatos suportados (PNG, JPEG, WEBP, HEIC, HEIF).
- **Limite de 20 MB** verificado antes de enviar, com mensagem clara.
- **Erros com detalhe** — o Worker devolve `status`, `model`, `detalhe` e
  `workerVersion`; a app mostra-os em vez de um erro genérico.
- **Prompts reforçados** — "não invente", "use `null`", datas `AAAA-MM-DD`,
  orientação 90/180°, modelos antigo e novo do BI angolano, ignorar o campo *Filiação*.

---

## 2b. Deploy: duas armadilhas que iam piorando as coisas

**(i) O `wrangler deploy` apaga os segredos** que não estiverem no
`wrangler.toml`. Como `GEMINI_API_KEY` e `FIREBASE_SA_JSON` são segredos (e não
podem ir para o repositório), um deploy pelo Wrangler **destruía-os** — e ninguém
tinha os valores de cor. Ficou documentado no `wrangler.toml` e o workflow do
GitHub Actions fotografa os segredos antes/depois e **falha** se algum
desaparecer. Para publicar em segurança usa-se `scripts/deploy-worker-api.mjs`,
que lê os bindings atuais e os reenvia (preservando-os).

**(ii) As chaves estavam gravadas como `plain_text`, não como `Secret`.** Ver
secção 8 — é urgente.

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

# 1. Que versão do Worker está no ar?  → tem de dar version 2.1.0, vision true
npm run worker:health

# 2. O Gemini lê mesmo um BI, e em quantos segundos?  (teste fora da app)
export GEMINI_API_KEY=AIza...
npm run test:bi                                   # usa o BI fictício de exemplo
npm run test:bi -- /caminho/foto-do-bi-real.jpg   # ou uma fotografia verdadeira

# 3. Inspecionar/publicar o Worker SEM perder os segredos
export CLOUDFLARE_API_TOKEN=...   CLOUDFLARE_ACCOUNT_ID=...
npm run deploy:worker:check                       # só inspeciona
npm run deploy:worker                             # publica e preserva os bindings
```

`npm run test:bi` corre a **mesma imagem em 3 modos** e imprime campos **e tempo**:

1. como a v1.7.x chamava (sem `mediaResolution`, texto antes da imagem);
2. corrigido (imagem primeiro + `MEDIA_RESOLUTION_HIGH`);
3. corrigido + `responseSchema`.

**Olhe para os segundos tanto como para os campos.** Se algum modo passar dos
~90 s, o Worker vai falhar mesmo que a leitura esteja correta — o limite de
subrequest da Cloudflare é ~100 s. Foi exatamente isso que aconteceu.

### Ler o resultado

| O que acontece | Onde está o problema | O que fazer |
|---|---|---|
| `test:bi` lê tudo mas demora > 90 s | Modelo lento (ex.: `gemini-3.8-flash`) | Usar os modelos rápidos de `GEMINI_MODELS`; ver secção **1** |
| `worker:health` dá 401/404 | Worker sem `/__health` (anterior à v2.0.0) | `npm run deploy:worker` |
| `worker:health` OK mas `"vision": false` | Código errado publicado | Voltar a publicar `worker/ai-worker.js` |
| `test:bi` → `403 API key not valid` | Chave Gemini inválida/revogada | Criar outra em https://aistudio.google.com/apikey |
| `test:bi` → `429` | Quota esgotada | Aguardar, ou ativar faturação na chave |
| `test:bi` → `503 high demand` | Capacidade do escalão gratuito | Transitório — o Worker já repete noutro modelo |
| `test:bi` → `404 no longer available to new users` | Modelo descontinuado nessa chave | Tirar o modelo de `GEMINI_MODELS` |
| `worker:health` OK, `test:bi` lê bem, app falha | app/APK, sessão ou fotografia | Botão **"Testar ligação"** no modal |
| "Testar ligação" → *papel: (nenhum)* | Falta o registo em `admins` | *Admin → Utilizadores* → adicionar o email com papel `admin`/`pastor`/`treasurer` |
| "Sessão terminada — entre novamente" | `auth.currentUser` nulo | Sair e voltar a entrar na app |
| Campos lidos mas formulário fica vazio | Formatos (`07/03/1990`, `M`) | Já corrigido — ver secção **3** |

> O mesmo diagnóstico está na página **Suporte → separador «Diagnóstico IA»**
> (`src/pages/Support.tsx`), que corre o teste automaticamente ao abrir e tem
> botão *Repetir* e *copiar /__health*. A lógica é partilhada:
> `runAiDiagnostics()` em `src/lib/ai.ts`.

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

---

## 8. 🚨 URGENTE — chaves expostas em texto simples

Inspecionei o Worker pela API da Cloudflare em 2026-10-22. Os três bindings estão
gravados como **`plain_text`**, não como **`Secret`**:

```
· FIREBASE_SA_JSON   plain_text     ← chave PRIVADA da service account do Firebase
· GEMINI_API_KEY     plain_text
· PROJECT_ID         plain_text     ← este não é sensível, está bem assim
```

O que isto significa na prática:

| Risco | Detalhe |
|---|---|
| Legível no painel | Qualquer pessoa com acesso à conta Cloudflare vê os valores em claro em *Settings → Variables and Secrets* |
| Legível pela API | `GET /workers/scripts/iesa-ai/settings` devolve `plain_text` **com o valor** (foi assim que eu os vi). Um token só de leitura chega |
| `FIREBASE_SA_JSON` | É a **chave-mestra** do projeto Firebase: dá acesso de administrador ao Firestore, Auth e Storage de toda a igreja |
| `GEMINI_API_KEY` | Permite gastar a quota/crédito em seu nome |

### O que fazer, por ordem

1. **Rodar a chave da service account do Firebase** (é o mais grave):
   - https://console.firebase.google.com → projeto `iesa-emanuel-xangongo`
   - *Project settings → Service accounts → Generate new private key*
   - **Revoke** a chave antiga (`private_key_id` terminado em `…2caa6e8da17b23`)
   - Colar o JSON novo no Worker **como tipo `Secret`**
2. **Recriar a chave Gemini**: https://aistudio.google.com/apikey → apagar a atual
   (a que começa por `AIzaSyA006H…`) → criar nova → colar no Worker **como `Secret`**.
3. **No painel, gravar como `Secret` e não como `Text`**:
   *Workers & Pages → iesa-ai → Settings → Variables and Secrets → Add* →
   escolher **Secret** (cifrado). O painel esconde o valor depois de gravado.
4. **Rodar os tokens partilhados nesta conversa** (Cloudflare e GitHub) — ver
   secção 9.

Enquanto não rodar, assuma que estas duas chaves estão comprometidas.

---

## 9. Tokens usados nesta intervenção

Para permitir a publicação foram partilhados em chat:

- um **token da Cloudflare** (`cfut_…`) — só com *Workers Scripts: **Read***,
  o que chegou para inspecionar mas **não** para publicar; expira em 2026-10-24;
- um **fine-grained token do GitHub** (`github_pat_…`) — com *Contents* e
  *Workflows: Read and write* no repositório, mas **sem** *Administration*,
  portanto não consegue gravar secrets do Actions (`403 Resource not accessible`).

**Ambos devem ser revogados** assim que a publicação estiver feita:
- Cloudflare → *My Profile → API Tokens → ⋮ → Delete*
- GitHub → *Settings → Developer settings → Fine-grained tokens → Delete*

Regra para a próxima: tokens com expiração de horas, escopo mínimo, e nunca
partilhar o `FIREBASE_SA_JSON` — esse só entra pelo painel da Cloudflare.
