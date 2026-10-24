import { describe, expect, it } from 'vitest';
import { aggregateByMonth, sumYear, yearsPresent, cardYears } from '../finance';

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

describe('cardYears (colunas do cartão de membro)', () => {
  it('inclui anos de dízimos LEGADOS (month nome + year, sem referenceYear)', () => {
    const legacy = [{ month: 'Janeiro', year: 2025, amount: 70000 }];
    expect(cardYears({ tithes: legacy })).toEqual([2025]);
  });
  it('inclui anos de dízimos com referenceMonth numérico', () => {
    const numeric = [{ referenceMonth: '3' as any, referenceYear: 2026, amount: 5000 }];
    expect(cardYears({ tithes: numeric })).toEqual([2026]);
    expect(aggregateByMonth(numeric, 2026)['03']).toEqual({ total: 5000, count: 1 });
  });
  it('donativos sem referenceYear: usa o ano da data ISO', () => {
    expect(cardYears({ donations: [{ date: '2024-06-10', amount: 100 }] })).toEqual([2024]);
  });
  it('une comunhão, donativos, dízimos e renovações; máx. 4, crescente', () => {
    const ys = cardYears({
      communions: [{ year: 2026 }],
      donations: [{ referenceYear: 2025, amount: 1 }],
      tithes: [{ month: 'Março', year: 2022, amount: 1 }],
      renewals: [{ date: '2023-01-15' }, { date: '2021-01-15' }],
    });
    // 5 anos presentes → o mais antigo (2021) cai; ordem crescente
    expect(ys).toEqual([2022, 2023, 2025, 2026]);
  });
  it('sem registos: só o ano corrente', () => {
    expect(cardYears({})).toEqual([new Date().getFullYear()]);
  });
});
