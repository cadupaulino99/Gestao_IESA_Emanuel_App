import {
  db,
} from './firebase';
import {
  collection, getDocs, doc, updateDoc, addDoc, runTransaction, arrayUnion, writeBatch,
} from 'firebase/firestore';
import { Announcement, AgendaItem, ChurchEvent, BoardNotifyLog, Member } from '../types';
import { luandaDayKey, fmtDateTimePT, fmtDatePT } from './luanda';
import { htmlToPlain, sanitizeHtml } from './richtext';
import { CANCEL_WINDOW_MS } from './notify';
import { normalizePhoneAO } from './phone';

/* ═══════════════════════════════════════════════════════════════════════
   «AVISOS, AGENDA E EVENTOS» — lógica partilhada (v1.13.0)
   ───────────────────────────────────────────────────────────────────────
   FONTE ÚNICA: a Administração cria/edita/apaga; o Portal do Membro só LÊ
   as mesmas colecções (announcements, events, agenda_items) — sem cópias.
   Documentos legados (anteriores à v1.13) são tolerados pelos
   normalize*(): active:true ⇒ publicado; sem status ⇒ marcado/publicado.
   A parte pura é testada em __tests__/board.test.ts.
   ═══════════════════════════════════════════════════════════════════════ */

/* ───────────────────────── avisos ───────────────────────── */

export interface NormalizedAnnouncement extends Announcement {
  status: 'rascunho' | 'publicado' | 'arquivado';
  level: 'normal' | 'urgente';
  pinned: boolean;
  visibleUntil: string | null;
  /** Texto formatado eficaz (contentHtml legado ⇒ <p>content</p>). */
  html: string;
}

export function normalizeAnnouncement(raw: any): NormalizedAnnouncement {
  const legacyStatus = raw?.active === false ? 'arquivado' : 'publicado';
  const html = raw?.contentHtml
    ? sanitizeHtml(raw.contentHtml)
    : raw?.content
      ? sanitizeHtml(`<p>${String(raw.content).replace(/\n/g, '<br>')}</p>`)
      : '';
  return {
    ...(raw as Announcement),
    status: raw?.status ?? legacyStatus,
    level: raw?.level === 'urgente' ? 'urgente' : 'normal',
    pinned: raw?.pinned === true,
    visibleUntil: typeof raw?.visibleUntil === 'string' && raw.visibleUntil ? raw.visibleUntil : null,
    html,
  };
}

/** Visível aos membros: publicado E dentro do prazo «visível até» (dia de Luanda). */
export function isAnnouncementVisible(a: NormalizedAnnouncement, dayKey: string): boolean {
  return a.status === 'publicado' && (a.visibleUntil === null || a.visibleUntil >= dayKey);
}

/** Passou do «visível até»: some aos membros, fica no arquivo da Administração. */
export function isAnnouncementExpired(a: NormalizedAnnouncement, dayKey: string): boolean {
  return a.status === 'publicado' && a.visibleUntil !== null && a.visibleUntil < dayKey;
}

/** Ordem dos membros: fixados e urgentes no topo, depois os mais recentes. */
export function sortAnnouncementsForMembers(list: NormalizedAnnouncement[]): NormalizedAnnouncement[] {
  return [...list].sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) ||
    Number(b.level === 'urgente') - Number(a.level === 'urgente') ||
    (b.createdAt || 0) - (a.createdAt || 0));
}

/* ───────────────────────── eventos ───────────────────────── */

export interface NormalizedEvent extends ChurchEvent {
  status: 'marcado' | 'adiado' | 'cancelado' | 'realizado';
  publishStatus: 'rascunho' | 'publicado';
  location: string;
  responsible: string;
  html: string;
}

export function normalizeEvent(raw: any): NormalizedEvent {
  return {
    ...(raw as ChurchEvent),
    status: (['marcado', 'adiado', 'cancelado', 'realizado'] as const).includes(raw?.status) ? raw.status : 'marcado',
    publishStatus: raw?.publishStatus === 'rascunho' ? 'rascunho' : 'publicado',
    location: raw?.location || '',
    responsible: raw?.responsible || '',
    html: raw?.descriptionHtml
      ? sanitizeHtml(raw.descriptionHtml)
      : raw?.description
        ? sanitizeHtml(`<p>${String(raw.description).replace(/\n/g, '<br>')}</p>`)
        : '',
  };
}

export const isEventVisibleToMembers = (e: NormalizedEvent) => e.publishStatus === 'publicado';

/** «Passados»: já realizados OU cuja data (Luanda) já passou. */
export function isEventPast(e: NormalizedEvent, dayKey: string): boolean {
  return e.status === 'realizado' || (!!e.date && e.date < dayKey);
}

export function sortEventsByDate(list: NormalizedEvent[]): NormalizedEvent[] {
  return [...list].sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) ||
    String(a.time || '').localeCompare(String(b.time || '')));
}

/* ───────────────────────── agenda ───────────────────────── */

export function normalizeAgendaItem(raw: any): AgendaItem {
  return {
    ...(raw as AgendaItem),
    weekday: Number(raw?.weekday) || 1,
    cancelledDates: Array.isArray(raw?.cancelledDates) ? raw.cancelledDates.filter((d: any) => typeof d === 'string') : [],
    ativo: raw?.ativo !== false,
  };
}

/* ─────────────────── digest de notificações ───────────────────
   Máx. 1 notificação/dia/membro para este módulo: documento com ID
   determinístico `board-<diaLuanda>-<memberId>` (setDoc merge). Várias
   publicações no mesmo dia são fundidas — «3 novidades em Avisos e
   Eventos». O espelho do dia vive em board_notify_log/<diaLuanda>. */

export interface BoardItem { kind: string; refId: string | null; label: string; at: number }

export function digestTitle(count: number): string {
  return count <= 1 ? 'Novidade em Avisos e Eventos' : `${count} novidades em Avisos e Eventos`;
}

export function digestBody(items: BoardItem[]): string {
  return items.map((i) => `• ${i.label}`).join('\n');
}

/** ID determinístico da notificação-digest (1/dia/membro). */
export const digestDocId = (dayKey: string, memberId: string) => `board-${dayKey}-${memberId}`;

export interface PublishBoardOpts {
  kind: 'aviso' | 'evento' | 'evento_change' | 'lembrete';
  /** Frase curta que aparece no corpo do digest (ex.: «Novo aviso: Jejum»). */
  label: string;
  refId: string | null;
  /** Marcar só quando o administrador pede envio também por SMS/WhatsApp. */
  alsoSms?: boolean;
  byEmail: string;
  now?: number;
}

/** Rótulos prontos para as notificações do módulo. */
export const boardLabels = {
  newAnnouncement: (a: NormalizedAnnouncement) =>
    `${a.level === 'urgente' ? 'Aviso URGENTE' : 'Novo aviso'}: ${a.title}`,
  newEvent: (e: NormalizedEvent) =>
    `Novo evento: ${e.title} — ${fmtDateTimePT(e.date, e.time)}`,
  eventChanged: (e: NormalizedEvent, what: string) =>
    `Evento «${e.title}» ${what}`,
  eventReminder: (e: NormalizedEvent) =>
    `Lembrete: «${e.title}» é amanhã — ${fmtDateTimePT(e.date, e.time)}`,
};

/**
 * Publica uma novidade do módulo: actualiza o log do dia e faz upsert do
 * digest de cada membro com conta (email). `alsoSms` enfileira SMS/WhatsApp
 * UMA vez por dia por membro na fila existente (message_outbox — janela de
 * 10 min, modo manual/fornecedores, tudo como no resto da app).
 */
export async function publishBoardNotification(opts: PublishBoardOpts): Promise<{ notified: number; smsQueued: number }> {
  const now = opts.now ?? Date.now();
  const dayKey = luandaDayKey(now);
  const item: BoardItem = { kind: opts.kind, refId: opts.refId, label: opts.label, at: now };
  const logRef = doc(db, 'board_notify_log', dayKey);

  // 1) log do dia (transacção: itens + contagem)
  const log = await runTransaction(db, async (tx) => {
    const snap = await tx.get(logRef);
    const prev = (snap.exists() ? snap.data() : null) as BoardNotifyLog | null;
    const next: BoardNotifyLog = {
      dayKey,
      items: [...(prev?.items || []), item],
      count: (prev?.count || 0) + 1,
      firstAt: prev?.firstAt || now,
      updatedAt: now,
      smsQueuedFor: prev?.smsQueuedFor || [],
    };
    tx.set(logRef, next);
    return next;
  });

  // 2) membros com conta (email) — lista pequena, filtro no cliente
  const snap = await getDocs(collection(db, 'members'));
  const members = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Member)
    .filter((m) => typeof m.email === 'string' && m.email && m.status !== 'Falecido');

  const title = digestTitle(log.count);
  const body = digestBody(log.items);

  // 3) upsert do digest (1 notificação/dia/membro; read:false — há novidade)
  let notified = 0;
  for (let i = 0; i < members.length; i += 400) {
    const b = writeBatch(db);
    for (const m of members.slice(i, i + 400)) {
      b.set(doc(db, 'notifications', digestDocId(dayKey, m.id)), {
        userEmail: m.email, kind: 'board', title, body,
        read: false, createdAt: log.firstAt, updatedAt: now,
        refId: opts.refId, byEmail: opts.byEmail,
      }, { merge: true });
      notified++;
    }
    await b.commit();
  }

  // 4) fila SMS/WhatsApp (só se marcado; máx. 1/dia/membro — smsQueuedFor)
  let smsQueued = 0;
  if (opts.alsoSms) {
    const already = new Set(log.smsQueuedFor || []);
    for (const m of members) {
      if (already.has(m.id)) continue;
      const phone = normalizePhoneAO(m.phone);
      if (!phone || m.acceptsMessages === false) continue;
      await addDoc(collection(db, 'message_outbox'), {
        memberId: m.id, memberEmail: m.email || null, memberName: m.name,
        phone, acceptsMessages: m.acceptsMessages ?? true, // passou a guarda (=false ficou de fora)
        kind: 'board', body: `${title}\n${body}`,
        smsState: 'pending', waState: 'pending', status: 'pending',
        cancelUntil: now + CANCEL_WINDOW_MS, dedupeDay: dayKey,
        campaignId: null, refId: opts.refId, createdAt: now, updatedAt: now,
      });
      already.add(m.id);
      smsQueued++;
    }
    if (smsQueued > 0) await updateDoc(logRef, { smsQueuedFor: arrayUnion(...[...already]) });
  }
  return { notified, smsQueued };
}

/** Resumo de alterações de evento que merecem notificação (data/estado/local). */
export function eventChangesForNotification(
  before: NormalizedEvent | ChurchEvent | null,
  after: ChurchEvent
): string | null {
  if (!before) return null;
  const parts: string[] = [];
  if (String(before.date || '') !== String(after.date || '') || String(before.time || '') !== String(after.time || '')) {
    parts.push(`alterado para ${fmtDateTimePT(after.date, after.time)}`);
  }
  if (String(before.status || 'marcado') !== String(after.status || 'marcado') && after.status) {
    parts.push(`está ${after.status}`);
  }
  if (String(before.location || '') !== String(after.location || '')) {
    parts.push(`local: ${after.location || '—'}`);
  }
  return parts.length ? parts.join('; ') : null;
}

/** Texto simples de um conteúdo formatado (espelho legado + notificações). */
export const plainOf = (html: string, max = 400) => htmlToPlain(html, max);

/** Data por extenso para etiquetas (ex.: eventos). */
export { fmtDatePT, fmtDateTimePT };
