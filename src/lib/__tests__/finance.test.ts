import { describe, expect, it } from 'vitest';
import { aggregateByMonth, sumYear, yearsPresent } from '../finance';

const rows = [
  { referenceMonth: '01', referenceYear: 2024, amount: 500 },
  { referenceMonth: '01', referenceYear: 2024, amount: 250 },
  { referenceMonth: '03', referenceYear: 2024, amount: 1000 },
  { referenceMonth: '03', referenceYear: 2023, amount: 700 },
  { referenceMonth: '1', referenceYear: 2024, amount: 50 }, // mês sem zero à esquerda
  { referenceYear: 2024, amount: 999 }, // sem mês: ignorado
];

describe('aggregateByMonth', () => {
  it('soma e conta por mês do ano pedido', () => {
    const agg = aggregateByMonth(rows, 2024);
    expect(agg['01']).toEqual({ total: 800, count: 3 }); // 500+250+50 ('1' normalizado)
    expect(agg['03']).toEqual({ total: 1000, count: 1 });
  });
  it('normaliza meses sem zero à esquerda', () => {
    expect(aggregateByMonth(rows, 2024)['01'].count).toBe(3);
  });
  it('ignora outros anos', () => {
    expect(aggregateByMonth(rows, 2023)['03']).toEqual({ total: 700, count: 1 });
    expect(aggregateByMonth(rows, 2025)).toEqual({});
  });
});

describe('sumYear', () => {
  it('total anual ignora registos sem mês', () => {
    expect(sumYear(rows, 2024)).toBe(500 + 250 + 1000 + 50);
    expect(sumYear(rows, 2023)).toBe(700);
  });
});

describe('yearsPresent', () => {
  it('devolve anos crescentes e limita colunas', () => {
    expect(yearsPresent(rows)).toEqual([2023, 2024]);
    expect(yearsPresent([{ referenceYear: 2030 }, { referenceYear: 2029 }, { referenceYear: 2028 }, { referenceYear: 2027 }, { referenceYear: 2026 }], 2)).toEqual([2029, 2030]);
  });
});
