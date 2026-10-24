import { db } from './firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Member } from '../types';
import { normalizePhoneAO } from './phone';

export const CANCEL_WINDOW_MS = 10 * 60 * 1000; // 10 minutos para cancelar/substituir

const dayKey = (now = Date.now()) => {
  const d = new Date(now + 60 * 60 * 1000); // Luanda UTC+1, coerente com o Worker
  return d.toISOString().slice(0, 10);
};

/**
 * Notifica um membro: SEMPRE notificação no sistema + fila externa (SMS/WA)
 * com janela de cancelamento de 10 min. Se já existir mensagem PENDENTE na
 * janela para o mesmo (membro, kind, refId), o corpo é SUBSTITUÍDO e a janela
 * reinicia — nunca sai uma segunda mensagem por correcção dentro da janela.
 */
export async function notifyMember(opts: {
  member: Member;
  kind: string;
  title: string;
  body: string;
  refId?: string | null;
  byEmail: string;
  now?: number;
}): Promise<{ outboxId: string | null; replaced: boolean }> {
  const now = opts.now ?? Date.now();
  const email = opts.member.email || null;

  // 1) canal sistema: sempre (se o membro tiver conta, verá no sino)
  if (email) {
    await addDoc(collection(db, 'notifications'), {
      userEmail: email,
      kind: opts.kind,
      title: opts.title,
      body: opts.body,
      read: false,
      createdAt: now,
      refId: opts.refId || null,
    });
  }

  // 2) fila externa com janela de cancelamento
  const phone = normalizePhoneAO(opts.member.phone);
  const accepts = opts.member.acceptsMessages !== false;
  const pending = await getDocs(
    query(
      collection(db, 'message_outbox'),
      where('memberId', '==', opts.member.id),
      where('status', '==', 'pending')
    )
  );
  const replaceable = pending.docs.find((d) => {
    const x = d.data() as any;
    return x.kind === opts.kind && x.refId === (opts.refId || null) && x.cancelUntil > now;
  });

  if (replaceable) {
    await updateDoc(replaceable.ref, { body: opts.body, cancelUntil: now + CANCEL_WINDOW_MS, updatedAt: now });
    return { outboxId: replaceable.id, replaced: true };
  }

  const ref = await addDoc(collection(db, 'message_outbox'), {
    memberId: opts.member.id,
    memberEmail: email,
    memberName: opts.member.name,
    phone,
    acceptsMessages: accepts,
    kind: opts.kind,
    body: opts.body,
    smsState: 'pending',
    waState: 'pending',
    status: 'pending',
    cancelUntil: now + CANCEL_WINDOW_MS,
    dedupeDay: dayKey(now),
    campaignId: null,
    refId: opts.refId || null,
    createdAt: now,
    updatedAt: now,
  });
  return { outboxId: ref.id, replaced: false };
}

/** Cancela uma mensagem ainda dentro da janela (botão «Cancelar envio»). */
export async function cancelOutbox(id: string): Promise<void> {
  await updateDoc(doc(db, 'message_outbox', id), {
    status: 'done',
    smsState: 'cancelled',
    waState: 'cancelled',
    updatedAt: Date.now(),
  });
}
