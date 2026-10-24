# Verificação — v1.12.0 Moeda única «Kz» + campos de valor

## O que mudou (resumo)
- **135 sítios** em 22 ficheiros formatarem dinheiro, cada um à sua maneira
  (49× `Intl.NumberFormat(...AOA)`, 13× `toLocaleString`, 24× «Kz» fixo,
  2× `toFixed`, + formatadores próprios no Worker e no PDF). Essa era a causa
  da mistura AOA/Kz.
- Agora há **uma única função**: `formatKz()` em `src/lib/money.ts`.
  O formato está configurado **num só sítio**: constante `MONEY_FORMAT`
  no mesmo ficheiro (milhar `.`, decimal `,`, 2 casas, sufixo ` Kz`).
  Não depende do idioma do navegador/telemóvel.
- **Armazenamento escolhido: inteiros de cêntimos** (700,00 Kz = 70000).
  Porquê: somas exactas (0,10 + 0,20 = 0,30 sem erro de vírgula flutuante),
  tipo `int` no Firestore, e as regras do servidor passam a exigir `int`
  (validação repetida no servidor, não só no ecrã).
- Campos de valor: texto com `inputMode="decimal"`, **formatam ao sair**
  (não a cada tecla), mostram o valor sem «Kz» durante a edição, mantêm o
  texto e mostram a mensagem junto ao campo quando recusam.
- Excel: a célula guarda **número** com formato `#,##0.00 "Kz"` (dá para somar).
- Orçamento único e contribuições: agora aceitam **duas casas decimais**
  (a regra «só inteiros» foi removida).
- «AOA» desapareceu do ecrã. Só existe internamente (código de moeda no
  pedido à IA de leitura de recibos), como autorizado.

## Antes de tudo
1. **Cópias de segurança** (Admin → botão de backup) — obrigatório.
2. Correr a **Migração v1.12.0 — dinheiro em cêntimos** (Admin → Dados):
   1. «1. Analisar valores guardados» → veja a lista; os valores duvidosos
      aparecem em amarelo e **não são tocados** (decida-os à mão).
   2. Marque «Fiz a cópia de segurança» → «2. Aplicar conversão para cêntimos»
      → confirme com MIGRAR.
   3. A migração é idempotente: fica o marcador `settings/system.moneyCents=2`;
      correr outra vez não duplica nada.
3. Actualizar a app em todos os aparelhos (os ecrãs passam a ler cêntimos;
   app antiga + dados novos = valores errados).

## Guião de testes
### 1) Entradas aceites (escrever, sair do campo, ver o resultado)
| Escreve | Deve ficar |
|---|---|
| 700 | 700,00 |
| 700Kz / 700 Kz / kz700 / KZ 700 | 700,00 |
| 700,5 | 700,50 |
| 700,50 | 700,50 |
| 1.500 | 1.500,00 |
| 1500,75 | 1.500,75 |
| AOA 700 | 700,00 |

Testar em: Finanças (dízimo, oferta, despesa, divisão manual),
Contribuições (orçamento em massa, orçamento individual, contribuição,
pagamento), Fundo de Construção, Activos (valor de aquisição),
Cartão do membro (donativo voluntário), Orçamento anual (previsões).

### 2) Entradas recusadas (mensagem junto ao campo, texto preservado)
- `1.50` → «Valor inválido. Exemplo: 1.500,00»
- `1,2,3` → idem
- `-5` → «Valores negativos não são aceites.»
- `abc` → «Valor inválido. Exemplo: 1.500,00»
- campo vazio (obrigatório) → «Campo obrigatório.»
- valor acima de 1.000.000.000,00 Kz → «Máximo: 1.000.000.000,00 Kz.»

### 3) Só aparece «Kz»
Abrir e confirmar: cartão do membro (frente/verso + PDF), listas de
Finanças, Relatórios (PDF anual + Excel), Dashboard, Orçamento, Fundo de
Construção, Activos, Portal do Membro (gráficos e extrato PDF), sino de
notificações, fila de mensagens (pré-visualização com `{valor}`).
Procurar a palavra «AOA»: não deve aparecer em lado nenhum visível.

### 4) Soma exacta
Criar contribuição de 1.000,00 Kz → pagar 0,10 Kz → pagar 0,20 Kz →
o cartão da contribuição deve mostrar **0,30 Kz** pagos (e não 0,30000000000000004).

### 5) Telemóvel — cursor
Abrir um valor já formatado, tocar no meio do número e corrigir um dígito:
o cursor não deve saltar (a formatação só acontece ao sair do campo).

### 6) Servidor repete a validação
Com a app aberta, gravar «AOA 700» num dízimo → deve ficar 700,00 Kz.
(O servidor exige `int` em cêntimos; um valor mal formado é rejeitado
pelas regras Firestore, não apenas pelo ecrã.)

## Nota sobre o teclado no Android (importante)
`inputMode="decimal"` abre o teclado numérico, mas **a tecla decimal depende
do idioma do teclado**: em português mostra **vírgula** ✅; num teclado
configurado em inglês mostra **ponto** ❌ (e um ponto isolado seria recusado
pela regra «ponto só seguido de 3 dígitos»). Não inventei regra nova:
se no seu telemóvel o teclado abrir com ponto em vez de vírgula, diga-me
qual é o idioma do teclado e decidimos juntos (opções: aceitar ponto como
decimal só quando não houver ambiguidade, ou pedir para mudar o idioma do
teclado). Até lá, a regra é exactamente a que definiu.
