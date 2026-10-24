/**
 * Helpers puros de agregação financeira — testados em src/lib/__tests__/finance.test.ts.
 * Extraídos dos componentes para que o cálculo (dízimos/donativos por mês e por
 * ano) tenha uma única fonte de verdade.
 */
export interface MoneyRow {
  referenceMonth?: string;
  referenceYear?: number;
  amount?: number;
}

export interface MonthAgg {
  total: number;
  count: number;
}

const normMonth = (m?: string): string => {
  const s = String(m ?? '').trim();
  const n = Number(s);
  if (!s) return '';
  if (!Number.isNaN(n) && n >= 1 && n <= 12) return String(n).padStart(2, '0');
  return s; // ex.: "Janeiro" — quem chama decide o mapeamento
};

/** Soma e conta registos por mês ('01'..'12') para um ano. */
export function aggregateByMonth(rows: MoneyRow[], year: number): Record<string, MonthAgg> {
  const out: Record<string, MonthAgg> = {};
  for (const r of rows) {
    if (r.referenceYear !== year) continue;
    const mi = normMonth(r.referenceMonth);
    if (!mi) continue;
    const cur = (out[mi] ||= { total: 0, count: 0 });
    cur.total += Number(r.amount) || 0;
    cur.count += 1;
  }
  return out;
}

/** Total anual de um conjunto de registos.
 *  Registos sem mês referência são ignorados — coerente com as tabelas do
 *  cartão, que só têm linhas de mês (um total que incluísse «sem mês» não
 *  bateria com a soma das linhas). */
export function sumYear(rows: MoneyRow[], year: number): number {
  return rows.reduce(
    (acc, r) => (r.referenceYear === year && normMonth(r.referenceMonth) ? acc + (Number(r.amount) || 0) : acc),
    0
  );
}

/** Anos presentes nos registos (ordem crescente, máx. `max` colunas). */
export function yearsPresent(rows: MoneyRow[], max = 4): number[] {
  const ys = new Set<number>();
  for (const r of rows) if (r.referenceYear) ys.add(r.referenceYear);
  return [...ys].sort((a, b) => a - b).slice(-max);
}
