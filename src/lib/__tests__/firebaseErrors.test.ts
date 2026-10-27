import { describe, expect, it } from 'vitest';
import { friendlyFirestoreMessage } from '../firebase';

/* v1.14.3 (auditoria): os erros do Firestore eram relançados como JSON e
   ninguém os via. O mapa código → mensagem é a parte pura do novo
   handleFirestoreError (o toast fica para a integração). */
describe('friendlyFirestoreMessage', () => {
  it('traduz os códigos comuns do Firestore', () => {
    expect(friendlyFirestoreMessage({ code: 'permission-denied' })).toMatch(/Sem permissão/);
    expect(friendlyFirestoreMessage({ code: 'unavailable' })).toMatch(/Sem ligação/);
    expect(friendlyFirestoreMessage({ code: 'unauthenticated' })).toMatch(/Sessão terminada/);
    expect(friendlyFirestoreMessage({ code: 'not-found' })).toMatch(/não encontrado/i);
  });
  it('aceita códigos com o prefixo firebase/firestore/', () => {
    expect(friendlyFirestoreMessage({ code: 'firebase/firestore/permission-denied' })).toMatch(/Sem permissão/);
  });
  it('usa a mensagem do erro quando o código é desconhecido', () => {
    expect(friendlyFirestoreMessage(new Error('boom específico'))).toBe('boom específico');
    expect(friendlyFirestoreMessage({ code: 'weird', message: 'detalhe' })).toBe('detalhe');
  });
  it('nunca devolve vazio', () => {
    expect(friendlyFirestoreMessage(null).length).toBeGreaterThan(5);
    expect(friendlyFirestoreMessage(undefined).length).toBeGreaterThan(5);
  });
});
