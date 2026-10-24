# Verificação da rolagem (v1.9.4) — computador e telemóvel (~360 px)

**Regra única aplicada:** cada aba tem **uma só** barra de rolagem vertical — a da
página (o scroller de conteúdo do Layout; no Portal do Membro, a do corpo).
Nenhuma lista ou cartão dentro de uma aba tem altura fixa ou scroller próprio.
As tabelas largas têm rolagem horizontal própria e o cabeçalho fica fixo ao
rolar na vertical. Diálogos/sheets mantêm o scroll interno (sobreposições, não abas).

## Como testar (2 minutos por aba)

No computador: janela a **1024×700**. No telemóvel: ecrã real (~360 px) ou, no
computador, F12 → modo dispositivo → largura **360 px**.
Em cada aba: role **até ao fim** e confirme que vê o **último item por inteiro**
(sem nada cortado em baixo); role ao topo e confirme que nada fica debaixo do
cabeçalho; em tabelas, arraste para o lado e confirme que todas as colunas
aparecem; confirme que há **apenas uma** barra de rolagem vertical visível.

| # | Aba | Exemplo cheio | Último elemento que tem de ficar visível |
|---|---|---|---|
| 1 | Início | muitos aniversariantes/atividade | último cartão da lista de atividade |
| 2 | Membros | **100 membros** (lista + «Carregar Mais») | última linha/página da tabela e botões de ação; a 360 px, cartões + paginação |
| 3 | Membros → Dízimos por Membro | membro com 12 meses | última linha da tabela do membro |
| 4 | Membros → Comunhão | grelha de 12 meses | grelha + legenda por inteiro |
| 5 | Finanças | mês com 50+ lançamentos | última linha da tabela + total; recorte horizontal das colunas Valor/Recibo |
| 6 | Obrigações | ano com 12 meses | tabela final |
| 7 | Fundo de Construção | histórico longo | **último item do histórico** (antes ficava cortado aos 300 px) |
| 8 | Património | 20+ bens | última linha |
| 9 | Orçamento | 12 linhas + categorias | última linha |
| 10 | Relatórios | ano cheio | fim do relatório + botões de exportação |
| 11 | Rádio | biblioteca com 15+ gravações | **última gravação da lista** (antes: 340 px sem barra visível) |
| 12 | Suporte → Assistente IA | conversa com 30 mensagens | campo de escrita **sempre visível** no fim; a conversa rola na página |
| 13 | Suporte → Equipa / Diagnóstico | histórico longo | campo de escrita / painel de diagnóstico |
| 14 | Definições | — | último cartão (Diagnóstico do Ambiente) |
| 15 | Administração → cada sub-aba | lixeira com 30+ itens; auditoria longa | última linha das tabelas (antes: tampas de 500 px) |
| 16 | Portal do Membro (conta de membro) | 12+ meses de dízimos | fim do extrato e do cartão |

## Critérios de aceitação

- [ ] Uma só barra vertical por aba (a da página).
- [ ] Nada cortado em cima: ao rolar ao topo, o primeiro elemento fica inteiro.
- [ ] Nada cortado em baixo: o último elemento fica inteiro, incluindo com a
      barra de navegação inferior móvel visível.
- [ ] Nada cortado ao lado a 360 px: tabelas deslizam na horizontal dentro do
      próprio wrapper; o resto da página não salta para os lados.
- [ ] Cabeçalho das tabelas visível durante o scroll vertical (fica preso ao topo).
- [ ] Aspeto e conteúdo idênticos ao anterior — só o comportamento de rolagem mudou.
