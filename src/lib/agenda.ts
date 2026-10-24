import { AgendaItem } from '../types';
import { luandaDayKey, weekDatesLuanda } from './luanda';

/* ═══════════════════════════════════════════════════════════════════════
   AGENDA SEMANAL — v1.13.0
   Programação regular (dia da semana + hora). Suspender uma ocorrência =
   acrescentar a data a `cancelledDates` — a programação NÃO se apaga.
   Funções PURAS — testadas em __tests__/agenda.test.ts.
   ═══════════════════════════════════════════════════════════════════════ */

export interface AgendaOccurrence {
  /** 'AAAA-MM-DD' (Luanda). */
  date: string;
  item: AgendaItem;
  /** Ocorrência suspensa nessa data (mostra-se riscada + «Cancelado»). */
  cancelled: boolean;
  isToday: boolean;
}

const byStartTime = (a: AgendaItem, b: AgendaItem) =>
  String(a.startTime || '').localeCompare(String(b.startTime || '')) ||
  String(a.title || '').localeCompare(String(b.title || ''));

/** Semana (segunda…domingo) que contém `ref`: 7 listas de ocorrências. */
export function expandWeek(items: AgendaItem[], ref: number = Date.now()): AgendaOccurrence[][] {
  const dates = weekDatesLuanda(ref);
  const today = luandaDayKey(ref);
  const active = (items || []).filter((i) => i && i.ativo !== false && Number(i.weekday) >= 1 && Number(i.weekday) <= 7);
  return dates.map((date, idx) => {
    const cancelledSet = new Set<string>();
    const dayItems = active
      .filter((i) => Number(i.weekday) === idx + 1)
      .sort(byStartTime)
      .map((item) => {
        const cancelled = (item.cancelledDates || []).includes(date);
        if (cancelled) cancelledSet.add(date);
        return { date, item, cancelled, isToday: date === today };
      });
    return dayItems;
  });
}

/** Datas da semana visível: ['AAAA-MM-DD' × 7] (segunda…domingo). */
export function weekDates(ref: number = Date.now()): string[] {
  return weekDatesLuanda(ref);
}

/** Liga/desliga uma suspensão: devolve o NOVO array cancelledDates (imutável). */
export function toggleCancelledDate(item: AgendaItem, dateIso: string): string[] {
  const cur = item?.cancelledDates || [];
  return cur.includes(dateIso) ? cur.filter((d) => d !== dateIso) : [...cur, dateIso].sort();
}
