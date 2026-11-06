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

export const APP_ACCESS_URL = 'https://iesa-emanuel-xangongo.web.app';

export interface ShareCtx {
  appName: string;
  name?: string;
  email: string;
  tempPassword: string;
  phone?: string | null;
  accessUrl?: string;
}

/** Mensagem pronta a partilhar (copiar / WhatsApp / SMS / email). */
export function buildShareMessage(ctx: ShareCtx): string {
  const url = ctx.accessUrl || APP_ACCESS_URL;
  const lines = [
    ctx.appName || 'Gestão IESA Emanuel',
    ctx.name ? `Olá, ${ctx.name}.` : 'Olá.',
    '',
    'Credenciais de acesso (temporárias):',
    `Email: ${ctx.email}`,
    `Palavra-passe: ${ctx.tempPassword}`,
    '',
    `Entre em: ${url}`,
    'Altere a palavra-passe após o primeiro acesso.',
  ];
  if (ctx.phone) lines.push('', `Contacto: ${ctx.phone}`);
  return lines.join('\n');
}
