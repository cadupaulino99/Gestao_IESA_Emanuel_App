import { describe, expect, it } from 'vitest';
import { matchesRequired } from '../confirm';

/* Regressão v1.12.3: «o botão de apagar gravações não funciona» — a palavra
   de confirmação exigia correspondência EXACTA e os teclados móveis produzem
   «Apagar»/«apagar»; o Confirmar nunca era ativado. */
describe('matchesRequired (palavra de confirmação)', () => {
  it('aceita a palavra exacta', () => {
    expect(matchesRequired('APAGAR', 'APAGAR')).toBe(true);
  });
  it('ignora maiúsculas/minúsculas (teclado móvel)', () => {
    expect(matchesRequired('apagar', 'APAGAR')).toBe(true);
    expect(matchesRequired('Apagar', 'APAGAR')).toBe(true);
    expect(matchesRequired('aPaGaR', 'APAGAR')).toBe(true);
  });
  it('ignora espaços em volta (paste/correcção automática)', () => {
    expect(matchesRequired('  APAGAR ', 'APAGAR')).toBe(true);
    expect(matchesRequired('\tapagar\n', 'APAGAR')).toBe(true);
  });
  it('recusa texto diferente ou incompleto', () => {
    expect(matchesRequired('', 'APAGAR')).toBe(false);
    expect(matchesRequired('APAGA', 'APAGAR')).toBe(false);
    expect(matchesRequired('APAGARR', 'APAGAR')).toBe(false);
    expect(matchesRequired('apagar!', 'APAGAR')).toBe(false);
  });
});
