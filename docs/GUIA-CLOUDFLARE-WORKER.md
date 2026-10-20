# ☁️ GUIA — Ativar a IA com Cloudflare Worker (grátis, sem cartão)

> Substitui as Cloud Functions do Firebase (que pedem o plano Blaze + cartão).
> O Worker faz 3 coisas: verifica quem está autenticado, confirma o papel
> (admin/pastor/tesoureiro) e fala com o Gemini em teu nome.
> **Custo: 0 Kz** — plano gratuito da Cloudflare (100 000 pedidos/dia).

---

## Passo 1 — Chave Gemini (1 min)
1. Abre **https://aistudio.google.com/apikey** com a conta `cadupaulino99@gmail.com`
2. **"Create API key"** → copia a chave (começa por `AIza…`) → guarda num sítio seguro

## Passo 2 — Conta Cloudflare (2 min, sem cartão)
1. **https://dash.cloudflare.com/sign-up** → cria conta (email + password)
2. Não pede cartão no plano Free ✅

## Passo 3 — Criar o Worker (3 min)
1. No painel: **Workers & Pages** (menu esquerdo) → **"Create"** → **"Hello World"** worker
2. Nome: `iesa-ai` (ou o que quiseres) → **Deploy** (cria um worker de exemplo)
3. Clica em **"Edit code"** (editor web)
4. **Apaga tudo** o que lá está e **cola o conteúdo inteiro** de `worker/ai-worker.js`
   (está no teu repositório e no ZIP)
5. **Save and Deploy** ✅

## Passo 4 — Segredos e variáveis (2 min)
No Worker → separador **Settings → Variables and Secrets**:
| Tipo | Nome | Valor |
|---|---|---|
| **Secret** | `GEMINI_API_KEY` | a chave do Passo 1 |
| **Secret** | `FIREBASE_SA_JSON` | conteúdo **inteiro** do ficheiro `firebase-adminsdk-fbsvc@….json` (o mesmo que está no secret do GitHub) |
| **Variable** | `PROJECT_ID` | `iesa-emanuel-xangongo` |

## Passo 5 — Testar no browser (1 min)
O Worker fica em `https://iesa-ai.TUA-CONTA.workers.dev`.
Abre esse URL no browser: deve responder `{"error":"Não autenticado."}` — **é o sinal de que está vivo e a proteger-se** ✅

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
