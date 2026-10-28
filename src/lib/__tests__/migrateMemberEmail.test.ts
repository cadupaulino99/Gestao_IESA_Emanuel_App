import { describe, expect, it } from 'vitest';
import {
  normEmail, memberEmailPatchForMember, memberEmailPatchForChild,
  emailMapFromMembers, MEMBER_EMAIL_COLLECTIONS,
} from '../migrate';

/* Migração v1.16.0 — carimbar memberEmail (pré-requisito para fechar a
   leitura legada nas regras). Pura e idempotente. */

describe('normEmail', () => {
  it('normaliza (minúsculas + trim) e recusa o que não é email', () => {
    expect(normEmail('  Maria@X.COM ')).toBe('maria@x.com');
    expect(normEmail('sem-arroba')).toBeNull();
    expect(normEmail(null)).toBeNull();
    expect(normEmail('')).toBeNull();
  });
});

describe('memberEmailPatchForMember', () => {
  it('carimba quando falta', () => {
    expect(memberEmailPatchForMember({ id: 'm1', email: 'Maria@X.com' })).toEqual({ memberEmail: 'maria@x.com' });
  });
  it('corrige divergência de caixa', () => {
    expect(memberEmailPatchForMember({ id: 'm1', email: 'maria@x.com', memberEmail: 'MARIA@X.COM' })).toEqual({ memberEmail: 'maria@x.com' });
  });
  it('idempotente: já carimbado → null', () => {
    expect(memberEmailPatchForMember({ id: 'm1', email: 'maria@x.com', memberEmail: 'maria@x.com' })).toBeNull();
  });
  it('sem email (membro sem conta) → null', () => {
    expect(memberEmailPatchForMember({ id: 'm1' })).toBeNull();
  });
});

describe('memberEmailPatchForChild', () => {
  const map = emailMapFromMembers([
    { id: 'm1', email: 'maria@x.com' },
    { id: 'm2' },                                  // sem email
  ]);
  it('carimba o filho a partir do mapa', () => {
    expect(memberEmailPatchForChild({ memberId: 'm1' }, map)).toEqual({ memberEmail: 'maria@x.com' });
  });
  it('idempotente: filho já carimbado → null', () => {
    expect(memberEmailPatchForChild({ memberId: 'm1', memberEmail: 'maria@x.com' }, map)).toBeNull();
  });
  it('membro sem email / desconhecido / órfão → null (decisão manual)', () => {
    expect(memberEmailPatchForChild({ memberId: 'm2' }, map)).toBeNull();
    expect(memberEmailPatchForChild({ memberId: 'inexistente' }, map)).toBeNull();
    expect(memberEmailPatchForChild({}, map)).toBeNull();
    expect(memberEmailPatchForChild(null, map)).toBeNull();
  });
  it('corrige carimbo errado (email trocado entre membros)', () => {
    expect(memberEmailPatchForChild({ memberId: 'm1', memberEmail: 'outra@x.com' }, map)).toEqual({ memberEmail: 'maria@x.com' });
  });
  it('corrige caixa errada no carimbo (Firestore compara com caixa)', () => {
    expect(memberEmailPatchForChild({ memberId: 'm1', memberEmail: 'MARIA@X.COM' }, map)).toEqual({ memberEmail: 'maria@x.com' });
  });
});

describe('MEMBER_EMAIL_COLLECTIONS', () => {
  it('cobre tudo o que o Portal do Membro lê por memberId', () => {
    for (const c of ['tithes', 'communions', 'donations', 'renewals', 'contributions', 'contribution_payments', 'member_budgets']) {
      expect(MEMBER_EMAIL_COLLECTIONS).toContain(c);
    }
  });
});
