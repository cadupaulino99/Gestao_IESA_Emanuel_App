import { describe, expect, it } from 'vitest';
import {
  normalizeAnnouncement, isAnnouncementVisible, isAnnouncementExpired, sortAnnouncementsForMembers,
  normalizeEvent, isEventPast, isEventVisibleToMembers, digestTitle, digestBody, digestDocId,
  eventChangesForNotification,
} from '../board';

describe('avisos — normalização e visibilidade', () => {
  it('legado active:true ⇒ publicado; active:false ⇒ arquivado', () => {
    expect(normalizeAnnouncement({ id: '1', title: 'T', content: 'C', active: true, createdAt: 1, adminId: 'a' }).status).toBe('publicado');
    expect(normalizeAnnouncement({ id: '1', title: 'T', content: 'C', active: false, createdAt: 1, adminId: 'a' }).status).toBe('arquivado');
  });
  it('legado sem contentHtml ⇒ html gerado a partir de content (saneado)', () => {
    const a = normalizeAnnouncement({ id: '1', title: 'T', content: 'linha1\nlinha2<script>x</script>', active: true, createdAt: 1, adminId: 'a' });
    expect(a.html).toContain('linha1<br>linha2');
    expect(a.html).not.toContain('script');
  });
  it('«visível até»: dentro do prazo vê-se, fora some mas não é apagado', () => {
    const a = normalizeAnnouncement({ id: '1', title: 'T', content: 'C', active: true, createdAt: 1, adminId: 'a', status: 'publicado', visibleUntil: '2026-10-30' });
    expect(isAnnouncementVisible(a, '2026-10-25')).toBe(true);
    expect(isAnnouncementVisible(a, '2026-10-30')).toBe(true);   // o próprio dia ainda conta
    expect(isAnnouncementVisible(a, '2026-10-31')).toBe(false);
    expect(isAnnouncementExpired(a, '2026-10-31')).toBe(true);   // arquivo da Administração
  });
  it('rascunho nunca é visível aos membros', () => {
    const d = normalizeAnnouncement({ id: '1', title: 'T', content: 'C', active: true, createdAt: 1, adminId: 'a', status: 'rascunho' });
    expect(isAnnouncementVisible(d, '2026-10-25')).toBe(false);
  });
  it('ordem dos membros: fixados, urgentes, mais recentes', () => {
    const base = { id: '0', title: '', content: '', active: true, createdAt: 0, adminId: 'a' };
    const list = [
      normalizeAnnouncement({ ...base, id: 'velho', title: 'V', createdAt: 100 }),
      normalizeAnnouncement({ ...base, id: 'novo', title: 'N', createdAt: 300 }),
      normalizeAnnouncement({ ...base, id: 'urg', title: 'U', createdAt: 200, level: 'urgente' }),
      normalizeAnnouncement({ ...base, id: 'pin', title: 'P', createdAt: 50, pinned: true }),
    ];
    expect(sortAnnouncementsForMembers(list).map((a) => a.id)).toEqual(['pin', 'urg', 'novo', 'velho']);
  });
});

describe('eventos — normalização, visíveis e passados', () => {
  it('legado (só date/time/description) ⇒ marcado e publicado', () => {
    const e = normalizeEvent({ id: '1', title: 'T', date: '2026-11-01', time: '18:30', description: 'D' });
    expect(e.status).toBe('marcado');
    expect(e.publishStatus).toBe('publicado');
    expect(isEventVisibleToMembers(e)).toBe(true);
    expect(e.html).toContain('D');
  });
  it('rascunho não é visível; realizado/data passada ⇒ «Passados»', () => {
    const draft = normalizeEvent({ id: '1', title: 'T', date: '2026-11-01', publishStatus: 'rascunho' });
    expect(isEventVisibleToMembers(draft)).toBe(false);
    const done = normalizeEvent({ id: '2', title: 'T', date: '2026-12-01', status: 'realizado' });
    expect(isEventPast(done, '2026-10-25')).toBe(true);
    const old = normalizeEvent({ id: '3', title: 'T', date: '2026-10-20', status: 'marcado' });
    expect(isEventPast(old, '2026-10-25')).toBe(true);
    const next = normalizeEvent({ id: '4', title: 'T', date: '2026-10-30', status: 'adiado' });
    expect(isEventPast(next, '2026-10-25')).toBe(false); // adiado continua nos próximos, com destaque
  });
  it('mudanças que notificam: data, estado, local (e nada mais)', () => {
    const before = normalizeEvent({ id: '1', title: 'T', date: '2026-11-01', time: '18:30', location: 'Templo', status: 'marcado' });
    expect(eventChangesForNotification(before, { ...before, date: '2026-11-08' })).toContain('alterado para 08/11/2026 às 18:30');
    expect(eventChangesForNotification(before, { ...before, status: 'adiado' })).toBe('está adiado');
    expect(eventChangesForNotification(before, { ...before, location: 'Salão' })).toBe('local: Salão');
    expect(eventChangesForNotification(before, { ...before, responsible: 'Ir. João' })).toBeNull();
    expect(eventChangesForNotification(null, before)).toBeNull();
  });
});

describe('digest (máx. 1 notificação/dia/membro)', () => {
  it('título único vs agregado', () => {
    expect(digestTitle(1)).toBe('Novidade em Avisos e Eventos');
    expect(digestTitle(3)).toBe('3 novidades em Avisos e Eventos');
  });
  it('corpo lista os itens do dia', () => {
    expect(digestBody([
      { kind: 'aviso', refId: 'a', label: 'Novo aviso: Jejum', at: 1 },
      { kind: 'evento', refId: 'b', label: 'Novo evento: Conferência', at: 2 },
    ])).toBe('• Novo aviso: Jejum\n• Novo evento: Conferência');
  });
  it('ID determinístico por dia e membro', () => {
    expect(digestDocId('2026-10-25', 'm1')).toBe('board-2026-10-25-m1');
  });
});
