/**
 * Papéis da Igreja Emanuel (IESA) — matriz de acesso.
 *
 * Grupo A (acesso total operacional): admin, treasurer (+ super via isSuper)
 * Grupo B (liderança espiritual): pastor, evangelista, catequista
 * Grupo C (secretaria / diaconia): secretario, diacono
 * Grupo D (membro): sem documento em admins/
 */

export const APP_ROLES = {
  admin: {
    code: 'admin',
    label: 'Assistente Administrativo e Social',
    shortLabel: 'Administrador',
    group: 'full' as const,
  },
  treasurer: {
    code: 'treasurer',
    label: 'Tesoureiro',
    shortLabel: 'Tesoureiro',
    group: 'full' as const,
  },
  pastor: {
    code: 'pastor',
    label: 'Pastor',
    shortLabel: 'Pastor',
    group: 'spiritual' as const,
  },
  evangelista: {
    code: 'evangelista',
    label: 'Evangelista',
    shortLabel: 'Evangelista',
    group: 'spiritual' as const,
  },
  catequista: {
    code: 'catequista',
    label: 'Catequista',
    shortLabel: 'Catequista',
    group: 'spiritual' as const,
  },
  secretario: {
    code: 'secretario',
    label: 'Secretário',
    shortLabel: 'Secretário',
    group: 'office' as const,
  },
  diacono: {
    code: 'diacono',
    label: 'Diácono',
    shortLabel: 'Diácono',
    group: 'office' as const,
  },
} as const;

export type AppRoleCode = keyof typeof APP_ROLES;
export type RoleGroup = 'full' | 'spiritual' | 'office';

export const ALL_ROLE_CODES = Object.keys(APP_ROLES) as AppRoleCode[];

/** Lista para selects (ordem de apresentação). */
export const ROLE_SELECT_OPTIONS = [
  APP_ROLES.admin,
  APP_ROLES.treasurer,
  APP_ROLES.pastor,
  APP_ROLES.evangelista,
  APP_ROLES.catequista,
  APP_ROLES.secretario,
  APP_ROLES.diacono,
] as const;

export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Membro';
  const r = APP_ROLES[role as AppRoleCode];
  return r?.label || role;
}

export function roleShortLabel(role: string | null | undefined): string {
  if (!role) return 'Membro';
  const r = APP_ROLES[role as AppRoleCode];
  return r?.shortLabel || role;
}

export function roleGroup(role: string | null | undefined): RoleGroup | null {
  if (!role) return null;
  const r = APP_ROLES[role as AppRoleCode];
  return r?.group ?? null;
}

/** Conta com documento em admins/ (qualquer papel de staff). */
export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && role in APP_ROLES;
}

export function isFullAccessRole(role: string | null | undefined, isSuper = false): boolean {
  if (isSuper) return true;
  const g = roleGroup(role);
  return g === 'full';
}

export function isSpiritualRole(role: string | null | undefined): boolean {
  return roleGroup(role) === 'spiritual';
}

export function isOfficeRole(role: string | null | undefined): boolean {
  return roleGroup(role) === 'office';
}

export interface RolePermissions {
  /** Módulos financeiros (ver e editar). */
  financesWrite: boolean;
  /** Ver finanças (inclui liderança espiritual em leitura). */
  financesRead: boolean;
  members: boolean;
  communion: boolean;
  board: boolean; // avisos / agenda / eventos
  radio: boolean;
  /** Página Administração (parcial ou total). */
  adminPanel: boolean;
  adminSignups: boolean;
  adminChurchData: boolean;
  adminDataTools: boolean;
  adminAudit: boolean;
  manageAdmins: boolean;
}

export function getPermissions(
  role: string | null | undefined,
  isSuper = false,
): RolePermissions {
  const full = isFullAccessRole(role, isSuper);
  const spiritual = isSpiritualRole(role);
  const office = isOfficeRole(role);
  const staff = full || spiritual || office || isSuper;

  return {
    financesWrite: full,
    financesRead: full || spiritual,
    members: staff,
    communion: staff,
    board: staff,
    radio: true, // membros e staff
    adminPanel: staff,
    adminSignups: staff,
    adminChurchData: full,
    adminDataTools: full,
    adminAudit: full,
    manageAdmins: isSuper,
  };
}
