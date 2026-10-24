/* ─────────────────────────────────────────────────────────────────────────────
   CONFIGURAÇÃO DE FORNECEDORES DE CANAIS (v1.11.0)
   ─────────────────────────────────────────────────────────────────────────────
   'manual'  → a fila mostra botões wa.me / sms: pré-preenchidos e o operador
               marca como enviada. SEMPRE funcional, sem contas nem custos.
   Depois de criar contas e aprovar modelos, troque aqui o fornecedor e acrescente
   as chaves como SEGREDOS do Worker (nunca neste ficheiro):
     sms:       'infobip' | 'twilio' | 'manual'      (chaves: SMS_API_KEY, SMS_SENDER_ID)
     whatsapp:  'meta'    | 'manual'                  (chaves: WA_TOKEN, WA_PHONE_ID)
   Os adaptadores vivem em ai-worker.js (sendSms/sendWhatsApp).
   ───────────────────────────────────────────────────────────────────────────── */
export const PROVIDERS = {
  system: 'internal',   // notificações dentro da app: sempre ligadas
  sms: 'manual',
  whatsapp: 'manual',
};
