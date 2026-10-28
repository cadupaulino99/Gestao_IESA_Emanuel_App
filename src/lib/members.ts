import { db } from './firebase';
import {
  collection, query, where, getDocs, updateDoc, doc, runTransaction, writeBatch,
} from 'firebase/firestore';
import { Member } from '../types';
import { moveToTrash } from './trash';

/* ------------------------------------------------------------------ */
/* B.I. angolano: 9 dígitos + 2 letras + 3 dígitos (ex.: 004578123LA040) */
/* ------------------------------------------------------------------ */
export const BI_REGEX = /^\d{9}[A-Z]{2}\d{3}$/;

/** Limpeza canónica: maiúsculas, só letras/dígitos, máx. 14 (9+2+3). */
export function cleanBi(value: string): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
}

export function validateBi(value: string | null | undefined): { ok: boolean; normalized: string; error?: string } {
  const raw = cleanBi(String(value ?? ''));
  if (!raw) return { ok: true, normalized: '' }; // opcional
  if (!BI_REGEX.test(raw)) {
    return {
      ok: false,
      normalized: raw,
      error: 'B.I. inválido: o formato angolano é 9 dígitos + 2 letras + 3 dígitos (ex.: 123456789LA012). O que escreveu foi mantido no campo — corrija e grave de novo.',
    };
  }
  return { ok: true, normalized: raw };
}

/**
 * Transformação de escrita no campo: maiúsculas + limpeza + limite,
 * PRESERVANDO a posição do cursor (conta quantos caracteres válidos havia
 * antes do cursor no texto anterior). Funciona em digitação, colagem e
 * preenchimento programático (todos passam por onChange ou por cleanBi).
 */
export function editBi(value: string, cursor: number | null): { value: string; cursor: number } {
  const cleaned = cleanBi(value);
  if (cursor === null) return { value: cleaned, cursor: cleaned.length };
  const before = value.slice(0, cursor);
  const pos = cleanBi(before).length;
  return { value: cleaned, cursor: pos };
}

/* ------------------------------------------------------------------ */
/* Semelhança de nomes (aviso de duplicados ao criar)                   */
/* ------------------------------------------------------------------ */
const PARTICLES = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'di', 'du']);

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !PARTICLES.has(t))
    .join(' ');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  return inter / (ta.size + tb.size - inter); // Jaccard
}

/** «igual ou muito semelhante»: edição à distância de 2 ou ≥80% de tokens comuns. */
export function isSimilarName(a: string, b: string): boolean {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (levenshtein(na, nb) <= 2) return true;
  return nameSimilarity(a, b) >= 0.8;
}

export function findSimilarMembers(name: string, members: Member[], excludeId?: string): Member[] {
  return members.filter((m) => m.id !== excludeId && isSimilarName(name, m.name));
}

/* ------------------------------------------------------------------ */
/* ID interno sequencial: M-0001, M-0002… (nunca muda)                  */
/* ------------------------------------------------------------------ */
export async function nextInternalCode(): Promise<string> {
  const ref = doc(db, 'settings', 'counters');
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const seq = (snap.exists() ? Number(snap.data()?.memberSeq || 0) : 0) + 1;
    tx.set(ref, { memberSeq: seq }, { merge: true });
    return `M-${String(seq).padStart(4, '0')}`;
  });
}

/** Maior sequência já usada (para a migração não colidir com códigos novos). */
export function maxSeqFromCodes(members: Member[]): number {
  return members.reduce((mx, m) => {
    const mm = /^M-(\d+)$/.exec(String(m.internalCode || ''));
    return mm ? Math.max(mx, Number(mm[1])) : mx;
  }, 0);
}

/* ------------------------------------------------------------------ */
/* Fusão de duplicados: tudo o que aponta para a origem passa ao destino */
/* ------------------------------------------------------------------ */
const LINKED = ['tithes', 'donations', 'communions', 'renewals', 'pedidos_atualizacao'] as const;

export interface MergeSummary {
  moved: Record<string, number>;
  filledFields: string[];
  trashed: boolean;
}

export async function mergeMembers(source: Member, target: Member, userEmail: string): Promise<MergeSummary> {
  const moved: Record<string, number> = {};
  for (const col of LINKED) {
    const snap = await getDocs(query(collection(db, col), where('memberId', '==', source.id)));
    moved[col] = snap.size;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => {
        batch.update(d.ref, {
          memberId: target.id,
          memberName: target.name,
          ...(target.email ? { memberEmail: target.email } : {}),
        });
      });
      await batch.commit();
    }
  }

  // Lacunas do destino que a origem preenche (BI, filiação, datas, foto…)
  const fill: Record<string, unknown> = {};
  const FIELDS = ['documentNumber', 'issueDate', 'fatherName', 'motherName', 'placeOfBirth', 'photoBase64', 'photoPath', 'birthDate', 'baptismDate', 'joinDate', 'phone', 'address', 'groupCell', 'internalCode'] as const;
  for (const f of FIELDS) {
    if (!target[f as keyof Member] && source[f as keyof Member]) fill[f] = source[f as keyof Member];
  }
  if (Object.keys(fill).length) await updateDoc(doc(db, 'members', target.id), fill as Record<string, any>);

  await moveToTrash('members', source.id, userEmail);
  return { moved, filledFields: Object.keys(fill), trashed: true };
}
