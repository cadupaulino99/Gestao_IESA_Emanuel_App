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

/* ═══════════════════ v1.19.0 (P3 «Luanda em todo o lado») ═══════════════════ */
import {
  luandaYear, luandaMonth, luandaMonthIdx, luandaDayOfMonth, luandaMonthStr, luandaMonthKey,
  luandaEndOfDay, isoFromParts, luandaDateOf, monthNamePT, luandaMonthNamePT, isCalendarDateIso, isLeapYear,
  fmtTodayPT, fmtTodayTimePT, lastMonthsLuanda, isBirthdayToday, ageToday, normalizeBirthDate,
} from '../luanda';

describe('P3 — hoje/mês/ano de Luanda (não do aparelho, não do UTC)', () => {
  // 25/10/2026 23:30 UTC = 26/10/2026 00:30 em Luanda: o caso que fazia os
  // formulários guardarem a data de ONTEM entre as 00:00 e as 01:00.
  const meiaNoiteLuanda = at(2026, 10, 25, 23, 30);
  it('devolve o dia/mês/ano de Luanda', () => {
    expect(luandaDayKey(meiaNoiteLuanda)).toBe('2026-10-26');
    expect(luandaYear(meiaNoiteLuanda)).toBe(2026);
    expect(luandaMonth(meiaNoiteLuanda)).toBe(10);
    expect(luandaMonthIdx(meiaNoiteLuanda)).toBe(9);
    expect(luandaDayOfMonth(meiaNoiteLuanda)).toBe(26);
    expect(luandaMonthStr(meiaNoiteLuanda)).toBe('10');
    expect(luandaMonthKey(meiaNoiteLuanda)).toBe('2026-10');
  });
  it('muda de ano à meia-noite de Luanda, não à meia-noite UTC', () => {
    const reveillon = at(2026, 12, 31, 23, 30); // 01/01/2027 00:30 em Luanda
    expect(luandaYear(reveillon)).toBe(2027);
    expect(luandaMonth(reveillon)).toBe(1);
    expect(luandaMonthKey(reveillon)).toBe('2027-01');
  });
  it('luandaEndOfDay cobre o dia inteiro de Luanda (prazos de contribuição)', () => {
    const fim = luandaEndOfDay('2026-10-31');
    expect(luandaDayKey(fim)).toBe('2026-10-31');
    expect(luandaDayKey(fim + 1)).toBe('2026-11-01');
    // 23:59:59 de Luanda = 22:59:59 UTC (o Worker usava 23:59:59Z = 00:59 do dia seguinte)
    expect(new Date(fim).toISOString()).toBe('2026-10-31T22:59:59.999Z');
  });
});

describe('P3 — isoFromParts (o bug do Excel/AI: aniversário um dia antes)', () => {
  it('não desloca pelo fuso do aparelho', () => {
    expect(isoFromParts(2000, 1, 1)).toBe('2000-01-01');
    expect(isoFromParts(1998, 7, 31)).toBe('1998-07-31');
    // o código antigo fazia new Date(2000,0,1).toISOString() → '1999-12-31' em UTC+1
    expect(isoFromParts(2000, 1, 1)).not.toBe('1999-12-31');
  });
  it('valida as partes', () => {
    expect(isoFromParts(2000, 13, 1)).toBe('');
    expect(isoFromParts(2000, 0, 1)).toBe('');
    expect(isoFromParts(2000, 1, 32)).toBe('');
    expect(isoFromParts(NaN, 1, 1)).toBe('');
  });
  it('luandaDateOf converte epoch ms em dia de Luanda', () => {
    expect(luandaDateOf(at(2026, 10, 25, 23, 30))).toBe('2026-10-26');
    expect(luandaDateOf(null)).toBe('');
    expect(luandaDateOf(0)).toBe('');
  });
});

describe('P3 — nomes de meses e gráficos dos últimos N meses', () => {
  it('monthNamePT / luandaMonthNamePT', () => {
    expect(monthNamePT(10)).toBe('Outubro');
    expect(monthNamePT(10, true)).toBe('out.');
    expect(monthNamePT(13)).toBe('');
    expect(luandaMonthNamePT(at(2026, 3, 5, 12))).toBe('Março');
  });
  it('lastMonthsLuanda devolve 6 meses, do mais antigo para o corrente', () => {
    const slots = lastMonthsLuanda(6, at(2026, 10, 25, 12));
    expect(slots.map((s) => s.label)).toEqual(['mai./26', 'jun./26', 'jul./26', 'ago./26', 'set./26', 'out./26']);
    expect(slots[5]).toMatchObject({ year: 2026, month: 10, monthStr: '10' });
  });
  it('atravessa o ano sem meses duplicados nem fora de ordem', () => {
    const slots = lastMonthsLuanda(4, at(2027, 1, 15, 12));
    expect(slots.map((s) => `${s.year}-${s.monthStr}`)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
  });
  it('conta = 1 devolve só o mês corrente', () => {
    expect(lastMonthsLuanda(1, at(2026, 10, 25, 12))).toHaveLength(1);
  });
});

describe('P3 — aniversários (Luanda) e normalização de datas de nascimento', () => {
  const hoje = at(2026, 10, 25, 12); // 25/10/2026 em Luanda
  it('isBirthdayToday aceita o formato canónico e o legado DD/MM/AAAA', () => {
    expect(isBirthdayToday('1990-10-25', hoje)).toBe(true);
    expect(isBirthdayToday('25/10/1990', hoje)).toBe(true);
    expect(isBirthdayToday('1990-10-26', hoje)).toBe(false);
    expect(isBirthdayToday('', hoje)).toBe(false);
    expect(isBirthdayToday(null, hoje)).toBe(false);
    expect(isBirthdayToday(undefined, hoje)).toBe(false);
  });
  it('o dia de Luanda decide (23:30 UTC de 24/10 já é 25/10)', () => {
    expect(isBirthdayToday('1990-10-25', at(2026, 10, 24, 23, 30))).toBe(true);
  });
  it('ageToday conta anos completos', () => {
    expect(ageToday('1990-10-25', hoje)).toBe(36);
    expect(ageToday('1990-10-26', hoje)).toBe(35); // ainda não fez anos
    expect(ageToday('1990-01-01', hoje)).toBe(36);
    expect(ageToday('lixo', hoje)).toBe(null);
  });
  it('normalizeBirthDate cobre ISO, dd/mm/aaaa e epoch', () => {
    expect(normalizeBirthDate('1990-10-25')).toBe('1990-10-25');
    expect(normalizeBirthDate('1990-10-25T00:00:00.000Z')).toBe('1990-10-25');
    expect(normalizeBirthDate('25/10/1990')).toBe('1990-10-25');
    expect(normalizeBirthDate('25-10-1990')).toBe('1990-10-25');
    expect(normalizeBirthDate(at(1990, 10, 24, 23, 30))).toBe('1990-10-25');
    expect(normalizeBirthDate('')).toBe('');
  });
});

describe('P3 — apresentação de «hoje» (rodapés de PDF, relatórios)', () => {
  it('fmtTodayPT / fmtTodayTimePT usam Luanda', () => {
    expect(fmtTodayPT(at(2026, 10, 25, 23, 30))).toBe('26/10/2026');
    expect(fmtTodayTimePT(at(2026, 10, 25, 23, 30))).toBe('26/10/2026 00:30');
    expect(fmtTodayTimePT(at(2026, 1, 5, 8, 5))).toBe('05/01/2026 09:05');
  });
});

describe('P3 — datas com calendário válido (não só o formato)', () => {
  it('isCalendarDateIso recusa o que isDateIso aceitava', () => {
    expect(isDateIso('1990-13-45')).toBe(true);       // só o formato
    expect(isCalendarDateIso('1990-13-45')).toBe(false);
    expect(isCalendarDateIso('1990-02-30')).toBe(false);
    expect(isCalendarDateIso('2026-04-31')).toBe(false);
    expect(isCalendarDateIso('1990-10-25')).toBe(true);
    expect(isCalendarDateIso('2024-02-29')).toBe(true);
    expect(isCalendarDateIso('2026-02-29')).toBe(false);
    expect(isCalendarDateIso('0001-01-01')).toBe(false); // antes de 1850
    expect(isCalendarDateIso(null)).toBe(false);
    expect(isCalendarDateIso('25/10/1990')).toBe(false);
  });
  it('isLeapYear', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
  });
  it('isoFromParts valida o dia do mês', () => {
    expect(isoFromParts(1990, 2, 30)).toBe('');
    expect(isoFromParts(2024, 2, 29)).toBe('2024-02-29');
    expect(isoFromParts(2026, 2, 29)).toBe('');
    expect(isoFromParts(2026, 4, 31)).toBe('');
  });
  it('normalizeBirthDate devolve vazio para datas impossíveis', () => {
    expect(normalizeBirthDate('1990-13-45')).toBe('');
    expect(normalizeBirthDate('1990-02-30')).toBe('');
    expect(isBirthdayToday('1990-13-45')).toBe(false);
  });
});
