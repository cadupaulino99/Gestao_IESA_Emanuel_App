/* ═══════════════════════════════════════════════════════════════════════
   TEXTO FORMATADO SEGURO — v1.13.0 (Avisos, Agenda e Eventos)
   ───────────────────────────────────────────────────────────────────────
   A página «Postes» não existe (verificação de 2026-10-25): o editor e o
   filtro nascem aqui, para serem reaproveitados quando ela existir.

   Defesa em profundidade (3 camadas):
   1. EDITOR: só produz estas etiquetas (barra: negrito/itálico/sublinhado/
      listas/citação/link); colagens entram como texto simples.
   2. SANITIZADOR (este módulo, função pura): allowlist estrita — aplica-se
      ao gravar E volta a aplicar-se ao apresentar (dangerouslySetInnerHTML
      nunca recebe HTML não saneado).
   3. SERVIDOR (firestore.rules): isSafeRichText() recusa <script, <iframe,
      <style, javascript: e handlers on*= — um pedido direto com HTML
      perigoso é recusado mesmo que o cliente seja contornado.

   Sem estilos livres, sem classes, sem atributos exceto href (http/https/
   mailto) nos links. Funções PURAS — testadas em __tests__/richtext.test.ts.
   ═══════════════════════════════════════════════════════════════════════ */

/** Etiquetas permitidas (as únicas que sobrevivem). */
export const RICHTEXT_ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'h4',
] as const;

/** Etiquetas removidas COM o conteúdo (nunca podem deixar texto para trás). */
const DROP_WITH_CONTENT = [
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template',
  'noscript', 'frame', 'frameset', 'applet', 'form', 'input', 'button',
  'textarea', 'select', 'option', 'link', 'meta', 'base',
];

/** Limite de caracteres de texto (sem etiquetas) — espelhado nas rules. */
export const RICHTEXT_MAX_PLAIN = 8000;
/** Limite do HTML saneado (bytes de string) — espelhado nas rules (20000). */
export const RICHTEXT_MAX_HTML = 20000;

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/** href aceitável? (depois de descodificar entidades — truques &#106;… morrem aqui) */
function isSafeHref(href: string): boolean {
  const v = decodeEntities(href).trim().toLowerCase().replace(/[\u0000-\u0020]/g, '');
  return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('mailto:');
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Sanea HTML para a allowlist. Regras:
 *  - <script>/<style>/etc.: removidos COM o conteúdo;
 *  - etiquetas permitidas: mantidas (reconstruídas — atributos a mais caem);
 *  - <a>: só href http/https/mailto (+ rel/target fixos);
 *  - etiquetas desconhecidas: removidas, o TEXTO fica (unwrap);
 *  - '<' soltos no texto: escapados.
 */
export function sanitizeHtml(input: unknown): string {
  let s = String(input ?? '');

  // 1) remover etiquetas perigosas com todo o conteúdo (pares e soltas)
  for (const tag of DROP_WITH_CONTENT) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    s = s.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // 2) processar etiqueta a etiqueta (pilha de aberturas → saída balanceada)
  let out = '';
  let last = 0;
  const openStack: string[] = [];
  const closeUpTo = (name?: string): string => {
    let s2 = '';
    if (name === undefined) {
      while (openStack.length) s2 += `</${openStack.pop()}>`;
      return s2;
    }
    const idx = openStack.lastIndexOf(name);
    if (idx === -1) return '';                 // fecho sem abertura → ignorado
    while (openStack.length > idx) s2 += `</${openStack.pop()}>`;
    return s2;
  };
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s)) !== null) {
    out += escapeText(s.slice(last, m.index));           // texto entre etiquetas
    last = m.index + m[0].length;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (!(RICHTEXT_ALLOWED_TAGS as readonly string[]).includes(name)) continue; // unwrap
    if (closing) { out += closeUpTo(name); continue; }
    if (name === 'br') { out += '<br>'; continue; }
    if (name === 'a') {
      const hrefM = m[3].match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = hrefM ? decodeEntities(hrefM[2] ?? hrefM[3] ?? hrefM[4] ?? '') : '';
      if (!isSafeHref(href)) continue;                    // link sem href seguro → só texto
      out += `<a href="${href.replace(/"/g, '&quot;')}" rel="noopener noreferrer nofollow" target="_blank">`;
      openStack.push('a');
      continue;
    }
    out += `<${name}>`;
    openStack.push(name);
  }
  out += escapeText(s.slice(last));
  out += closeUpTo();                                     // fechos em falta no fim

  // 3) limites
  if (out.length > RICHTEXT_MAX_HTML) out = out.slice(0, RICHTEXT_MAX_HTML);
  return out;
}

/** HTML → texto simples (para notificações, listas e limites). */
export function htmlToPlain(html: unknown, maxLen = 400): string {
  const s = String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h4|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '');
  const plain = decodeEntities(s).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return plain.length > maxLen ? plain.slice(0, maxLen - 1) + '…' : plain;
}

/** Comprimento do texto (sem etiquetas) — para o limite do editor. */
export function richTextPlainLength(html: unknown): number {
  return htmlToPlain(html, Number.MAX_SAFE_INTEGER).length;
}

/** Validação de publicação: devolve erro legível ou null. */
export function validateRichText(html: string): string | null {
  const plain = richTextPlainLength(html);
  if (plain > RICHTEXT_MAX_PLAIN) return `Texto demasiado longo (${plain} caracteres; máximo ${RICHTEXT_MAX_PLAIN}).`;
  const clean = sanitizeHtml(html);
  if (clean.length > RICHTEXT_MAX_HTML) return 'Conteúdo excede o limite de tamanho.';
  return null;
}

/** Padrões que as firestore.rules também recusam (validação antecipada no cliente). */
export function hasDangerousPattern(html: unknown): boolean {
  const s = String(html ?? '').toLowerCase();
  return /<\s*(script|iframe|style|object|embed|svg|math|form|meta|link|base)/.test(s)
    || /javascript\s*:/.test(s.replace(/&#x?0*6a;?/gi, 'j'))
    || /\son(load|error|click|mouseover|focus|blur)\s*=/.test(s);
}
