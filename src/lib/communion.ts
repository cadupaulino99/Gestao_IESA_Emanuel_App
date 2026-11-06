import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { CommunionMark } from '../types';

/** Marcas de comunhão de um membro (todos os anos). */
export async function fetchCommunion(memberId: string): Promise<CommunionMark[]> {
  const snap = await getDocs(query(collection(db, 'communions'), where('memberId', '==', memberId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunionMark);
}

/** Todas as marcas de comunhão de um mês (AAAA + mês '01'..'12'). */
export async function fetchCommunionsForMonth(year: number, month: string): Promise<CommunionMark[]> {
  const snap = await getDocs(
    query(collection(db, 'communions'), where('year', '==', year), where('month', '==', month)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommunionMark);
}

/**
 * Roda a marca de um mês:  vazio → 'present' (✓) → 'absent' (✗) → vazio.
 */
export async function cycleCommunionMark(
  memberId: string,
  year: number,
  month: string,
  existing: CommunionMark | undefined,
  email: string,
  memberEmail?: string | null,
): Promise<void> {
  if (!existing) {
    await addDoc(collection(db, 'communions'), {
      memberId,
      year,
      month,
      mark: 'present',
      recordedBy: email || 'unknown',
      memberEmail: memberEmail || null,
      createdAt: Date.now(),
    });
  } else if (existing.mark === 'present') {
    await updateDoc(doc(db, 'communions', existing.id), {
      mark: 'absent',
      recordedBy: email || 'unknown',
    });
  } else if (existing.mark === 'absent') {
    await deleteDoc(doc(db, 'communions', existing.id));
  } else {
    await updateDoc(doc(db, 'communions', existing.id), {
      mark: 'present',
      recordedBy: email || 'unknown',
    });
  }
}

/** Define explicitamente a presença na comunhão do mês (ou limpa o registo). */
export async function setCommunionMark(opts: {
  memberId: string;
  year: number;
  month: string;
  mark: 'present' | 'absent' | null;
  existing?: CommunionMark;
  email: string;
  memberEmail?: string | null;
}): Promise<void> {
  const { memberId, year, month, mark, existing, email, memberEmail } = opts;
  if (mark === null) {
    if (existing?.id) await deleteDoc(doc(db, 'communions', existing.id));
    return;
  }
  if (!existing) {
    await addDoc(collection(db, 'communions'), {
      memberId,
      year,
      month,
      mark,
      recordedBy: email || 'unknown',
      memberEmail: memberEmail || null,
      createdAt: Date.now(),
    });
    return;
  }
  if (existing.mark !== mark) {
    await updateDoc(doc(db, 'communions', existing.id), {
      mark,
      recordedBy: email || 'unknown',
    });
  }
}

export type GenderBucket = 'M' | 'F' | 'O';

export function normalizeGender(g?: string | null): GenderBucket {
  const s = String(g || '')
    .trim()
    .toLowerCase();
  if (!s) return 'O';
  if (/^(m|masc|masculino|homem|male)$/.test(s) || s.startsWith('masc')) return 'M';
  if (/^(f|fem|feminino|mulher|female)$/.test(s) || s.startsWith('fem')) return 'F';
  return 'O';
}

export type CommunionMonthStats = {
  totalMembers: number;
  present: { M: number; F: number; O: number; total: number };
  absent: { M: number; F: number; O: number; total: number };
  unmarked: { M: number; F: number; O: number; total: number };
  notPresent: { M: number; F: number; O: number; total: number };
};

function emptyBucket() {
  return { M: 0, F: 0, O: 0, total: 0 };
}

/** Estatísticas mensais de comunhão. */
export function computeCommunionMonthStats(
  members: { id: string; gender?: string | null; status?: string | null }[],
  marks: CommunionMark[],
): CommunionMonthStats {
  const byMember = new Map(marks.map((m) => [m.memberId, m.mark]));
  const present = emptyBucket();
  const absent = emptyBucket();
  const unmarked = emptyBucket();
  const notPresent = emptyBucket();

  const active = members.filter((m) => {
    const st = String(m.status || 'Activo').toLowerCase();
    return st !== 'falecido' && st !== 'inactivo' && st !== 'inativo' && st !== 'transferido';
  });

  for (const m of active) {
    const g = normalizeGender(m.gender);
    const mark = byMember.get(m.id);
    if (mark === 'present') {
      present[g] += 1;
      present.total += 1;
    } else if (mark === 'absent') {
      absent[g] += 1;
      absent.total += 1;
      notPresent[g] += 1;
      notPresent.total += 1;
    } else {
      unmarked[g] += 1;
      unmarked.total += 1;
      notPresent[g] += 1;
      notPresent.total += 1;
    }
  }

  return { totalMembers: active.length, present, absent, unmarked, notPresent };
}
