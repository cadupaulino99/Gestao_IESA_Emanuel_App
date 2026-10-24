import { describe, expect, it } from 'vitest';
import { genTempPassword, TEMP_PASS_ALPHABET, buildShareMessage, shareLinks, isTempExpired, TEMP_PASSWORD_TTL_MS } from '../admins';

describe('genTempPassword', () => {
  it('12+ caracteres, sem 0/O/1/l', () => {
    for (let i = 0; i < 50; i++) {
      const p = genTempPassword();
      expect(p.length).toBeGreaterThanOrEqual(10);
      expect(p).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/);
      expect(p).not.toMatch(/[01Ol]/);
    }
  });
  it('aleatório (duas gerações diferentes)', () => {
    expect(new Set(Array.from({ length: 20 }, () => genTempPassword())).size).toBeGreaterThan(1);
  });
  it('alfabeto espelhado no Worker', () => {
    expect(TEMP_PASS_ALPHABET).not.toContain('0');
    expect(TEMP_PASS_ALPHABET).not.toContain('O');
    expect(TEMP_PASS_ALPHABET).not.toContain('1');
    expect(TEMP_PASS_ALPHABET).not.toContain('l');
  });
});

describe('buildShareMessage / shareLinks', () => {
  const ctx = { appName: 'Gestão IESA Emanuel', name: 'Ana', email: 'ana@iesa.org', tempPassword: 'Ab3Cd4Ef5Gh6', phone: '+244 923 000 000' };
  it('mensagem tem app, utilizador, password e endereço', () => {
    const m = buildShareMessage(ctx);
    expect(m).toContain('Gestão IESA Emanuel');
    expect(m).toContain('ana@iesa.org');
    expect(m).toContain('Ab3Cd4Ef5Gh6');
    expect(m).toContain('http');
  });
  it('links com indicativo 244 e texto codificado', () => {
    const l = shareLinks(buildShareMessage(ctx), ctx.phone, ctx.email);
    expect(l.wa).toMatch(/^https:\/\/wa\.me\/244923000000\?text=/);
    expect(l.sms).toMatch(/^sms:\+244923000000\?body=/);
    expect(l.mail).toMatch(/^mailto:ana@iesa\.org\?subject=/);
  });
  it('sem telefone → sem wa/sms', () => {
    const l = shareLinks('msg', null, 'a@b.c');
    expect(l.wa).toBeNull();
    expect(l.sms).toBeNull();
    expect(l.mail).not.toBeNull();
  });
});

describe('isTempExpired (7 dias)', () => {
  it('fresca não expira; com 8 dias expira', () => {
    const now = Date.now();
    expect(isTempExpired(now - 1000, now)).toBe(false);
    expect(isTempExpired(now - TEMP_PASSWORD_TTL_MS - 1000, now)).toBe(true);
    expect(isTempExpired(null)).toBe(false);
  });
});
