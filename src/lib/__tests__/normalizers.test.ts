import { describe, expect, it } from 'vitest';
import {
  normalizeDate,
  normalizeGender,
  normalizePhone,
  normalizeDocumentNumber,
  normalizeMemberFields,
} from '../ai';

describe('normalizeDate (o BI escreve DD/MM/AAAA; o <input type="date"> exige AAAA-MM-DD)', () => {
  it('converte o formato angolano', () => {
    expect(normalizeDate('07/03/1990')).toBe('1990-03-07');
    expect(normalizeDate('7/3/1990')).toBe('1990-03-07');
    expect(normalizeDate('07-03-1990')).toBe('1990-03-07');
  });
  it('aceita ISO e ISO com barras', () => {
    expect(normalizeDate('1990-03-07')).toBe('1990-03-07');
    expect(normalizeDate('1990/03/07')).toBe('1990-03-07');
  });
  it('aceita AAAAMMDD e ano isolado', () => {
    expect(normalizeDate('19900307')).toBe('1990-03-07');
    expect(normalizeDate('1990')).toBe('1990-01-01');
  });
  it('aceita meses por extenso em português', () => {
    expect(normalizeDate('7 de Março de 1990')).toBe('1990-03-07');
    expect(normalizeDate('25 dezembro 1983')).toBe('1983-12-25');
  });
  it('devolve null para lixo', () => {
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate('99/99/9999')).toBeNull();
  });
});

describe('normalizeGender (o BI devolve M/F; o <Select> exige Masculino/Feminino)', () => {
  it('mapeia siglas e palavras', () => {
    expect(normalizeGender('M')).toBe('Masculino');
    expect(normalizeGender('f')).toBe('Feminino');
    expect(normalizeGender('Masculino')).toBe('Masculino');
    expect(normalizeGender('mulher')).toBe('Feminino');
    expect(normalizeGender('homem')).toBe('Masculino');
  });
  it('desconhecido → Outro; vazio → null', () => {
    expect(normalizeGender('x')).toBe('Outro');
    expect(normalizeGender(null)).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('produz +244XXXXXXXXX', () => {
    expect(normalizePhone('923 000 000')).toBe('+244923000000');
    expect(normalizePhone('244923000000')).toBe('+244923000000');
    expect(normalizePhone('+244 923 000 000')).toBe('+244923000000');
  });
});

describe('normalizeDocumentNumber (OCR → valor canónico)', () => {
  it('maiúsculas, sem separadores, mantém letras', () => {
    expect(normalizeDocumentNumber('004 578 123 la 040')).toBe('004578123LA040');
    expect(normalizeDocumentNumber('004578123LA040')).toBe('004578123LA040');
    expect(normalizeDocumentNumber('123456789-la-012')).toBe('123456789LA012');
  });
  it('limita a 14 e devolve null para vazio', () => {
    expect(normalizeDocumentNumber('123456789LA0129999')).toBe('123456789LA012');
    expect(normalizeDocumentNumber('   ')).toBeNull();
  });
});

describe('normalizeMemberFields (fluxo completo do OCR)', () => {
  it('normaliza tudo o que o Gemini devolve do BI', () => {
    const out = normalizeMemberFields({
      name: '  MANUEL   KAPENDE ',
      documentNumber: '004578123LA040',
      birthDate: '07/03/1990',
      issueDate: '15/06/2021',
      gender: 'M',
      phone: '923 000 000',
      address: 'Xangongo',
    });
    expect(out).toEqual({
      name: 'MANUEL KAPENDE',
      documentNumber: '004578123LA040',
      birthDate: '1990-03-07',
      issueDate: '2021-06-15',
      gender: 'Masculino',
      phone: '+244923000000',
      address: 'Xangongo',
    });
  });
  it('campos null desaparecem (o formulário ignora-os)', () => {
    expect(normalizeMemberFields({ name: 'Ana', birthDate: null, gender: null })).toEqual({ name: 'Ana' });
  });
});
