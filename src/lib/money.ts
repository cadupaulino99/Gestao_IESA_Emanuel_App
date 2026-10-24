/* ═══════════════════════════════════════════════════════════════════════════
   FONTE ÚNICA DA MOEDA (v1.12.0)
   ───────────────────────────────────────────────────────────────────────────
   • Apresentação: 1.500,00 Kz  (milhar=ponto, decimal=vírgula, 2 casas,
     símbolo «Kz» depois, com um espaço). Nunca «AOA» ao utilizador.
   • Armazenamento: INTEIROS DE CÊNTIMOS (700,00 Kz = 70000). Somas exactas.
   • Independente do idioma do navegador/dispositivo.
   Para mudar o formato, mexa SÓ em MONEY_FORMAT abaixo.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MONEY_FORMAT = {
  thousands: '.',
  decimal: ',',
  decimals: 2,
  suffix: ' Kz',
  /** Tecto por lançamento: 1.000.000.000,00 Kz em cêntimos. */
  maxCents: 100_000_000_000,
} as const;

/** cêntimos → «1.500,00 Kz». Nunca depende do locale. */
export function formatKz(cents: number | null | undefined): string {
  const c = Math.round(Number(cents) || 0);
  const neg = c < 0;
  const abs = Math.abs(c);
  const intPart = Math.floor(abs / 100).toString();
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, MONEY_FORMAT.thousands);
  const dec = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}${grouped}${MONEY_FORMAT.decimal}${dec}${MONEY_FORMAT.suffix}`;
}

/** Versão curta para eixos de gráficos: «1,5 mil Kz» → mantém formato cheio?
 *  Não: gráficos usam formatKz compacto sem suffix duplicado. */
export function formatKzAxis(cents: number): string {
  if (Math.abs(cents) >= 100_000_000) return `${formatKzNum(cents / 100_000_000)} mi Kz`;
  if (Math.abs(cents) >= 100_000) return `${formatKzNum(cents / 100_000)} mil Kz`;
  return formatKz(cents);
}
const formatKzNum = (n: number) =>
  n.toLocaleString('en-US').replace(/,/g, MONEY_FORMAT.thousands).replace('.', MONEY_FORMAT.decimal);

export type ParseResult = { ok: true; cents: number; error?: undefined } | { ok: false; error: string; cents?: undefined };

const ERR_FMT = 'Valor inválido. Exemplo: 1.500,00';

/**
 * Interpreta texto escrito pelo utilizador (regras fixas, sem adivinhar):
 *  - aceita prefixo/sufixo Kz/KZ/AOA (removidos);
 *  - ponto SÓ como separador de milhares e apenas seguido de exactamente 3 dígitos;
 *  - vírgula SÓ como separador decimal (1 ou 2 casas; 1 casa completa p/ 2);
 *  - recusa: vazio, negativo, letras estranhas, «1.50», «1,2,3», > máximo.
 */
export function parseKzInput(raw: string, opts: { required?: boolean } = {}): ParseResult {
  const required = opts.required !== false;
  let s = String(raw ?? '').trim();
  if (!s) return required ? { ok: false, error: 'Campo obrigatório.' } : { ok: true, cents: 0 };
  // prefixos/sufixos de moeda
  s = s.replace(/\bAOA\b/gi, '').replace(/\bKZ\b/gi, '').replace(/Kz$/g, '').replace(/^kz/gi, '').trim();
  if (!s) return { ok: false, error: ERR_FMT };
  if (s.startsWith('-') || s.startsWith('+')) return { ok: false, error: 'Valores negativos não são aceites.' };
  if (/[a-z]/i.test(s.replace(/\bAOA\b|\bKZ\b|Kz|kz/g, ''))) return { ok: false, error: ERR_FMT };

  const parts = s.split(',');
  if (parts.length > 2) return { ok: false, error: ERR_FMT }; // «1,2,3»
  let intPart = parts[0];
  let decPart = parts.length === 2 ? parts[1] : '';

  // pontos: só como milhares, exactamente 3 dígitos a seguir
  if (intPart.includes('.')) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(intPart)) return { ok: false, error: ERR_FMT };
    intPart = intPart.replace(/\./g, '');
  }
  if (!/^\d+$/.test(intPart || '0')) return { ok: false, error: ERR_FMT };
  if (decPart && !/^\d{1,2}$/.test(decPart)) return { ok: false, error: ERR_FMT };
  decPart = (decPart + '00').slice(0, 2);

  const cents = parseInt(intPart, 10) * 100 + parseInt(decPart || '0', 10);
  if (cents === 0 && required) return { ok: false, error: ERR_FMT };
  if (cents > MONEY_FORMAT.maxCents) return { ok: false, error: `Máximo: ${formatKz(MONEY_FORMAT.maxCents)}.` };
  return { ok: true, cents };
}

/** Para exibição em campo em edição: «700,00» sem símbolo. */
export function editValue(cents: number | null | undefined): string {
  const c = Math.round(Number(cents) || 0);
  return `${Math.floor(c / 100)}${MONEY_FORMAT.decimal}${String(c % 100).padStart(2, '0')}`;
}

/** Conversão de valores LEGADOS (floats em Kz ou strings soltas) para cêntimos.
 *  Devolve null quando não interpreta com certeza (a migração lista-os). */
export function legacyToCents(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v * 100);
  if (typeof v === 'string') {
    const r = parseKzInput(v, { required: false });
    return r.ok ? r.cents : null;
  }
  return null;
}
