import { describe, expect, it } from 'vitest';
import { resolveRole, isLeadership, firstMemberOrNone, LEADERSHIP_ROLES } from '../access';

describe('resolveRole (a decisão central do AuthContext)', () => {
  it('sem documento em admins → sem papel (mesmo com role inventado)', () => {
    expect(resolveRole(false, 'admin')).toBeNull();
    expect(resolveRole(false, undefined)).toBeNull();
  });
  it('documento sem campo role (legado) → admin', () => {
    expect(resolveRole(true, undefined)).toBe('admin');
    expect(resolveRole(true, '')).toBe('admin');
  });
  it('documento com role → esse papel', () => {
    expect(resolveRole(true, 'pastor')).toBe('pastor');
    expect(resolveRole(true, 'treasurer')).toBe('treasurer');
  });
  it('role não-string (dados corrompidos) → admin, não crash', () => {
    expect(resolveRole(true, 42)).toBe('admin');
  });
});

describe('isLeadership (o que o Worker e as regras exigem)', () => {
  it('aceita os três papéis de liderança', () => {
    for (const r of LEADERSHIP_ROLES) expect(isLeadership(r)).toBe(true);
  });
  it('rejeita null e papéis desconhecidos', () => {
    expect(isLeadership(null)).toBe(false);
    expect(isLeadership('member')).toBe(false);
    expect(isLeadership('')).toBe(false);
  });
});

describe('firstMemberOrNone (portal do membro)', () => {
  it('devolve o primeiro ou null', () => {
    expect(firstMemberOrNone([{ id: 'a' }, { id: 'b' }])).toEqual({ id: 'a' });
    expect(firstMemberOrNone([])).toBeNull();
  });
});
