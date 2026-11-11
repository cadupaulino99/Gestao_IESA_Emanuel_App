/**
 * Decisões de acesso do AuthContext (funções puras / testáveis).
 * Papéis canónicos: ver src/lib/roles.ts
 */
import {
  ALL_ROLE_CODES,
  isStaffRole,
  isFullAccessRole,
  type AppRoleCode,
} from './roles';

/** Papéis que acedem à área de liderança (não-membro). */
export const LEADERSHIP_ROLES = ALL_ROLE_CODES;
export type LeadershipRole = AppRoleCode;

/** Papel a partir do documento admins/<email>. */
export function resolveRole(adminDocExists: boolean, roleField: unknown): string | null {
  if (!adminDocExists) return null;
  if (typeof roleField === 'string' && roleField && isStaffRole(roleField)) {
    return roleField;
  }
  // Legado: documento sem role válido conta como admin
  return 'admin';
}

/** Qualquer staff (grupos A/B/C). */
export function isLeadership(role: string | null): role is LeadershipRole {
  return isStaffRole(role);
}

/** Acesso total operacional (grupo A ou super). */
export function isFullLeadership(role: string | null, isSuper = false): boolean {
  return isFullAccessRole(role, isSuper);
}

/** Primeiro documento de uma lista (portal do membro) ou null. */
export function firstMemberOrNone<T>(docs: T[]): T | null {
  return docs.length ? docs[0] : null;
}
