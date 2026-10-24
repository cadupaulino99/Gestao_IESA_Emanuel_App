import { describe, expect, it } from 'vitest';
import { expandWeek, toggleCancelledDate } from '../agenda';
import { AgendaItem } from '../../types';

const at = (y: number, m: number, d: number, hh = 12) => Date.UTC(y, m - 1, d, hh);

const item = (o: Partial<AgendaItem>): AgendaItem => ({
  id: 'x', title: 'Item', weekday: 1, startTime: '08:00', ...o,
} as AgendaItem);

describe('expandWeek (segunda…domingo, Luanda)', () => {
  // 25/10/2026 é domingo → semana 19…25/10
  const ref = at(2026, 10, 25);
  it('coloca cada item no dia da semana certo, ordenado por hora', () => {
    const w = expandWeek([
      item({ id: 'a', weekday: 1, startTime: '18:00', title: 'Culto de Oração' }),
      item({ id: 'b', weekday: 1, startTime: '08:00', title: 'Escola Dominical' }),
      item({ id: 'c', weekday: 7, startTime: '09:00', title: 'Culto' }),
    ], ref);
    expect(w[0].map((o) => o.item.title)).toEqual(['Escola Dominical', 'Culto de Oração']);
    expect(w[0][0].date).toBe('2026-10-19');
    expect(w[6].map((o) => o.item.title)).toEqual(['Culto']);
    expect(w[1]).toEqual([]);
  });
  it('marca «Hoje» apenas no dia corrente', () => {
    const w = expandWeek([item({ weekday: 7 })], ref);
    expect(w[6][0].isToday).toBe(true);
    const w2 = expandWeek([item({ weekday: 1 })], ref);
    expect(w2[0][0].isToday).toBe(false);
  });
  it('ocorrência suspensa: cancelled sem apagar a programação', () => {
    const w = expandWeek([item({ weekday: 1, cancelledDates: ['2026-10-19'] })], ref);
    expect(w[0][0].cancelled).toBe(true);
    expect(w[0][0].item.title).toBe('Item'); // continua na lista (riscada)
    const w2 = expandWeek([item({ weekday: 1, cancelledDates: ['2026-10-12'] })], ref);
    expect(w2[0][0].cancelled).toBe(false);
  });
  it('itens desativados ficam de fora', () => {
    expect(expandWeek([item({ weekday: 1, ativo: false })], ref)[0]).toEqual([]);
  });
});

describe('toggleCancelledDate', () => {
  it('acrescenta e remove (imutável)', () => {
    const a = item({ weekday: 3 });
    const added = toggleCancelledDate(a, '2026-10-21');
    expect(added).toEqual(['2026-10-21']);
    expect(a.cancelledDates ?? []).toEqual([]); // original intacto
    expect(toggleCancelledDate({ ...a, cancelledDates: added }, '2026-10-21')).toEqual([]);
  });
});
