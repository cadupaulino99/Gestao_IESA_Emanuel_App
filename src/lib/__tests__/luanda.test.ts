import { describe, expect, it } from 'vitest';
import {
  luandaDayKey, luandaParts, luandaStartOfDay, daysFromLuandaToday, dayLabelLuanda,
  weekDatesLuanda, fmtDatePT, fmtDateTimePT, isDateIso, isTimeHHMM, weekdayNameOfDate,
} from '../luanda';

/* Instantes fixos em UTC para testes determinísticos. */
const at = (y: number, m: number, d: number, hh = 0, mm = 0) => Date.UTC(y, m - 1, d, hh, mm);

describe('luandaDayKey / luandaParts (UTC+1)', () => {
  it('22:30 UTC ainda é o mesmo dia em Luanda (23:30)', () => {
    expect(luandaDayKey(at(2026, 10, 25, 22, 30))).toBe('2026-10-25');
    expect(luandaParts(at(2026, 10, 25, 22, 30))).toMatchObject({ hour: 23, minute: 30, day: 25 });
  });
  it('23:30 UTC já é o dia seguinte em Luanda (00:30) — o caso que desloca eventos', () => {
    expect(luandaDayKey(at(2026, 10, 25, 23, 30))).toBe('2026-10-26');
  });
  it('luandaStartOfDay é o inverso de luandaDayKey', () => {
    expect(luandaDayKey(luandaStartOfDay('2026-10-25'))).toBe('2026-10-25');
  });
});

describe('daysFromLuandaToday / dayLabelLuanda', () => {
  const now = at(2026, 10, 25, 12); // 25/10 13:00 em Luanda (domingo)
  it('hoje / amanhã / faltam N', () => {
    expect(daysFromLuandaToday('2026-10-25', now)).toBe(0);
    expect(daysFromLuandaToday('2026-10-26', now)).toBe(1);
    expect(daysFromLuandaToday('2026-10-30', now)).toBe(5);
    expect(dayLabelLuanda('2026-10-25', now)).toBe('Hoje');
    expect(dayLabelLuanda('2026-10-26', now)).toBe('Amanhã');
    expect(dayLabelLuanda('2026-10-30', now)).toBe('Faltam 5 dias');
  });
  it('passado: ontem / há N dias', () => {
    expect(dayLabelLuanda('2026-10-24', now)).toBe('Ontem');
    expect(dayLabelLuanda('2026-10-20', now)).toBe('Há 5 dias');
  });
  it('não conta pelo fuso do aparelho: 25/10 23:30 UTC = 26/10 em Luanda', () => {
    expect(dayLabelLuanda('2026-10-26', at(2026, 10, 25, 23, 30))).toBe('Hoje');
  });
});

describe('weekDatesLuanda (segunda…domingo)', () => {
  it('domingo 25/10/2026 pertence à semana 19–25/10', () => {
    expect(weekDatesLuanda(at(2026, 10, 25, 12))).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22',
      '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
  });
  it('segunda-feira é o primeiro dia', () => {
    const w = weekDatesLuanda(at(2026, 10, 26, 8));
    expect(w[0]).toBe('2026-10-26');
    expect(weekdayNameOfDate(w[0])).toBe('Segunda');
  });
});

describe('formatadores e validadores', () => {
  it('dd/mm/aaaa e 24 h', () => {
    expect(fmtDatePT('2026-10-25')).toBe('25/10/2026');
    expect(fmtDatePT('lixo')).toBe('—');
    expect(fmtDateTimePT('2026-10-30', '23:30')).toBe('30/10/2026 às 23:30');
    expect(fmtDateTimePT('2026-10-30', null)).toBe('30/10/2026');
  });
  it('isDateIso / isTimeHHMM', () => {
    expect(isDateIso('2026-10-25')).toBe(true);
    expect(isDateIso('25/10/2026')).toBe(false);
    expect(isTimeHHMM('23:30')).toBe(true);
    expect(isTimeHHMM('24:00')).toBe(false);
    expect(isTimeHHMM('23:60')).toBe(false);
  });
});
