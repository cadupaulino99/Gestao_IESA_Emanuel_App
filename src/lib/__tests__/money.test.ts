import { describe, expect, it } from 'vitest';
import { formatKz, parseKzInput, editValue, legacyToCents, MONEY_FORMAT } from '../money';

describe('formatKz (formato único, sem locale)', () => {
  it('1.500,00 Kz', () => {
    expect(formatKz(150000)).toBe('1.500,00 Kz');
    expect(formatKz(70000)).toBe('700,00 Kz');
    expect(formatKz(0)).toBe('0,00 Kz');
    expect(formatKz(5)).toBe('0,05 Kz');
    expect(formatKz(100000000000)).toBe('1.000.000.000,00 Kz');
  });
  it('nunca mostra AOA e o formato está num só sítio', () => {
    expect(formatKz(100)).not.toContain('AOA');
    expect(MONEY_FORMAT.suffix).toBe(' Kz');
  });
});

describe('parseKzInput (regras fixas, sem adivinhar)', () => {
  const c = (s: string) => (parseKzInput(s) as any).cents;
  it('converte os exemplos do utilizador', () => {
    expect(c('700')).toBe(70000);
    expect(c('700Kz')).toBe(70000);
    expect(c('700 Kz')).toBe(70000);
    expect(c('kz700')).toBe(70000);
    expect(c('KZ 700')).toBe(70000);
    expect(c('700,5')).toBe(70050);
    expect(c('700,50')).toBe(70050);
    expect(c('1.500')).toBe(150000);
    expect(c('1500,75')).toBe(150075);
    expect(c('AOA 700')).toBe(70000);
  });
  it('recusa com a mensagem certa e sem adivinhar', () => {
    expect(parseKzInput('1.50')).toMatchObject({ ok: false, error: 'Valor inválido. Exemplo: 1.500,00' });
    expect(parseKzInput('1,2,3').ok).toBe(false);
    expect(parseKzInput('-5').ok).toBe(false);
    expect(parseKzInput('abc').ok).toBe(false);
    expect(parseKzInput('').ok).toBe(false);
    expect(parseKzInput('9999999999999').ok).toBe(false); // acima do máximo
  });
  it('somas exactas em cêntimos', () => {
    expect(c('0,10') + c('0,20')).toBe(30);
    expect(formatKz(c('0,10') + c('0,20'))).toBe('0,30 Kz');
  });
});

describe('editValue / legacyToCents', () => {
  it('edição sem símbolo', () => {
    expect(editValue(70000)).toBe('700,00');
    expect(editValue(150075)).toBe('1500,75');
  });
  it('legados: floats Kz e strings; duvidosos → null', () => {
    expect(legacyToCents(550)).toBe(55000);
    expect(legacyToCents(550.5)).toBe(55050);
    expect(legacyToCents('700 Kz')).toBe(70000);
    expect(legacyToCents('7,7,7')).toBeNull();
    expect(legacyToCents(-3)).toBeNull();
  });
});
