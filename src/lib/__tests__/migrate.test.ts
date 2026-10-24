import { describe, expect, it } from 'vitest';
import { migrateTitheDoc, codeForSeq } from '../migrate';

describe('migrateTitheDoc (idempotente)', () => {
  it('legado em nomes: entrega = cashier, referência = reference', () => {
    const patch = migrateTitheDoc({
      month: 'Fevereiro', year: 2026,
      cashierMonth: 'Fevereiro', cashierYear: 2026,
      referenceMonth: 'Janeiro', referenceYear: 2026,
    });
    expect(patch).toMatchObject({
      deliveryMonth: '02', deliveryYear: 2026,
      month: '02', year: 2026, cashierMonth: '02', cashierYear: 2026,
      referenceMonth: '01', referenceYear: 2026,
    });
  });
  it('sem referência explícita: referência = mês', () => {
    const patch = migrateTitheDoc({ month: 'Março', year: 2025 });
    expect(patch).toMatchObject({ deliveryMonth: '03', referenceMonth: '03', referenceYear: 2025 });
  });
  it('já migrado → null (pode correr duas vezes)', () => {
    const doc = { deliveryMonth: '02', deliveryYear: 2026, month: '02', year: 2026, cashierMonth: '02', cashierYear: 2026, referenceMonth: '01', referenceYear: 2026 };
    expect(migrateTitheDoc(doc)).toBeNull();
  });
});

describe('codeForSeq', () => {
  it('M-0001, M-0042…', () => {
    expect(codeForSeq(1)).toBe('M-0001');
    expect(codeForSeq(42)).toBe('M-0042');
  });
});
