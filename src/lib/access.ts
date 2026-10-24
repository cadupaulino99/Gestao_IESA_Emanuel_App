/**
 * Decisões de acesso do AuthContext, extraídas como funções puras para poderem
 * ser testadas (auditoria 2026-10-24: «alargar testes ao AuthContext»).
 * O AuthContext consulta o Firestore; aqui decide-se o que os resultados mean.
 */
export const LEADERSHIP_ROLES = ['admin', 'pastor', 'treasurer'] as const;
export type LeadershipRole = (typeof LEADERSHIP_ROLES)[number];

/** Papel a partir do documento admins/<email>: sem documento, sem papel.
 *  Documento sem campo role (legado) conta como 'admin' — comportamento
 *  histórico do AuthContext e do Worker. */
export function resolveRole(adminDocExists: boolean, roleField: unknown): string | null {
  if (!adminDocExists) return null;
  return typeof roleField === 'string' && roleField ? roleField : 'admin';
}

/** Liderança = admin | pastor | tesoureiro (o que o Worker e as regras exigem
 *  para finanças, IA e escritas). */
export function isLeadership(role: string | null): role is LeadershipRole {
  return !!role && (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

/** Primeiro documento de uma lista (portal do membro) ou null. */
export function firstMemberOrNone<T>(docs: T[]): T | null {
  return docs.length ? docs[0] : null;
}
