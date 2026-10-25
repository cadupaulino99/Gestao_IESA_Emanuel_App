import { describe, expect, it } from 'vitest';
import {
  normalizeEmail, passwordPolicyError, signupPayload, signupSchema, EMAIL_REGEX, PASSWORD_MIN,
} from '../memberSchema';

describe('normalizeEmail (unicidade)', () => {
  it('minúsculas e sem espaços', () => {
    expect(normalizeEmail('  Maria.Silva@Gmail.COM ')).toBe('maria.silva@gmail.com');
  });
  it('EMAIL_REGEX aceita válidos e recusa inválidos', () => {
    expect(EMAIL_REGEX.test('a@b.co')).toBe(true);
    expect(EMAIL_REGEX.test('sem-arroba.com')).toBe(false);
    expect(EMAIL_REGEX.test('a@b')).toBe(false);
  });
});

describe('passwordPolicyError (mínimo 8, também validado no Worker)', () => {
  it('curta → erro; 8+ → ok', () => {
    expect(passwordPolicyError('abc1234')).toMatch(/pelo menos 8/);
    expect(passwordPolicyError('abcd1234')).toBeNull();
    expect(PASSWORD_MIN).toBe(8);
  });
});

describe('signupSchema (mesmas regras do cadastro admin + conta)', () => {
  const base = { name: 'Maria Silva', email: 'MARIA@X.com ', password: 'abcd1234', passwordConfirm: 'abcd1234' };
  it('normaliza o email e aceita o mínimo', () => {
    const r = signupSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('maria@x.com');
  });
  it('recusa palavras-passe que não coincidem', () => {
    const r = signupSchema.safeParse({ ...base, passwordConfirm: 'outra1234' });
    expect(r.success).toBe(false);
  });
  it('recusa palavra-passe curta (mesma política do servidor)', () => {
    expect(signupSchema.safeParse({ ...base, password: 'x' }).success).toBe(false);
  });
  it('recusa telefone angolano inválido; aceita +244 9XXXXXXXX', () => {
    expect(signupSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, phone: '+244 923 000 000' }).success).toBe(true);
  });
  it('nome com <2 caracteres é recusado (regra do formulário admin)', () => {
    expect(signupSchema.safeParse({ ...base, name: 'X' }).success).toBe(false);
  });
});

describe('signupPayload (allowlist — nada extra viaja para o servidor)', () => {
  it('só campos de membro + email/password; phone normalizado', () => {
    const p = signupPayload({
      name: 'Maria Silva', email: 'maria@x.com', password: 'abcd1234', passwordConfirm: 'abcd1234',
      phone: '923000000', documentNumber: '123456789la012',
      hacker: 'DROP TABLE' as any, status: 'Activo' as any,
    } as any);
    expect(p.email).toBe('maria@x.com');
    expect(p.phone).toBe('+244923000000');
    expect('hacker' in p).toBe(false);     // fora da allowlist
    expect('status' in p).toBe(false);      // estado é controlado pelo sistema
    expect('passwordConfirm' in p).toBe(false);
  });
});
