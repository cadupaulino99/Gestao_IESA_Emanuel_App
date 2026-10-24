# Verificação v1.11.0 — orçamento, contribuições, notificações, mensagens

> Antes: APK v1.11.0 instalado; **Worker v2.5.0 publicado** (colar
> `worker/ai-worker.js` + `worker/providers.config.js`? — o editor da Cloudflare
> é um ficheiro só: cole o conteúdo de `ai-worker.js`; o `providers.config.js`
> fica embutido no deploy por wrangler. **Pela Via A (colar no editor), o import
> do providers falha** — por isso, para já, o cron e os adaptadores exigem deploy
> por `npm run deploy:worker` OU colar os dois ficheiros num Worker com wrangler.
> Se só tiver a Via A, diga-me: gero uma versão mono-ficheiro do Worker.)
> Cron: Workers → iesa-ai → Settings → Triggers → Add cron → `* * * * *`.
> Regras+índices: workflow *Deploy Firebase* (já corrido no merge).
> Admin → Gestão de Dados → criar configurações de notificações (backup primeiro).

## 1. Orçamento único de um membro
Membros → perfil → Cartão (ou Contribuições → Orçamento) → Definir 25000.
**Esperado:** linha «Orçamento único: 25.000 Kz (2026)» no cartão; sino do membro
com notificação; fila com mensagem pendente (10 min).

## 2. Valor em massa para 20 membros
Contribuições → Orçamento → pesquisar/filtrar «Sem valor» → selecionar 20 →
valor → «Definir para selecionados». **Esperado:** ecrã de confirmação com nº de
membros, valor e lista «actual → novo» dos que já tinham valor; escolha
manter/substituir; grava tudo ou nada.

## 3. Contribuição com pagamento parcial e conclusão
Contribuições → escolher membro → Nova (descrição, valor inteiro, prazo) →
Registar pagamento (metade) → **esperado:** «Em curso»; registar o resto →
**esperado:** estado «Concluída» com data, notificação ao membro, cartão atualizado.
Concluir manualmente exige motivo; reabrir exige motivo e só admin.

## 4. Janela de 10 minutos
Defina um orçamento → fila mostra «cancelável X min» → **Cancelar** → estados
`cancelled` e nada sai. Defina outro valor no mesmo membro/ref dentro da janela →
**esperado:** a mensagem pendente é **substituída** (mesmo id, corpo novo), não
cria segunda.

## 5. Lembretes em modo de teste
Definições → Notificações: ligue **Modo de teste** → o cron (1 min) gera lembrete
a cada tick para contribuições em curso; conclua uma → **param**; desligue o modo
de teste → volta a 1/dia máx (confirme com dois ticks no mesmo dia: só 1).
Às 8 semanas sem concluir: param + notificação ao super.

## 6. Sem número / não aceita
Membro sem telefone → fila mostra badge «sem número». Membro com
«Aceita mensagens» desmarcado → badge «não aceita mensagens»; notificação no
sistema continua a chegar (se tiver conta).

## 7. IA em massa sem dados reais
Contribuições → Mensagens → público «Contribuição em curso» → objectivo →
«Gerar modelos». **Esperado:** contagens por grupo + 3 exemplos preenchidos por
grupo; edite o texto; apague um marcador de propósito e envie → **bloqueia**
dizendo qual. Para ver o pedido enviado à IA: Suporte → Diagnóstico não o mostra;
use o browser devtools (Network → POST /assistant/bulk-templates) — o corpo leva
**apenas** `goal` e `groups[{id,label,count}]`, sem nomes/telefones/valores.

## 8. Não-admin por pedido directo
Com conta de pastor/tesoureiro (ou membro), chame directamente:
`POST /admin/...` não — o teste é Firestore: tente `setDoc(doc(db,'member_budgets','x_y'), …)`
no console → **esperado:** permission-denied (regras `isAdmin()`). Pela UI, a aba
mostra «Acesso negado».

## 9. Modo manual
Com `providers.config.js` em `manual` (defeito): fila com botões WhatsApp/SMS
(links abrem com a mensagem escrita) + «Marcar enviada»; «Repetir falhadas»
devolve falhadas à fila.
