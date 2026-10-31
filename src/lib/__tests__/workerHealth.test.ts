import { describe, expect, it } from 'vitest';
import { cronHealthLines } from '../ai';

/* v1.19.0 (P3): o diagnóstico do cron passa a distinguir três estados —
   sem heartbeat, vivo, vivo mas com uma tarefa a falhar (Worker 2.10.0). */
describe('cronHealthLines (Suporte → Diagnóstico)', () => {
  it('sem heartbeat avisa que o Worker pode ser antigo', () => {
    const lines = cronHealthLines(undefined);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/Sem heartbeat do cron/);
    expect(cronHealthLines(null)[0]).toMatch(/Sem heartbeat/);
    expect(cronHealthLines({})[0]).toMatch(/Sem heartbeat/);
  });

  it('cron vivo e saudável', () => {
    const lines = cronHealthLines({ ageMinutes: 3, version: '2.10.0', ok: true });
    expect(lines[0]).toBe('✓ Cron vivo (fila SMS, lembretes, estados) — última execução há 3 min, v2.10.0.');
    expect(lines.some((l) => l.startsWith('✓ As tarefas'))).toBe(true);
    expect(lines.some((l) => l.includes('✗'))).toBe(false);
  });

  it('cron sem pulsar há muito tempo', () => {
    const lines = cronHealthLines({ ageMinutes: 120, version: '2.10.0', ok: true });
    expect(lines[0]).toMatch(/✗ Cron SEM pulsar há 120 min/);
    expect(lines[0]).toMatch(/Triggers/);
  });

  it('P3 — o pulso existe mas UMA tarefa falha (o caso que era invisível)', () => {
    const lines = cronHealthLines({
      ageMinutes: 2, version: '2.10.0', ok: false, error: 'contributions: runQuery contributions: 400',
    });
    expect(lines[0]).toMatch(/✓ Cron vivo/);
    expect(lines[1]).toBe('✗ O cron está a correr, mas uma tarefa falha: contributions: runQuery contributions: 400.');
    expect(lines[2]).toMatch(/cada tarefa corre isolada/i);
  });

  it('erro ausente não rebenta', () => {
    const lines = cronHealthLines({ ageMinutes: 1, ok: false });
    expect(lines[1]).toMatch(/sem detalhe/);
  });

  it('mostra a contagem da última execução quando o Worker a envia', () => {
    const lines = cronHealthLines({
      ageMinutes: 1, ok: true, counts: { outbox: 2, contributions: 1, reminders: 0, events: 3 },
    });
    expect(lines[lines.length - 1]).toBe('· Última execução: fila 2 · contribuições 1 · lembretes 0 · eventos 3.');
  });

  it('Worker antigo (sem ok/counts) continua a dar o essencial', () => {
    const lines = cronHealthLines({ ageMinutes: 5, version: '2.9.1' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/✓ Cron vivo/);
  });
});
