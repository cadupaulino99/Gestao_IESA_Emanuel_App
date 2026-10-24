/**
 * Palavra de confirmação (dialogs destrutivos do tipo «escreva APAGAR»).
 * Módulo PURO (sem React) para ser testável em node — ver __tests__/confirm.test.ts.
 *
 * Bug corrigido (v1.12.3): a comparação era EXACTA (`input !== required`).
 * Nos teclados dos telemóveis a primeira letra sai frequentemente
 * capitalizada («Apagar») e o utilizador escreve muitas vezes em minúsculas
 * («apagar») — o botão «Confirmar» nunca era ativado e parecia que
 * «o botão de apagar não funciona». Ignora-se agora caixa e espaços.
 */
export function matchesRequired(input: string, required: string): boolean {
  return String(input ?? '').trim().toUpperCase() === String(required ?? '').trim().toUpperCase();
}
