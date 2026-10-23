# ☁️ GUIA — Ativar a IA com Cloudflare Worker (grátis, sem cartão)

> Substitui as Cloud Functions do Firebase (que pedem o plano Blaze + cartão).
> O Worker faz 3 coisas: verifica quem está autenticado, confirma o papel
> (admin/pastor/tesoureiro) e fala com o Gemini em teu nome.
> **Custo: 0 Kz** — plano gratuito da Cloudflare (100 000 pedidos/dia).

---

## ⚠️ REGRA DE OURO — o Worker é um servidor à parte

**Instalar um APK novo NÃO atualiza o Worker.** O código que fala com o Gemini vive
na Cloudflare; se `worker/ai-worker.js` mudar no repositório e ninguém o voltar a
publicar, o servidor continua antigo e as rotas novas devolvem
`404 "Rota nao encontrada"` — foi exatamente assim que a **leitura do BI** ficou
partida (ver [`docs/FIX-LEITURA-BI.md`](./FIX-LEITURA-BI.md)).

Sempre que mexer no Worker, confirme a versão no ar:

```bash
npm run worker:health        # ou: abra https://iesa-ai.cadupaulino99.workers.dev/__health
```

Deve mostrar `"version": "2.0.0"` (ou superior), `"vision": true` e os três
segredos/variáveis a `true`. Se der 401/404, o Worker é antigo → publique-o
(Passo 3-B automático, ou Passo 3-A manual).

---

## Passo 1 — Chave Gemini (1 min)
1. Abre **https://aistudio.google.com/apikey** com a conta `cadupaulino99@gmail.com`
2. **"Create API key"** → copia a chave (começa por `AIza…`) → guarda num sítio seguro

## Passo 2 — Conta Cloudflare (2 min, sem cartão)
1. **https://dash.cloudflare.com/sign-up** → cria conta (email + password)
2. Não pede cartão no plano Free ✅

## Passo 3 — Criar e publicar o Worker

### 3-A — Manual (só na primeira vez, 3 min)
1. No painel: **Workers & Pages** (menu esquerdo) → **"Create"** → **"Hello World"** worker
2. Nome: `iesa-ai` (ou o que quiseres) → **Deploy** (cria um worker de exemplo)
3. Clica em **"Edit code"** (editor web)
4. **Apaga tudo** o que lá está e **cola o conteúdo inteiro** de `worker/ai-worker.js`
5. **Save and Deploy** ✅

### 3-B — Automático (recomendado; evita o problema para sempre)
Com `worker/wrangler.toml` já no repositório:

```bash
npm install -g wrangler
wrangler login                                  # abre o browser, autoriza
npm run deploy:worker                           # = wrangler deploy --config worker/wrangler.toml
```

E para que **cada push publique sozinho** (GitHub Actions —
`.github/workflows/deploy-ai-worker.yml`):
1. Cloudflare → *My Profile* → **API Tokens** → *Create Token* → template
   **"Edit Cloudflare Workers"** → copiar o token
2. Copiar o **Account ID** (dashboard Cloudflare, coluna direita)
3. GitHub → repositório → *Settings* → *Secrets and variables* → **Actions** →
   *New repository secret*: `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`
4. `git push` → o workflow publica e imprime o `/__health` no fim ✅

## Passo 4 — Segredos e variáveis (2 min)
No Worker → separador **Settings → Variables and Secrets**:
| Tipo | Nome | Valor |
|---|---|---|
| **Secret** | `GEMINI_API_KEY` | a chave do Passo 1 |
| **Secret** | `FIREBASE_SA_JSON` | conteúdo **inteiro** do ficheiro `firebase-adminsdk-fbsvc@….json` (o mesmo que está no secret do GitHub) |
| **Variable** | `PROJECT_ID` | `iesa-emanuel-xangongo` (já vem definida no `wrangler.toml`) |

Por linha de comandos (os segredos **nunca** vão para o repositório):
```bash
npx wrangler secret put GEMINI_API_KEY   --config worker/wrangler.toml
npx wrangler secret put FIREBASE_SA_JSON --config worker/wrangler.toml
```

## Passo 5 — Testar (1 min)
O Worker fica em `https://iesa-ai.TUA-CONTA.workers.dev`.

| Teste | O que deve devolver |
|---|---|
| Abrir o URL raiz no browser | `{"error":"Não autenticado."}` → está vivo e a proteger-se ✅ |
| `…/__health` (ou `npm run worker:health`) | `"version":"2.0.0"`, `"vision":true`, segredos a `true` ✅ |
| Dentro da app: *Membros → Novo → 🪪 Bilhete de Identidade → **Testar ligação*** | diagnóstico completo: versão do Worker, o seu papel, se o Gemini responde ✅ |
| `npm run test:bi` (fora da app, com `GEMINI_API_KEY`) | lê o BI fictício de exemplo e compara 3 modos ✅ |

Se algum destes falhar, o quadro de diagnóstico está em
[`docs/FIX-LEITURA-BI.md` §4](./FIX-LEITURA-BI.md).

## Passo 6 — Ligar a app ao Worker
1. **Copia-me o URL do Worker** (ex.: `https://iesa-ai.xxxxx.workers.dev`)
2. Eu colo-o no `src/lib/ai.ts`, faço commit e o build gera o **APK v1.3.0 com IA viva**
3. Testas: Suporte → separador IA / Finanças → Parecer Executivo / Membro → Mensagem pastoral 🤖

---

## Porque é seguro
- Cada pedido leva o **ID token do Firebase** do utilizador; o Worker verifica a
  assinatura com os certificados do Google → ninguém finge ser quem não é.
- O Worker lê a coleção `admins` no Firestore para confirmar o **papel** → membros
  comuns não conseguem chamar a IA nem criar contas.
- A chave Gemini e a service account vivem **só nos segredos da Cloudflare** —
  nunca no APK, nunca no código.

## Limites do plano grátis (chegam e sobram)
- 100 000 pedidos/dia ao Worker (uma igreja faz dezenas)
- Gemini: quota gratuita da chave AI Studio (limites por minuto generosos)
- Sem pausas por inatividade (ao contrário do Supabase Free) 🎉
