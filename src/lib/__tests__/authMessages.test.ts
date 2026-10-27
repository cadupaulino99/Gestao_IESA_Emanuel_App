import { describe, expect, it } from 'vitest';
import { friendlyAuthError, isUnknownAccountError, RESET_MESSAGE } from '../authMessages';

describe('friendlyAuthError (mensagens de login — anti-enumeração)', () => {
  it('email inexistente e palavra-passe errada dão a MESMA mensagem', () => {
    const a = friendlyAuthError({ code: 'auth/user-not-found' });
    const b = friendlyAuthError({ code: 'auth/wrong-password' });
    const c = friendlyAuthError({ code: 'auth/invalid-credential' });
    expect(a).toBe('Email ou palavra-passe incorretos.');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
  it('conta desativada diz como resolver (v1.14.1)', () => {
    expect(friendlyAuthError({ code: 'auth/user-disabled' })).toMatch(/desativada.*administrador/i);
  });
  it('demasiadas tentativas e rede têm mensagens próprias', () => {
    expect(friendlyAuthError({ code: 'auth/too-many-requests' })).toMatch(/Demasiadas tentativas/);
    expect(friendlyAuthError({ code: 'auth/network-request-failed' })).toMatch(/Sem ligação/);
  });
  it('erro desconhecido: usa a mensagem ou um genérico', () => {
    expect(friendlyAuthError(new Error('algo estranho'))).toBe('algo estranho');
    expect(friendlyAuthError(null)).toMatch(/Não foi possível/);
  });
});

describe('isUnknownAccountError + RESET_MESSAGE (reset não revela contas)', () => {
  it('user-not-found/invalid-email → mesma resposta informativa', () => {
    expect(isUnknownAccountError({ code: 'auth/user-not-found' })).toBe(true);
    expect(isUnknownAccountError({ code: 'auth/invalid-email' })).toBe(true);
    expect(isUnknownAccountError({ code: 'auth/too-many-requests' })).toBe(false);
  });
  it('a mensagem do reset é condicional («Se existir…»)', () => {
    expect(RESET_MESSAGE).toMatch(/^Se existir uma conta/);
  });
});
