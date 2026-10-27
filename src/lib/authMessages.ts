/* ═══════════════════════════════════════════════════════════════════════
   MENSAGENS DE AUTENTICAÇÃO (v1.14.7 — extraído do Login em App.tsx para
   ser testável). Princípios de segurança:
   • Credenciais erradas / email inexistente devolvem a MESMA mensagem
     genérica — nunca revelar se o email existe (anti-enumeração).
   • O reset de palavra-passe usa `isUnknownAccountError` para dar a mesma
     resposta informativa quer a conta exista quer não.
   ═══════════════════════════════════════════════════════════════════════ */

export function authErrorCode(e: unknown): string {
  return String((e as any)?.code || '');
}

/** Erro de login → mensagem humana (genérica onde a segurança o exige). */
export function friendlyAuthError(e: unknown): string {
  const code = authErrorCode(e);
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email')
    return 'Email ou palavra-passe incorretos.';
  if (code === 'auth/too-many-requests')
    return 'Demasiadas tentativas. Aguarde alguns minutos e tente novamente.';
  if (code === 'auth/user-disabled')
    return 'Esta conta foi desativada. Contacte o administrador.';
  if (code === 'auth/network-request-failed')
    return 'Sem ligação à internet. Verifique a rede e tente novamente.';
  if (code === 'auth/operation-not-allowed')
    return 'Este método de entrada não está ativo. Contacte o administrador.';
  if (code === 'auth/weak-password')
    return 'Palavra-passe demasiado fraca. Use pelo menos 8 caracteres.';
  return (e as any)?.message || 'Não foi possível iniciar sessão.';
}

/** Códigos que NÃO devem revelar se a conta existe (reset de palavra-passe). */
export function isUnknownAccountError(e: unknown): boolean {
  const code = authErrorCode(e);
  return code === 'auth/user-not-found' || code === 'auth/invalid-email';
}

/** Mensagem única do reset (anti-enumeração). */
export const RESET_MESSAGE =
  'Se existir uma conta com este email, enviámos um link de reposição. Verifique a caixa de entrada (e o spam).';
