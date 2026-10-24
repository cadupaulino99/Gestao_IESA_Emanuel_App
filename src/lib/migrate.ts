import { toMonthIdx } from './months';

/**
 * Migração v1.9.3 — duas datas no dízimo + meses canónicos + IDs internos.
 * Funções PURBAS (testadas): devolvem o patch a aplicar, ou null se o documento
 * já estiver migrado (idempotente — pode correr várias vezes).
 */
export interface TitheDoc {
  deliveryMonth?: string;
  deliveryYear?: number;
  cashierMonth?: string;
  cashierYear?: number;
  month?: string;
  year?: number;
  referenceMonth?: string;
  referenceYear?: number;
}

export function migrateTitheDoc(t: TitheDoc): Record<string, unknown> | null {
  const dm = toMonthIdx(t.deliveryMonth);
  const dy = Number(t.deliveryYear ?? t.cashierYear ?? t.year ?? 0);
  const rm = toMonthIdx(t.referenceMonth) || toMonthIdx(t.month);
  const ry = Number(t.referenceYear ?? t.year ?? 0);

  const already =
    dm !== '' &&
    Number(t.deliveryYear) > 0 &&
    rm !== '' &&
    String(t.referenceMonth) === rm &&
    String(t.month) === dm &&
    String(t.cashierMonth) === dm &&
    Number(t.year) === dy &&
    Number(t.cashierYear) === dy;
  if (already) return null;

  return {
    deliveryMonth: dm || toMonthIdx(t.month),
    deliveryYear: dy,
    month: dm || toMonthIdx(t.month),
    year: dy,
    cashierMonth: dm || toMonthIdx(t.month),
    cashierYear: dy,
    referenceMonth: rm,
    referenceYear: ry,
  };
}

/** Próximo código interno a partir da maior sequência existente. */
export function codeForSeq(seq: number): string {
  return `M-${String(seq).padStart(4, '0')}`;
}
