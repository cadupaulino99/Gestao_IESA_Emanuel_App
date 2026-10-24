/**
 * Gestão de administradores — helpers puros e testáveis.
 * As palavras-passe NUNCA são guardadas em texto legível: a temporária é gerada
 * no cliente, enviada UMA vez por HTTPS ao Worker (que a define no Firebase Auth,
 * onde vive apenas o hash) e mostrada UMA vez no ecrã de partilha.
 */

/** Alfabeto sem caracteres confusos (0/O, 1/l/i) — espelhado no Worker v2.4.0. */
export const TEMP_PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function genTempPassword(len = 12): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += TEMP_PASS_ALPHABET[buf[i] % TEMP_PASS_ALPHABET.length];
  return out;
}

export const APP_ACCESS_URL = 'https://iesa-emanuel.web.app';

export interface ShareCtx {
  appName: string;
  name?: string;
  email: string;
  tempPassword: string;
  phone?: string | null;
  accessUrl?: string;
}

/** Mensagem pronta a partilhar (copiar / WhatsApp / SMS / email). */
export function buildShareMessage(c: ShareCtx): string {
  const url = c.accessUrl || APP_ACCESS_URL;
  return [
    `${c.appName} — credenciais de administrador`,
    c.name ? `Olá, ${c.name}.` : 'Olá.',
    `Utilizador: ${c.email}`,
    `Palavra-passe temporária: ${c.tempPassword}`,
    `Acesso: ${url}`,
    'Por segurança, terá de definir uma palavra-passe nova no primeiro acesso.',
    'Esta mensagem mostra-se uma única vez a quem a criou — não a reencaminhe.',
  ].join('\n');
}

export function shareLinks(msg: string, phone?: string | null, email?: string | null) {
  const raw = String(phone || '').replace(/\D/g, '');
  const digits = raw ? (raw.startsWith('244') ? raw : '244' + raw) : '';
  return {
    wa: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}` : null,
    sms: digits ? `sms:+${digits}?body=${encodeURIComponent(msg)}` : null,
    mail: email ? `mailto:${email}?subject=${encodeURIComponent('Credenciais — Gestão IESA Emanuel')}&body=${encodeURIComponent(msg)}` : null,
  };
}

/** A temporária expira aos 7 dias. */
export const TEMP_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export function isTempExpired(issuedAt: number | null | undefined, now = Date.now()): boolean {
  if (!issuedAt) return false;
  return now - issuedAt > TEMP_PASSWORD_TTL_MS;
}
