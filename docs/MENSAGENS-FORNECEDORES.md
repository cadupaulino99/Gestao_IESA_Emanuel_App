# Fornecedores de SMS / WhatsApp — proposta e textos de modelo

Estado actual (v1.11.0): **modo manual** nos dois canais. A fila mostra, por
mensagem, botões `wa.me` e `sms:` com o texto já preenchido + «marcar como enviada».
As notificações **dentro do sistema funcionam sempre**, sem fornecedor.

## SMS (cobertura Angola)

| Fornecedor | Cobertura AO | Custo aprox./SMS | O que precisa |
|---|---|---|---|
| **Infobip** (recomendado) | Directa a Unitel/Movicel/Africell | €0,02–0,06 *(a confirmar)* | Conta, saldo, sender ID registado |
| Twilio | Suporta AO *(a confirmar)* | €0,04–0,08 *(a confirmar)* | Conta, número/sender |
| Africa's Talking | Foco africano; AO *(a confirmar)* | €0,01–0,04 *(a confirmar)* | Conta |

Para ligar: `worker/providers.config.js` → `sms: 'infobip'` + segredos
`SMS_API_KEY`, `SMS_SENDER_ID` no Worker. O adaptador já está escrito.

## WhatsApp (API oficial)

**Meta WhatsApp Cloud API** (directa, sem intermediário):
- precisa de: conta Meta Business verificada, **número dedicado** (não pode ser o
  pessoal), e **modelos aprovados** para mensagens iniciadas pela igreja;
- custo: por mensagem entregue, por categoria (utilidade/marketing), Angola
  ≈ €0,01–0,04 *(a confirmar na tabela Meta em vigor)*;
- alternativas BSP (Twilio/360dialog/Gupshup) acrescentam mensalidade/markup.

Para ligar: `providers.config.js` → `whatsapp: 'meta'` + segredos `WA_TOKEN`,
`WA_PHONE_ID`. O adaptador já está escrito.

## Modelos de WhatsApp prontos a submeter (com variáveis)

1. **orcamento_definido** (utilidade)
   `Paz, {{1}}. O seu orçamento único da IESA Emanuel-Xangongo para {{2}} foi definido em {{3}}. Sem prazo fixo — cada oferta conta. Obrigado!`
2. **contribuicao_definida** (utilidade)
   `Paz, {{1}}. Foi registada a contribuição «{{2}}» no valor de {{3}}, com prazo {{4}}. Qualquer dúvida, fale com a tesouraria.`
3. **lembrete_suave** (utilidade)
   `Paz, {{1}}. Lembrete amável: a contribuição «{{2}}» tem prazo {{3}} e valor em falta de {{4}}. Se já entregou, desconsidere — e obrigado pela fidelidade.`
4. **contribuicao_concluida** (utilidade)
   `Paz, {{1}}. A contribuição «{{2}}» foi concluída em {{3}}. A igreja agradece a sua fidelidade. Mal. 3:10`

## Regras que o sistema garante (com ou sem fornecedor)

- máx. **1 mensagem/dia/membro**, somando canais e campanhas;
- lembretes só em sistema por defeito; externos exigem switch + tecto semanal;
- param ao concluir; param às `MAX_SEMANAS_LEMBRETE` semanas + aviso ao admin;
- janela de **10 min** para cancelar/substituir após definir/alterar valores;
- membro com «Aceita mensagens» = não → só notificações no sistema;
- número duplicado entre membros → aviso antes de enviar.
