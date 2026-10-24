/* ═══════════════════════════════════════════════════════════════════════
   DATAS E HORAS DE LUANDA (UTC+1, sem horário de verão) — v1.13.0
   ───────────────────────────────────────────────────────────────────────
   Princípio: datas são guardadas como strings LOCAIS ('AAAA-MM-DD') e
   horas como 'HH:MM' (24 h). Nunca epoch/ISO com fuso — assim um evento
   às 23:30 de 30/10 aparece 30/10 às 23:30 em QUALQUER aparelho.
   «Hoje», «Amanhã» e «Faltam N dias» calculam-se pelo dia de LUANDA,
   não pelo dia do aparelho (mesmo critério de lib/notify.ts e do Worker).
   Funções PURAS (o instante `now` é injectável) — testadas em
   __tests__/luanda.test.ts.
   ═══════════════════════════════════════════════════════════════════════ */

export const LUANDA_OFFSET_MS = 60 * 60 * 1000; // UTC+1

const p2 = (n: number) => String(n).padStart(2, '0');

export interface LuandaParts {
  year: number; month: number; day: number;   // 1-12 / 1-31
  hour: number; minute: number;
  /** 1=segunda … 7=domingo (ISO). */
  dow: number;
}

/** Partes de calendário/hora de um instante, vistas de Luanda. */
export function luandaParts(now: number = Date.now()): LuandaParts {
  const d = new Date(now + LUANDA_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dow: ((d.getUTCDay() + 6) % 7) + 1,
  };
}

/** Dia corrente em Luanda como 'AAAA-MM-DD' (a chave de tudo). */
export function luandaDayKey(now: number = Date.now()): string {
  const p = luandaParts(now);
  return `${p.year}-${p2(p.month)}-${p2(p.day)}`;
}

/** Instante (epoch ms) das 00:00 de Luanda do dia `dayKey`. */
export function luandaStartOfDay(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - LUANDA_OFFSET_MS;
}

/** 'AAAA-MM-DD' válido? (sem validar dia do mês — basta o formato) */
export function isDateIso(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** 'HH:MM' 24 h válido? */
export function isTimeHHMM(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** dd/mm/aaaa a partir de 'AAAA-MM-DD'. Entrada inválida → '—'. */
export function fmtDatePT(iso?: string | null): string {
  if (!isDateIso(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** HH:MM (já vem assim; valida). */
export function fmtTime24(hhmm?: string | null): string {
  return isTimeHHMM(hhmm) ? hhmm : '';
}

/** «30/10/2026 às 23:30» / «30/10/2026» quando não há hora. */
export function fmtDateTimePT(dateIso?: string | null, hhmm?: string | null): string {
  const t = fmtTime24(hhmm);
  return t ? `${fmtDatePT(dateIso)} às ${t}` : fmtDatePT(dateIso);
}

/** Diferença em dias (Luanda): alvo − hoje. 0 = hoje, 1 = amanhã, <0 = passado. */
export function daysFromLuandaToday(dateIso: string, now: number = Date.now()): number {
  if (!isDateIso(dateIso)) return NaN;
  const a = luandaStartOfDay(dateIso);
  const b = luandaStartOfDay(luandaDayKey(now));
  return Math.round((a - b) / 86400000);
}

/** Rótulo curto para listas: 'Hoje' | 'Amanhã' | 'Faltam N dias' | 'Há N dias'. */
export function dayLabelLuanda(dateIso: string, now: number = Date.now()): string {
  const n = daysFromLuandaToday(dateIso, now);
  if (Number.isNaN(n)) return '';
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Amanhã';
  if (n > 1) return `Faltam ${n} dias`;
  if (n === -1) return 'Ontem';
  return `Há ${-n} dias`;
}

/** As 7 datas 'AAAA-MM-DD' (segunda … domingo) da semana que contém `now`. */
export function weekDatesLuanda(now: number = Date.now()): string[] {
  const p = luandaParts(now);
  const monday = Date.UTC(p.year, p.month - 1, p.day) - (p.dow - 1) * 86400000;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday + i * 86400000);
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  });
}

const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

/** Nome do dia da semana (1=segunda … 7=domingo). */
export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday - 1] || '';
}

/** Nome do dia da semana de uma data 'AAAA-MM-DD'. */
export function weekdayNameOfDate(dateIso: string): string {
  if (!isDateIso(dateIso)) return '';
  const [y, m, d] = dateIso.split('-').map(Number);
  return WEEKDAY_NAMES[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}
