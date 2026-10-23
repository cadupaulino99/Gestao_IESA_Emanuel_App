# ✅ A sua vez — passo a passo (2026-10-23)

> Regra de ouro: **em cada passo há um «Esperado» e um «Não mexer».**
> Se o ecrã for diferente do «Esperado», pare e envie captura ao assistente.
> Ordem obrigatória: testar → criar chaves novas → instalar → confirmar → **só então** apagar as antigas.

---

## PARTE 1 — Confirmar que a leitura do BI funciona (risco zero)

1. No telemóvel, abra:
   `https://github.com/cadupaulino99/Gestao_IESA_Emanuel_App/releases/download/v1.7.2/app-release.apk`
   → transfira → instale (o Android pergunta se confia na origem → **Instalar mesmo assim**).
   - **Esperado:** app «Gestão IESA Emanuel», versão 1.7.2.
2. Entre com a sua conta.
3. **Membros → Novo → 🪪 Bilhete de Identidade**.
4. «Tirar fotografia ou escolher imagem» → fotografe o BI:
   deitado (horizontal), luz do dia, **sem flash**, BI a ocupar ~80% do ecrã, fundo escuro.
5. **Ler com IA** → aguarde.
   - **Esperado:** lista de campos lidos (Nome completo, Nº do BI, Nascimento, Residência, Sexo, Emissão) em **menos de 15 segundos**.
6. **Aplicar** → o formulário preenche-se.
   - Se era só um teste: feche a janela **sem guardar**.
7. Se der erro: não repita dez vezes — carregue em **Testar ligação** e envie captura do painel.
   - **Não mexer:** não apague membros, não altere definições.

---

## PARTE 2 — Rodar as duas chaves, sem parar a igreja

### A) Gemini — criar a nova (NÃO apagar a antiga ainda)

1. `https://aistudio.google.com/apikey` com a conta Google dona do projeto.
2. **Create API key** → aparece uma chave nova → **Copy**. Deixe o separador aberto.
   - **Esperado:** chave a começar por `AIza…`, diferente da antiga.
   - **Não mexer:** não apague nenhuma chave neste passo.

### B) Firebase — criar a nova (NÃO apagar a antiga ainda)

1. `https://console.firebase.google.com` → cartão do projeto **iesa-emanuel-xangongo**.
2. Roda dentada ⚙️ (ao lado de «Project Overview», à esquerda) → **Project settings**.
3. Separador **Service accounts**.
4. Botão **Generate new private key** → janela de confirmação → **Generate key**.
   - **Esperado:** descarrega um ficheiro `firebase-adminsdk-….json`.
     Abra-o no Bloco de Notas e confirme que contém `"private_key"`.
   - **Não mexer:** mais nada neste separador. Não apague contas nem chaves.

### C) Instalar os dois valores novos no Worker (2 edições na Cloudflare)

1. `https://dash.cloudflare.com` → **Workers & Pages** → **iesa-ai**.
2. Separador **Settings** → secção **Variables and Secrets**.
3. Linha **GEMINI_API_KEY** → lápis (**Edit**) → apague o conteúdo → cole a chave nova → **Save**.
   - **Esperado:** o tipo continua **Secret**; só o valor muda.
4. Linha **FIREBASE_SA_JSON** → lápis → apague tudo → cole o **conteúdo inteiro** do JSON
   (do `{` inicial ao `}` final, sem cortes) → **Save**.
   - **Esperado:** continua **Secret**.
5. **Não mexer:** nos **nomes** das linhas, no **tipo**, na linha **PROJECT_ID**.
   Não apague nenhuma linha. Não carregue em «Deploy» nem «Delete».
6. Diga «feito» ao assistente (ele verifica por fora), **ou** verifique você:
   na app, **Suporte → Diagnóstico IA** → deve terminar com «✓ Gemini a responder».

### D) SÓ DEPOIS de confirmado — apagar as chaves antigas

1. **Gemini:** `https://aistudio.google.com/apikey` → na lista, a chave antiga
   (começa por `AIzaSyA006H…`) → **Delete**.
   - **Esperado:** fica apenas a chave nova.
2. **Firebase:** `https://console.cloud.google.com/iam-admin/serviceaccounts`
   → clique em `firebase-adminsdk-fbsvc@iesa-emanuel-xangongo.iam.gserviceaccount.com`
   → separador **KEYS** → lixo ao lado da chave com ID terminado em `…2caa6e8da17b23` (a antiga).
   - **Esperado:** fica apenas a chave nova.
   - **Não mexer:** **não apague a service account** — apague só a *chave* antiga.

---

## PARTE 3 — Revogar os tokens que partilhou (2 minutos)

1. **Cloudflare:** *My Profile → API Tokens* → token criado hoje («Qwen 18.5» ou semelhante)
   → **⋮ → Delete**.
   - (O primeiro token, só de leitura, já foi revogado por si ✅)
2. **GitHub:** avatar → **Settings** → **Developer settings** (fim do menu esquerdo)
   → **Fine-grained tokens** → o token → **Delete**.
   - **Esperado:** a lista fica vazia. Daqui em diante, mesmo lendo esta conversa,
     ninguém consegue alterar nada seu.

---

## PARTE 4 — Onde NÃO deve tocar (lista curta, para sossego)

- **Cloudflare:** não crie, apague ou renomeie o Worker `iesa-ai`; não mexa em
  *Domains/Routes*, *Triggers* nem noutras Workers.
- **Firebase:** não apague a service account; não altere *Rules* nem *Authentication*.
- **GitHub:** não apague branches (`main`, `fix/leitura-bi`) nem releases.
- **No Worker:** fora das duas edições da Parte 2-C, não carregue em nada.

---

## PARTE 5 — Opcional, para outro dia: deploy automático

Para o GitHub publicar o Worker sozinho a cada alteração (e nunca mais ser preciso
colar código à mão — que foi a origem de tudo isto), acrescentam-se em
*GitHub → Settings → Secrets and variables → Actions*:

| Secret | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token novo com *Workers Scripts: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | `9c4128fac728b76e5c0c4649ebdbb39e` |
| `GEMINI_API_KEY` | a chave **nova** |
| `FIREBASE_SA_JSON` | o JSON **novo** |

e a variável `CF_DEPLOY_ENABLED=true`. Sem isto, o job fica *skipped* de propósito
e o deploy continua manual — não é um erro.

---

## Se algo correr mal

| Sintoma | Primeiro gesto |
|---|---|
| App: «A ler o documento…» há mais de 1 min | Feche e reabra; se persistir, *Testar ligação* e captura |
| *Testar ligação*: «✗ Gemini falhou: API key not valid» | A chave nova não ficou bem colada — repita a Parte 2-C, linha GEMINI_API_KEY |
| *Testar ligação*: «✗ papel: (nenhum)» | *Admin → Utilizadores* → o seu email com papel admin/pastor/tesoureiro |
| Depois de apagar a chave antiga, tudo falha | Apagou a nova em vez da antiga? Pare e envie captura — não crie mais nada |

Guia técnico completo: `docs/FIX-LEITURA-BI.md` · Guia mínimo do Worker: `docs/INICIO-RAPIDO.md`
