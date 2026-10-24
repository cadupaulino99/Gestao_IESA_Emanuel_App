# Verificação da v1.9.3 — dízimos com duas datas, duplicidades, membros

> Pré-requisito: **Admin → Gestão de Dados → Migração v1.9.3** — descarregue a
> cópia de segurança (botão 1), marque «Fiz a cópia» e execute (botão 2).
> Idempotente: pode repetir sem estragar nada.

## 1. As duas datas

**Exemplo A — Janeiro entregue em Fevereiro**
1. Finanças → mês operativo **Fevereiro** → Registar Entrada.
2. Mês/Ano de **Entrega**: Fevereiro; Meses de **Referência**: marcar só **Jan**.
3. Guardar.
4. Esperado:
   - Finanças em **Fevereiro** mostra o lançamento; em **Janeiro** não;
   - Dashboard/Relatórios/Obrigações de Fevereiro incluem o valor;
   - Cartão do membro (Membros → perfil → Cartão) mostra o valor em **Janeiro**;
   - Portal do membro (gráfico e cartão) em **Janeiro**.

**Exemplo B — Março pago adiantado em Fevereiro**
1. Igual, mas referência = **Mar**, entrega = **Fevereiro**.
2. Esperado: contabilidade em Fevereiro; cartão em Março.

**Vários meses numa entrega**
1. Referência: marcar **Mar** e **Abr**, valor 10 000.
2. Esperado: confirmação da divisão (5 000 + 5 000, ou divisão manual);
   dois lançamentos com a **mesma entrega** e recibo-base `REC-…-1` / `-2`;
   cartão mostra 5 000 em Mar e 5 000 em Abr; contabilidade soma 10 000 no mês de entrega.

## 2. Duplicidade

1. Repita o Example A exactamente (mesmo membro, ref Jan, mesmo valor, entrega Fev).
   → **Esperado: bloqueio** com toast «Registo BLOQUEADO: já existe lançamento exatamente igual (…)».
2. Repita com valor diferente (prestação).
   → **Esperado: aviso** com os dados do lançamento anterior (ref, entrega, valor, recibo)
   e pedido de confirmação explícita («CONFIRMAR»); só grava se confirmar.
3. Mês de referência diferente → grava sem avisos.

## 3. Membros

1. **BI inválido**: Novo membro → BI `123` → Guardar → **esperado:** erro de formato
   (9 dígitos + 2 letras + 3 dígitos).
2. **BI duplicado**: crie com um BI válido; crie outro membro com o mesmo BI →
   **esperado:** bloqueio «B.I. já cadastrado em …».
3. **Sem BI**: crie membro sem BI → **esperado:** recebe ID interno `M-00XX`;
   o cartão mostra «Identificação provisória (ID interno)»; mais tarde, edite e
   preencha só o BI → nada se perde (tudo liga pelo ID do documento).
4. **Nome parecido**: com «João Silva» criado, tente criar «Joao Silva » →
   **esperado:** aviso com o registo parecido antes de confirmar.
5. **Fusão**: perfil de um duplicado → «Fundir duplicado…» → escolha o destino →
   confirmar → **esperado:** dízimos/donativos/comunhões/renovações passam para o
   destino; origem some da lista e fica na **Lixeira** (Admin) para restaurar se preciso.

## 4. Legado (pré-migração)

- Dízimos antigos (meses em nome, sem deliveryMonth): após a migração ficam com
  entrega = antigo mês de caixa e referência = antigo mês de referência;
  contabilidade e cartão continuam coerentes com o que se via antes.
