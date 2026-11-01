# Verificação v1.19.0 — datas de Luanda, Worker 2.10.0, regras, testes

> **Antes de começar**, por esta ordem:
> 1. **Regras**: GitHub → Actions → **«Deploy Firebase»** → *Run workflow*
>    (leva o `firestore.rules` novo). Espere ficar verde.
> 2. **Worker 2.10.0**: Actions → **«deploy-ai-worker»** *ou* Cloudflare →
>    Workers & Pages → `iesa-ai` → *Edit code* → apagar tudo → colar
>    `worker/ai-worker.js` → **Save and Deploy**.
>    Confirme em `https://iesa-ai.cadupaulino99.workers.dev/__health`:
>    `"version": "2.10.0"`.
> 3. **APK v1.19.0**: sai sozinho no push ao `main` (Release com
>    `app-release.apk`). Instale-o no telemóvel.
> 4. **Não há migrações de dados** nesta versão. Faça na mesma uma cópia de
>    segurança (Admin → Gestão de Dados → Backup) antes de começar.
>
> Regra de ouro de sempre: cada passo tem um **«Esperado»**. Se aparecer outra
> coisa, pare nesse passo e envie a captura — não continue «para ver se passa».

---

## 1. Diagnóstico da IA (o passo que confirma o Worker novo)

App → **Suporte → Diagnóstico/Testar ligação**.

**Esperado**, por esta ordem:

- `✓ Servidor de IA online — versão 2.10.0 (build 2026-10-31 …).`
- `✓ Leitura de documentos (visão) disponível.`
- `✓ Cron vivo (fila SMS, lembretes, estados) — última execução há X min, v2.10.0.`
- **`✓ As tarefas do cron terminaram sem erros (fila, contribuições, lembretes, eventos).`** ← linha NOVA
- `· Última execução: fila 0 · contribuições 0 · lembretes 0 · eventos 0.` ← linha NOVA
- `✓ Segredo GEMINI_API_KEY presente.` / `✓ Segredo FIREBASE_SA_JSON presente.`

**Se aparecer** `✗ O cron está a correr, mas uma tarefa falha: <nome>: <erro>`:
não é um problema novo — é um problema antigo que **agora se vê** (antes uma
tarefa partida rebentava com as outras três e só aparecia «Cron SEM pulsar»).
Envie a linha inteira; ela diz exactamente qual tarefa e qual erro.

**Se aparecer** `⚠ Sem heartbeat do cron`: o Worker no ar é antigo (publique o
2.10.0) ou o Trigger `* * * * *` não está configurado.

---

## 2. «Hoje» é hoje (o bug das 00:00–01:00)

Este é o teste que prova a mudança de fundo. Faça-o **de preferência perto da
meia-noite**, ou mude temporariamente o fuso do telemóvel.

1. Definições do telemóvel → Data e hora → desligar «automático» → fuso
   **GMT-03:00 (Brasília)** e hora **23:30 do dia de ontem**.
2. Abra a app → **Finanças → Nova despesa** (ou Contribuições → Nova).
3. Olhe para o campo **Data/Referência**.

**Esperado:** a data de **hoje em Luanda** — não a de ontem, não a do fuso que
definiu. (Antes desta versão aparecia o dia do aparelho/UTC.)

4. Repita em **Contribuições → Nova contribuição → Prazo** e em
   **Membros → cartão → Donativo/Renovação**.
5. Volte a pôr a data/hora em automático. **Não mexer:** não grave nenhum destes
   registos de teste — feche as janelas.

---

## 3. Painel → «Dizimistas do Mês» (estava sempre vazio)

**Painel/Dashboard → separador do mês → cartão «Dizimistas do Mês (Género)».**

**Esperado:** se houve dízimos lançados **este mês**, a pizza mostra
Homens/Mulheres com números — antes mostrava sempre «Sem dados suficientes»,
mesmo com lançamentos, porque a consulta comparava o mês como número (`10`) com
o valor guardado como texto (`'10'`).

Confirmação cruzada: **Finanças → Dízimos**, filtre o mês corrente — o número de
pessoas distintas deve bater certo com a pizza.

---

## 4. Aniversariantes (lista e notificação local)

1. **Painel → separador «Aniversariantes»**.
   **Esperado:** título «Aniversariantes do Mês (Novembro)» com o mês **certo**;
   lista ordenada por dia; os de hoje com o selo laranja **«Hoje!»**.
2. Escolha um membro cujo aniversário seja **amanhã** e, na ficha dele, corrija a
   data de nascimento para **hoje** (guarde). Volte ao Painel.
   **Esperado:** aparece na lista com «Hoje!». (Desfaça a alteração depois.)
3. Um membro com data de nascimento no formato antigo `25/10/1990` (se existir):
   **Esperado:** aparece na lista — antes desaparecia, porque o código só lia o
   formato `AAAA-MM-DD`.

---

## 5. Importar membros do Excel (as datas recuavam 1 dia)

**Membros → Importar Excel** com um ficheiro em que a coluna «Nascimento» seja
**data do Excel** (não texto) — ex.: `01/01/2000`.

**Esperado:** na ficha do membro importado, Nascimento = **01/01/2000**.
Antes desta versão ficava **31/12/1999** (sempre menos um dia).

Se não quiser importar nada a sério: faça a importação, confira a data, e apague
o membro de teste (fica na Lixeira).

---

## 6. Portal do Membro → «Pedir atualização» (buraco fechado)

1. Entre com uma **conta de membro** (não de liderança) → Portal →
   **Pedir atualização** → mude o telefone → **Enviar**.
   **Esperado:** «Pedido de atualização enviado com sucesso!»; em
   **«Os meus pedidos»** aparece como *pendente*.
2. Na liderança → **Admin → Pedidos** → o pedido está lá, **Aprovar**.
   **Esperado:** o telefone do membro fica actualizado e o membro recebe a
   notificação «Pedido de atualização aprovado».
3. *(Só se quiser confirmar a segurança, e com alguém de confiança)*: com uma
   conta de membro, tente criar um pedido sobre a ficha de **outro** membro.
   **Esperado:** **recusado** pelo servidor («Sem permissão para esta operação»).
   Antes desta versão era aceite — qualquer sessão, incluindo um cadastro
   rejeitado, podia abrir pedidos em nome de outra pessoa.

---

## 7. Auto-cadastro recusa datas impossíveis

Ecrã de **Cadastro** (fora da app) → preencha e, em **Data de nascimento**,
force um valor impossível se o campo o permitir (ou peça a alguém para tentar
`1990-13-45` via formulário).

**Esperado:** `Data inválida: birthDate (use AAAA-MM-DD, com dia e mês reais).`
Antes o servidor aceitava mês 13 e dia 45.

Confirme também o que **não** mudou: um cadastro válido continua a criar o
pedido e a mostrar o ecrã «à espera de aprovação».

---

## 8. Conta de liderança: palavra-passe temporária com política

**Admin → Utilizadores → Gerar nova palavra-passe temporária** para uma conta de
teste; na caixa de palavra-passe (se a deixar escolher), experimente:

| Escrever | Esperado |
|---|---|
| `123456` | recusada: «precisa de 8 a 200 caracteres» |
| `Iesa 2026` | recusada: «não pode conter espaços» |
| `password` | recusada: «demasiado óbvia» |
| `so-letras-aqui` | recusada: «deve misturar letras e números» |
| (deixar vazio) | aceite — o servidor gera uma de 12 caracteres, **sempre** com letras e números |

**Esperado:** a gerada automaticamente entra sempre (antes, ~10% das geradas
saíam só com letras e dariam erro ao entrar). **Não mexer:** não faça reset à
sua própria conta de super administrador — o servidor recusa de propósito.

---

## 9. Quota do Firestore (a correcção invisível mas mais importante)

Não há nada para carregar: confirme só que o sistema deixa de queimar escritas.

1. Firebase Console → **Firestore → Usage** → gráfico **Documents written**.
2. Compare o dia de hoje com um dia da semana passada.

**Esperado:** a linha base (sem ninguém a usar a app) desce muito — o cron
deixou de reescrever `paidAmount` em todas as contribuições abertas a cada
minuto (eram ~20 escritas/minuto = **28.800/dia**, acima do limite de 20.000 do
plano gratuito). Se quiser ver o efeito depressa: anote o número de escritas,
espere 10 minutos sem tocar na app, e confirme que subiu apenas umas dezenas
(heartbeat + fila), não milhares.

---

## 10. Contribuições: estados continuam certos

**Contribuições** → escolha uma contribuição **Em curso** com prazo **ontem**.

**Esperado:** passa a **«Em atraso»** no prazo de **5 minutos** (o recálculo
automático passou de 1 em 1 minuto para 5 em 5 minutos, para poupar quota).
Registe um pagamento que complete o valor → **Esperado:** passa **imediatamente**
a «Concluída» (isso é feito pela app, não pelo cron), com notificação ao membro.

---

## 11. Avisos e Eventos continuam a publicar

**Admin → Avisos** → publicar um aviso com data «visível até» e **Eventos** →
marcar um evento para amanhã com «lembrar 1 dia antes».

**Esperado:** ambos publicam sem erros e aparecem no **Portal do Membro**.
(As regras passaram a exigir mês `01-12` e dia `01-31` nas datas; um evento com
data inválida seria recusado com «Sem permissão para esta operação».)

---

## 12. Rádio Maranata (nome das gravações)

**Rádio → gravar** (30 segundos chegam) → parar.

**Esperado:** o ficheiro chama-se `Maranata_AAAA-MM-DD_HHhMM.aac` com a **data e
hora de Luanda**. Se gravar mesmo depois da meia-noite, o nome já é do dia novo.

---

## Se algo correr mal

| Sintoma | Primeiro gesto |
|---|---|
| Diagnóstico diz «versão 2.9.1» | O Worker não foi publicado — repita o passo 2 do topo |
| «✗ O cron está a correr, mas uma tarefa falha» | Envie a linha completa; as outras tarefas continuam a funcionar |
| Um formulário recusa guardar com «Sem permissão» | Capture o ecrã e o que estava a preencher — pode ser um validador novo a apanhar dados que já estavam mal |
| Pedido de atualização de um membro falha | Confirme que a ficha do membro tem **o mesmo email** da conta dele (Admin → ficha → Email); sem isso o servidor não sabe que o pedido é dele |
| Pizza «Dizimistas» continua vazia | Confirme que existem dízimos com **mês de referência/entrega = mês corrente** (Finanças → Dízimos) |

**Documentos desta versão:** `docs/AUDITORIA-2026-10-31.md` (o que se encontrou
e porquê) · `docs/MUDANCAS.md` → v1.19.0 (o que mudou, ponto por ponto).
