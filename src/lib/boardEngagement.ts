import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  query,
  orderBy,
  limit,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export type BoardTarget = { collection: 'events' | 'announcements'; id: string };

export type BoardComment = {
  id: string;
  authorUid: string;
  authorName: string;
  text: string;
  createdAt: number;
};

function engagementRoot(t: BoardTarget) {
  return collection(db, t.collection, t.id, 'likes');
}

function commentsRoot(t: BoardTarget) {
  return collection(db, t.collection, t.id, 'comments');
}

/** Limpa texto de comentário (sem HTML). */
export function sanitizeCommentText(raw: unknown, maxLen = 500): string {
  let s = String(raw ?? '');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export async function fetchLikeState(
  t: BoardTarget,
  uid: string | undefined,
): Promise<{ count: number; likedByMe: boolean }> {
  const snap = await getDocs(engagementRoot(t));
  const count = snap.size;
  const likedByMe = !!uid && snap.docs.some((d) => d.id === uid);
  return { count, likedByMe };
}

export async function toggleLike(
  t: BoardTarget,
  uid: string,
  currentlyLiked: boolean,
): Promise<void> {
  const ref = doc(db, t.collection, t.id, 'likes', uid);
  if (currentlyLiked) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, { uid, createdAt: Date.now() });
  }
}

export async function fetchComments(t: BoardTarget, max = 40): Promise<BoardComment[]> {
  const q = query(commentsRoot(t), orderBy('createdAt', 'asc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const created = data.createdAt;
    let createdAt = Date.now();
    if (typeof created === 'number') createdAt = created;
    else if (created && typeof created === 'object' && 'toMillis' in (created as Timestamp)) {
      createdAt = (created as Timestamp).toMillis();
    }
    return {
      id: d.id,
      authorUid: String(data.authorUid || ''),
      authorName: String(data.authorName || 'Membro'),
      text: String(data.text || ''),
      createdAt,
    };
  });
}

export async function addComment(
  t: BoardTarget,
  input: { uid: string; name: string; text: string },
): Promise<BoardComment> {
  const text = sanitizeCommentText(input.text);
  if (!text) throw new Error('Escreva um comentário.');
  const payload = {
    authorUid: input.uid,
    authorName: input.name.slice(0, 80) || 'Membro',
    text,
    createdAt: Date.now(),
  };
  const ref = await addDoc(commentsRoot(t), payload);
  return { id: ref.id, ...payload };
}

/** Texto para partilha WhatsApp / clipboard. */
export function buildShareText(opts: {
  kind: 'event' | 'announcement';
  title: string;
  when?: string;
  location?: string;
  bodyPlain?: string;
}): string {
  const lines: string[] = [];
  lines.push(opts.kind === 'event' ? '📅 Evento — Igreja Emanuel (Xangongo)' : '📢 Aviso — Igreja Emanuel (Xangongo)');
  lines.push(opts.title);
  if (opts.when) lines.push(`🗓 ${opts.when}`);
  if (opts.location) lines.push(`📍 ${opts.location}`);
  if (opts.bodyPlain) {
    const excerpt = opts.bodyPlain.replace(/\s+/g, ' ').trim().slice(0, 220);
    if (excerpt) lines.push('', excerpt + (opts.bodyPlain.length > 220 ? '…' : ''));
  }
  lines.push('', 'App Gestão IESA Emanuel');
  return lines.join('\n');
}

export function openWhatsAppShare(text: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
