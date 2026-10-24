import { describe, expect, it } from 'vitest';
import { computeStatus, fillTemplate, smsSegments, placeholdersIn } from '../contrib';
import { normalizePhoneAO, duplicatePhones, phoneError } from '../phone';

const DAY = 86400000;
const now = Date.now();

describe('computeStatus', () => {
  it('pagamentos completos → concluída', () => {
    expect(computeStatus({ status: 'em_curso', dueDate: '2030-01-01' } as any, 10000, 10000, now)).toBe('concluida');
    expect(computeStatus({ status: 'em_curso', dueDate: '2030-01-01' } as any, 9999.997, 10000, now)).toBe('concluida');
  });
  it('prazo passado e incompleta → em atraso', () => {
    const past = new Date(now - 2 * DAY).toISOString().slice(0, 10);
    expect(computeStatus({ status: 'em_curso', dueDate: past } as any, 3000, 10000, now)).toBe('em_atraso');
  });
  it('dentro do prazo → em curso', () => {
    const future = new Date(now + 2 * DAY).toISOString().slice(0, 10);
    expect(computeStatus({ status: 'em_curso', dueDate: future } as any, 3000, 10000, now)).toBe('em_curso');
  });
  it('fecho manual é definitivo até reabertura', () => {
    expect(computeStatus({ status: 'concluida', dueDate: '2030-01-01' } as any, 0, 10000, now)).toBe('concluida');
  });
});

describe('fillTemplate (marcadores)', () => {
  it('substitui tudo', () => {
    const r = fillTemplate('Olá {nome}, falta {valor_em_falta} para {descricao} até {prazo}.', {
      nome: 'Ana', valor_em_falta: '5.000 Kz', descricao: 'Templo', prazo: '30/11/2026',
    });
    expect(r.text).toBe('Olá Ana, falta 5.000 Kz para Templo até 30/11/2026.');
    expect(r.missing).toEqual([]);
  });
  it('marca marcadores sem valor (bloqueia envio)', () => {
    const r = fillTemplate('Olá {nome}, valor {valor}.', { nome: 'Ana' });
    expect(r.missing).toEqual(['{valor}']);
  });
  it('lista marcadores presentes', () => {
    expect(placeholdersIn('a {nome} b {prazo} c')).toEqual(['{nome}', '{prazo}']);
  });
});

describe('smsSegments', () => {
  it('160 = 2 partes (153 por parte)', () => {
    expect(smsSegments('x'.repeat(153))).toBe(1);
    expect(smsSegments('x'.repeat(154))).toBe(2);
  });
});

describe('normalizePhoneAO', () => {
  it('aceita formatos locais e com 244', () => {
    expect(normalizePhoneAO('923 000 000')).toBe('+244923000000');
    expect(normalizePhoneAO('244923000000')).toBe('+244923000000');
    expect(normalizePhoneAO('+244 923 000 000')).toBe('+244923000000');
  });
  it('rejeita não-móveis e curtas', () => {
    expect(normalizePhoneAO('222 000 000')).toBeNull();
    expect(normalizePhoneAO('923 000')).toBeNull();
    expect(phoneError('923 000 000')).toBeNull();
    expect(phoneError('123')).not.toBeNull();
  });
  it('duplicatePhones apanha o mesmo número em dois membros', () => {
    const d = duplicatePhones([
      { id: 'a', name: 'Ana', phone: '923 000 000' },
      { id: 'b', name: 'Beto', phone: '+244923000000' },
      { id: 'c', name: 'Cia', phone: '921 111 111' },
    ]);
    expect(d.length).toBe(1);
    expect(d[0][1].map((x) => x.id)).toEqual(['a', 'b']);
  });
});
