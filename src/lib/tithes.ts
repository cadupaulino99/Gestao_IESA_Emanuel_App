import { Tithe } from '../types';
import { toMonthIdx } from './months';
import { formatKz } from './money';

/** Data de ENTREGA canónica de um lançamento (legado: cashier → month). */
export function deliveryOf(t: Tithe): { month: string; year: number } {
  const m = toMonthIdx(t.deliveryMonth) || toMonthIdx(t.cashierMonth as any) || toMonthIdx(t.month as any);
  const y = Number(t.deliveryYear ?? t.cashierYear ?? t.year ?? 0);
  return { month: m, year: y };
}

/** Mês de REFERÊNCIA canónico (o que aparece no cartão do membro). */
export function referenceOf(t: Tithe): { month: string; year: number } {
  const m = toMonthIdx(t.referenceMonth) || toMonthIdx(t.month as any);
  const y = Number(t.referenceYear ?? t.year ?? 0);
  return { month: m, year: y };
}

export interface IncomingTithe {
  memberId: string;
  referenceMonth: string;
  referenceYear: number;
  amount: number;
  deliveryMonth: string;
  deliveryYear: number;
}

export type DuplicateLevel = 'ok' | 'warn' | 'block';

/**
 * Duplicidade de dízimos (regra do utilizador, 2026-10-24):
 *  - block: mesmo membro + mês ref + valor + data de entrega → registo idêntico;
 *  - warn:  mesmo membro + mês ref (valor ou entrega diferentes) → pode ser
 *           prestação; exige confirmação explícita mostrando o anterior;
 *  - ok:    sem conflito.
 * Função pura — testada em __tests__/tithes.test.ts.
 */
export function classifyTitheDuplicate(
  existing: Tithe[],
  incoming: IncomingTithe
): { level: DuplicateLevel; conflict?: Tithe } {
  const sameRef = existing.filter((t) => {
    const r = referenceOf(t);
    return r.month === incoming.referenceMonth && r.year === incoming.referenceYear;
  });
  if (sameRef.length === 0) return { level: 'ok' };
  const exact = sameRef.find((t) => {
    const d = deliveryOf(t);
    return (
      Math.abs((Number(t.amount) || 0) - incoming.amount) < 0.005 &&
      d.month === incoming.deliveryMonth &&
      d.year === incoming.deliveryYear
    );
  });
  if (exact) return { level: 'block', conflict: exact };
  return { level: 'warn', conflict: sameRef[0] };
}

export function describeTithe(t: Tithe): string {
  const r = referenceOf(t);
  const d = deliveryOf(t);
  return `ref. ${r.month}/${r.year}, entregue ${d.month}/${d.year}, valor ${formatKz(Number(t.amount) || 0)}, recibo ${t.receiptNumber || 's/ nº'}`;
}
