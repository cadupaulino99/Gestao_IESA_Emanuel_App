import { z } from 'zod';
import { normalizePhoneAO } from './phone';

/* ═══════════════════════════════════════════════════════════════════════
   ESQUEMAS DE VALIDAÇÃO DO CADASTRO DE MEMBRO (v1.14.0)
   ───────────────────────────────────────────────────────────────────────
   ÚNICA FONTE das regras do formulário: usados tanto pelo cadastro que o
   administrador faz (pages/Members.tsx) como pelo AUTO-CADASTRO do membro
   (pages/SelfRegister.tsx) — extraídos de Members.tsx sem alterar uma
   vírgula às validações existentes.
   ═══════════════════════════════════════════════════════════════════════ */

/** Esquema do formulário de membro (o que a Administração usa desde sempre). */
export const memberSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  /* v1.17: email da conta (opcional no formulário da liderança) — normalizado
     e espelhado em memberEmail para as regras de leitura do próprio. */
  email: z.string().optional().refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()),
    'Email inválido. Ex.: nome@email.com'
  ),
  documentNumber: z.string().optional(),
  memberNumber: z.string().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  placeOfBirth: z.string().optional(),
  photoBase64: z.string().optional(),
  acceptsMessages: z.boolean().optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  baptismDate: z.string().optional(),
  gender: z.string().optional(),
  maritalStatus: z.string().optional(),
  spouseName: z.string().optional(),
  education: z.string().optional(),
  profession: z.string().optional(),
  address: z.string().optional(),
  groupCell: z.string().optional(),
  status: z.string().default("Activo"),
});

export type MemberForm = z.infer<typeof memberSchema>;

/** Campos de membro que o AUTO-CADASTRO pode enviar (allowlist espelhada no
 *  Worker — o servidor reconstrói o documento só com estas chaves). */
export const SIGNUP_MEMBER_FIELDS = [
  'name', 'documentNumber', 'memberNumber', 'fatherName', 'motherName',
  'placeOfBirth', 'photoBase64', 'acceptsMessages', 'phone', 'birthDate',
  'baptismDate', 'gender', 'maritalStatus', 'spouseName', 'education',
  'profession', 'address', 'groupCell',
] as const;

/** Política mínima de palavra-passe (mesma regra do ForcePasswordChangeModal
 *  dos admins: 8+ caracteres). Validada no cliente E no Worker. */
export const PASSWORD_MIN = 8;

export function passwordPolicyError(pw: string): string | null {
  if (!pw || pw.length < PASSWORD_MIN) return `A palavra-passe precisa de pelo menos ${PASSWORD_MIN} caracteres.`;
  if (pw.length > 200) return 'Palavra-passe demasiado longa.';
  return null;
}

/** Normalização de email: minúsculas, sem espaços (antes de unicidade). */
export function normalizeEmail(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Auto-cadastro = campos do membro (sem `status`, que o sistema controla)
 *  + email obrigatório/válido + palavra-passe com confirmação. */
export const signupSchema = memberSchema
  .omit({ status: true })
  .extend({
    email: z.string().transform(normalizeEmail).pipe(
      z.string().min(3, 'Email obrigatório.').refine((s) => EMAIL_REGEX.test(s), 'Email inválido. Ex.: nome@email.com'),
    ),
    password: z.string().min(PASSWORD_MIN, `A palavra-passe precisa de pelo menos ${PASSWORD_MIN} caracteres.`).max(200, 'Palavra-passe demasiado longa.'),
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: 'As palavras-passe não coincidem.',
    path: ['passwordConfirm'],
  })
  .refine((d) => !d.phone || normalizePhoneAO(d.phone) !== null, {
    message: 'Telefone angolano inválido: use +244 e 9 dígitos (ex.: +244 923 000 000).',
    path: ['phone'],
  });

export type SignupForm = z.infer<typeof signupSchema>;

/** Constrói o payload do auto-cadastro só com a allowlist (nada extra viaja). */
export function signupPayload(form: SignupForm): Record<string, unknown> {
  const out: Record<string, unknown> = { email: form.email, password: form.password };
  for (const k of SIGNUP_MEMBER_FIELDS) {
    const v = (form as any)[k];
    if (v === undefined || v === '') continue;
    out[k] = k === 'phone' ? (normalizePhoneAO(v) ?? v) : v;
  }
  return out;
}
