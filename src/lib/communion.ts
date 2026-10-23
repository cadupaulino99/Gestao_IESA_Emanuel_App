import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { CommunionMark } from '../types';

/** Marcas de comunhão de um membro (todas os anos). */
export async function fetchCommunion(memberId: string): Promise<CommunionMark[]> {
  const snap = await getDocs(query(collection(db, 'communions'), where('memberId', '==', memberId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunionMark);
}

/**
 * Roda a marca de um mês:  vazio → 'present' (✓) → 'absent' (✗) → vazio.
 * No papel a casa levava a assinatura do pastor; aqui guarda-se quem marcou
 * (`recordedBy`) — a «assinatura» digital.
 */
export async function cycleCommunionMark(
  memberId: string,
  year: number,
  month: string,
  existing: CommunionMark | undefined,
  email: string
): Promise<void> {
  if (!existing) {
    await addDoc(collection(db, 'communions'), {
      memberId, year, month, mark: 'present', recordedBy: email || 'unknown', createdAt: Date.now(),
    });
  } else if (existing.mark === 'present') {
    await updateDoc(doc(db, 'communions', existing.id), { mark: 'absent', recordedBy: email || 'unknown' });
  } else if (existing.mark === 'absent') {
    await deleteDoc(doc(db, 'communions', existing.id));
  } else {
    await updateDoc(doc(db, 'communions', existing.id), { mark: 'present', recordedBy: email || 'unknown' });
  }
}
