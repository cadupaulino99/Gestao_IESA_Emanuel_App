import { describe, expect, it } from 'vitest';
import { validateBi, normalizeName, isSimilarName, findSimilarMembers, maxSeqFromCodes } from '../members';

describe('validateBi (formato angolano 9+2+3)', () => {
  it('aceita válidos e normaliza', () => {
    expect(validateBi('004578123LA040')).toEqual({ ok: true, normalized: '004578123LA040' });
    expect(validateBi('004 578 123 la 040').ok).toBe(true);
    expect(validateBi('004 578 123 la 040').normalized).toBe('004578123LA040');
  });
  it('vazio é permitido (campo opcional)', () => {
    expect(validateBi('').ok).toBe(true);
    expect(validateBi(null).ok).toBe(true);
  });
  it('rejeita formatos errados', () => {
    expect(validateBi('123').ok).toBe(false);
    expect(validateBi('00457812LA040').ok).toBe(false);
    expect(validateBi('004578123L0400').ok).toBe(false);
    expect(validateBi('ABCDEFGHIJK').ok).toBe(false);
  });
});

describe('semelhança de nomes', () => {
  it('normaliza acentos, maiúsculas e partículas', () => {
    expect(normalizeName('  João  da  Silva ')).toBe('joao silva');
  });
  it('iguais ou quase iguais', () => {
    expect(isSimilarName('João Silva', 'joao silva')).toBe(true);
    expect(isSimilarName('João Silva', 'Joao Silva ')).toBe(true);
    expect(isSimilarName('João Silva', 'João Silve')).toBe(true); // distância 1
  });
  it('diferentes', () => {
    expect(isSimilarName('João Silva', 'Maria Costa')).toBe(false);
    expect(isSimilarName('Ana Ngala', 'Ana Ngonga')).toBe(false);
  });
  it('findSimilarMembers exclui o próprio', () => {
    const ms = [{ id: 'a', name: 'João Silva' }, { id: 'b', name: 'Maria Costa' }] as any[];
    expect(findSimilarMembers('Joao Silva', ms, 'a').map((m) => m.id)).toEqual([]);
    expect(findSimilarMembers('Joao Silva', ms).map((m) => m.id)).toEqual(['a']);
  });
});

describe('maxSeqFromCodes (migração sem colisões)', () => {
  it('lê a maior sequência', () => {
    expect(maxSeqFromCodes([{ internalCode: 'M-0007' }, { internalCode: 'M-0042' }, {}] as any[])).toBe(42);
    expect(maxSeqFromCodes([] as any[])).toBe(0);
  });
});
