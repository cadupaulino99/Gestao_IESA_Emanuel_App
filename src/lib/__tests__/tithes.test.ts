import { describe, expect, it } from 'vitest';
import { classifyTitheDuplicate, deliveryOf, referenceOf, describeTithe } from '../tithes';
import { toMonthIdx } from '../months';

const T = (over: any = {}) => ({ id: 'x', memberId: 'm1', memberName: 'A', amount: 1000, ...over } as any);

describe('toMonthIdx (unificação legado nome → número)', () => {
  it('nomes, siglas e números', () => {
    expect(toMonthIdx('Janeiro')).toBe('01');
    expect(toMonthIdx('Março')).toBe('03');
    expect(toMonthIdx('Dezembro')).toBe('12');
    expect(toMonthIdx('Fev')).toBe('02');
    expect(toMonthIdx(3)).toBe('03');
    expect(toMonthIdx('07')).toBe('07');
    expect(toMonthIdx('nada')).toBe('');
  });
});

describe('deliveryOf / referenceOf (as duas datas)', () => {
  it('documento novo usa os campos canónicos', () => {
    const t = T({ deliveryMonth: '02', deliveryYear: 2026, referenceMonth: '01', referenceYear: 2026 });
    expect(deliveryOf(t)).toEqual({ month: '02', year: 2026 });
    expect(referenceOf(t)).toEqual({ month: '01', year: 2026 });
  });
  it('legado: entrega = cashier → month (nome); referência = reference → month', () => {
    const t = T({ month: 'Fevereiro', year: 2026, cashierMonth: 'Fevereiro', cashierYear: 2026, referenceMonth: 'Janeiro', referenceYear: 2026 });
    expect(deliveryOf(t)).toEqual({ month: '02', year: 2026 });
    expect(referenceOf(t)).toEqual({ month: '01', year: 2026 });
  });
  it('exemplo do utilizador: Janeiro entregue em Fevereiro', () => {
    const t = T({ deliveryMonth: '02', deliveryYear: 2026, referenceMonth: '01', referenceYear: 2026 });
    expect(deliveryOf(t).month).toBe('02');   // contabilidade de Fevereiro
    expect(referenceOf(t).month).toBe('01');  // cartão em Janeiro
  });
});

describe('classifyTitheDuplicate', () => {
  const inc = { memberId: 'm1', referenceMonth: '03', referenceYear: 2026, amount: 500, deliveryMonth: '03', deliveryYear: 2026 };
  it('sem conflitos → ok', () => {
    expect(classifyTitheDuplicate([], inc).level).toBe('ok');
    expect(classifyTitheDuplicate([T({ referenceMonth: '04', referenceYear: 2026 })], inc).level).toBe('ok');
  });
  it('mesma referência, valor ou entrega diferentes → warn (prestação)', () => {
    const prev = T({ referenceMonth: '03', referenceYear: 2026, amount: 300, deliveryMonth: '03', deliveryYear: 2026 });
    const r = classifyTitheDuplicate([prev], inc);
    expect(r.level).toBe('warn');
    expect(r.conflict?.id).toBe('x');
  });
  it('tudo igual → block', () => {
    const prev = T({ referenceMonth: '03', referenceYear: 2026, amount: 500, deliveryMonth: '03', deliveryYear: 2026 });
    expect(classifyTitheDuplicate([prev], inc).level).toBe('block');
  });
  it('descreve o conflito para o aviso', () => {
    const prev = T({ referenceMonth: '03', referenceYear: 2026, amount: 500, deliveryMonth: '02', deliveryYear: 2026, receiptNumber: 'R-1' });
    expect(describeTithe(prev)).toContain('ref. 03/2026');
    expect(describeTithe(prev)).toContain('entregue 02/2026');
  });
});
