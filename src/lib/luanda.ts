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

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Ano bissexto (gregoriano). */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * v1.19.0 (P3): 'AAAA-MM-DD' com CALENDÁRIO válido — `isDateIso` só confere o
 * formato e deixava passar '1990-13-45' (foi assim que o auto-cadastro gravou
 * datas impossíveis). `minYear`/`maxYear` travam disparates (1 a.C., 9999).
 */
export function isCalendarDateIso(v: unknown, minYear = 1850, maxYear = luandaYear() + 1): v is string {
  if (!isDateIso(v)) return false;
  const [y, m, d] = (v as string).split('-').map(Number);
  if (y < minYear || y > maxYear) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= (m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m - 1]);
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

/* ═══════════════════════════════════════════════════════════════════
   v1.19.0 (P3 «Luanda em todo o lado»)
   ───────────────────────────────────────────────────────────────────────
   A biblioteca já existia, mas ~50 sítios da UI continuavam a usar
   `new Date().getMonth()` (fuso do APARELHO) e
   `new Date().toISOString().slice(0,10)` (UTC). Em Luanda (UTC+1) isto
   partia coisas reais:
     · um lançamento feito entre as 00:00 e as 01:00 guardava a data de
       ONTEM (o UTC ainda está no dia anterior);
     · uma data vinda do Excel/AI (`new Date(y, m-1, d).toISOString()`)
       recuava SEMPRE um dia (meia-noite local = 23:00 UTC do dia anterior);
     · filtros de «mês corrente» num aparelho com fuso errado (ou de um
       irmão em viagem) mostravam o mês errado.
   As funções abaixo são PURAS (`now` injectável) e passam a ser a única
   forma de obter «hoje», «este mês» e «este ano» na aplicação.
   ═══════════════════════════════════════════════════════════════════ */

const p2n = (n: number) => String(n).padStart(2, '0');

/** Ano corrente em Luanda (ex.: 2026). */
export function luandaYear(now: number = Date.now()): number {
  return luandaParts(now).year;
}

/** Mês corrente em Luanda, 1-12. */
export function luandaMonth(now: number = Date.now()): number {
  return luandaParts(now).month;
}

/** Índice do mês corrente em Luanda, 0-11 (para arrays de 12 posições). */
export function luandaMonthIdx(now: number = Date.now()): number {
  return luandaParts(now).month - 1;
}

/** Dia do mês corrente em Luanda, 1-31. */
export function luandaDayOfMonth(now: number = Date.now()): number {
  return luandaParts(now).day;
}

/** Mês corrente em Luanda no formato CANÓNICO do sistema: '01'..'12'. */
export function luandaMonthStr(now: number = Date.now()): string {
  return p2n(luandaParts(now).month);
}

/** 'AAAA-MM' de Luanda (chaves de mês, nomes de ficheiro). */
export function luandaMonthKey(now: number = Date.now()): string {
  const p = luandaParts(now);
  return `${p.year}-${p2n(p.month)}`;
}

/** Instante (epoch ms) do FIM do dia de Luanda (23:59:59.999) — prazos. */
export function luandaEndOfDay(dayKey: string): number {
  return luandaStartOfDay(dayKey) + 86400000 - 1;
}

/**
 * 'AAAA-MM-DD' a partir de partes de calendário, SEM passar pelo fuso do
 * aparelho (o bug do Excel/AI: `new Date(y,m-1,d).toISOString()` recua um
 * dia em UTC+1). Partes inválidas → ''.
 */
export function isoFromParts(year: number, month: number, day: number): string {
  const y = Math.trunc(Number(year));
  const m = Math.trunc(Number(month));
  const d = Math.trunc(Number(day));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  if (m < 1 || m > 12 || d < 1 || y < 1) return '';
  if (d > (m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m - 1])) return '';
  return `${y}-${p2n(m)}-${p2n(d)}`;
}

/** Época (ms) → 'AAAA-MM-DD' de Luanda. Entrada inválida → ''. */
export function luandaDateOf(ms: unknown): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  return luandaDayKey(n);
}

const MONTH_NAMES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_SHORT_PT = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** Nome do mês em português (1-12). `short` → 'out.'. Inválido → ''. */
export function monthNamePT(month: number, short = false): string {
  const i = Math.trunc(Number(month)) - 1;
  if (i < 0 || i > 11) return '';
  return short ? MONTH_SHORT_PT[i] : MONTH_NAMES_PT[i];
}

/** Nome do mês corrente em Luanda ('Outubro'). */
export function luandaMonthNamePT(now: number = Date.now(), short = false): string {
  return monthNamePT(luandaParts(now).month, short);
}

/** '31/10/2026' — data de Luanda (rodapés de PDF, «gerado em»). */
export function fmtTodayPT(now: number = Date.now()): string {
  return fmtDatePT(luandaDayKey(now));
}

/** '31/10/2026 14:05' — data+hora de Luanda. */
export function fmtTodayTimePT(now: number = Date.now()): string {
  const p = luandaParts(now);
  return `${fmtDatePT(luandaDayKey(now))} ${p2n(p.hour)}:${p2n(p.minute)}`;
}

export interface MonthSlot {
  year: number;
  /** 1-12 */
  month: number;
  /** '01'..'12' — o formato canónico guardado no Firestore */
  monthStr: string;
  /** 'out.' (pt, minúsculo, como o `toLocaleString` devolvia) */
  name: string;
  /** 'out./26' — rótulo de eixo de gráfico */
  label: string;
}

/**
 * Os últimos `count` meses (inclusive o corrente), do mais antigo para o
 * mais recente, vistos de Luanda. Substitui os ciclos
 * `new Date(year, month - i, 1)` dos gráficos — que dependiam do fuso do
 * aparelho e produziam meses duplicados/errados em Dezembro/Janeiro.
 */
export function lastMonthsLuanda(count = 6, now: number = Date.now()): MonthSlot[] {
  const n = Math.max(1, Math.min(60, Math.trunc(Number(count)) || 1));
  const p = luandaParts(now);
  const out: MonthSlot[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = p.year * 12 + (p.month - 1) - i;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const short = monthNamePT(m, true);
    out.push({ year: y, month: m, monthStr: p2n(m), name: short, label: `${short}/${String(y).slice(2)}` });
  }
  return out;
}

/**
 * Aniversário hoje, em Luanda? Aceita 'AAAA-MM-DD' (canónico), 'DD/MM/AAAA'
 * (legado/Excel) e Date. `birthDate` ausente/inválida → false.
 */
export function isBirthdayToday(birthDate: unknown, now: number = Date.now()): boolean {
  const iso = normalizeBirthDate(birthDate);
  if (!iso) return false;
  const p = luandaParts(now);
  return Number(iso.slice(5, 7)) === p.month && Number(iso.slice(8, 10)) === p.day;
}

/** Idade (anos completos) que a pessoa faz no dia de hoje em Luanda. */
export function ageToday(birthDate: unknown, now: number = Date.now()): number | null {
  const iso = normalizeBirthDate(birthDate);
  if (!iso) return null;
  const p = luandaParts(now);
  const by = Number(iso.slice(0, 4));
  const bm = Number(iso.slice(5, 7));
  const bd = Number(iso.slice(8, 10));
  if (!by) return null;
  let age = p.year - by;
  if (p.month < bm || (p.month === bm && p.day < bd)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

/**
 * Normaliza uma data de nascimento para 'AAAA-MM-DD'. Aceita o formato
 * canónico, 'DD/MM/AAAA' (exportações Excel) e epoch ms. Sem conversões por
 * `new Date(...)` locais — que eram a causa do «aniversário um dia antes».
 */
export function normalizeBirthDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return luandaDayKey(v);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.slice(0, 10);
    /* P3: '1990-13-45' devolve '' (antes entrava na lista de aniversariantes). */
    return isCalendarDateIso(iso, 1850, 9999) ? iso : '';
  }
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return isoFromParts(Number(m[3]), Number(m[2]), Number(m[1]));
  return '';
}
