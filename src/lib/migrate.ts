import { toMonthIdx } from './months';

/**
 * Migração v1.9.3 — duas datas no dízimo + meses canónicos + IDs internos.
 * Funções PURBAS (testadas): devolvem o patch a aplicar, ou null se o documento
 * já estiver migrado (idempotente — pode correr várias vezes).
 */
export interface TitheDoc {
  deliveryMonth?: string;
  deliveryYear?: number;
  cashierMonth?: string;
  cashierYear?: number;
  month?: string;
  year?: number;
  referenceMonth?: string;
  referenceYear?: number;
}

export function migrateTitheDoc(t: TitheDoc): Record<string, unknown> | null {
  const dm = toMonthIdx(t.deliveryMonth);
  const dy = Number(t.deliveryYear ?? t.cashierYear ?? t.year ?? 0);
  const rm = toMonthIdx(t.referenceMonth) || toMonthIdx(t.month);
  const ry = Number(t.referenceYear ?? t.year ?? 0);

  const already =
    dm !== '' &&
    Number(t.deliveryYear) > 0 &&
    rm !== '' &&
    String(t.referenceMonth) === rm &&
    String(t.month) === dm &&
    String(t.cashierMonth) === dm &&
    Number(t.year) === dy &&
    Number(t.cashierYear) === dy;
  if (already) return null;

  return {
    deliveryMonth: dm || toMonthIdx(t.month),
    deliveryYear: dy,
    month: dm || toMonthIdx(t.month),
    year: dy,
    cashierMonth: dm || toMonthIdx(t.month),
    cashierYear: dy,
    referenceMonth: rm,
    referenceYear: ry,
  };
}

/** Próximo código interno a partir da maior sequência existente. */
export function codeForSeq(seq: number): string {
  return `M-${String(seq).padStart(4, '0')}`;
}

/* ═══════════════════ MIGRAÇÃO v1.12.0 — DINHEIRO EM CÊNTIMOS ═══════════════
 * Converte valores monetários legados (floats em Kz ou strings soltas) para
 * inteiros de cêntimos (700,00 Kz → 70000). Valores que não se conseguem
 * interpretar com certeza NÃO são alterados: vão para a lista `unsure`,
 * para decisão humana. Idempotência garantida pelo marcador settings/system.
 * ─────────────────────────────────────────────────────────────────────────── */
import { legacyToCents } from './money';

export const MONEY_FIELDS_V112: Record<string, string[]> = {
  tithes: ['amount'],
  offerings: ['amount'],
  expenses: ['amount'],
  buildingFunds: ['amount'],
  assets: ['purchaseValue'],
  donations: ['amount'],
  budgets: [
    'expectedTithes', 'expectedOfferings',
    'expectedExpenses_Obras', 'expectedExpenses_Evangelismo', 'expectedExpenses_Sustento',
    'expectedExpenses_Administracao', 'expectedExpenses_Outros',
  ],
  member_budgets: ['amount'],
  contributions: ['amount', 'paidAmount'],
  contribution_payments: ['amount'],
  financialMonths: ['openingBalance', 'closingBalance'],
};

export interface MoneyUnsure { col: string; id: string; field: string; value: unknown }

/** Devolve o patch de conversão de um documento (ou vazio) + casos duvidosos. */
export function moneyPatchFor(
  col: string,
  id: string,
  data: Record<string, unknown>,
): { patch: Record<string, unknown>; unsure: MoneyUnsure[] } {
  const patch: Record<string, unknown> = {};
  const unsure: MoneyUnsure[] = [];
  for (const field of MONEY_FIELDS_V112[col] || []) {
    if (!(field in data) || data[field] === null || data[field] === undefined) continue;
    const cents = legacyToCents(data[field]);
    if (cents === null) {
      unsure.push({ col, id, field, value: data[field] });
    } else if (cents !== data[field]) {
      patch[field] = cents;
    }
  }
  // histórico de orçamentos/contribuições: from/to também em cêntimos
  if (Array.isArray(data.history) && (col === 'member_budgets' || col === 'contributions')) {
    let changed = false;
    const hist = (data.history as any[]).map((h) => {
      const nh = { ...h };
      for (const k of ['from', 'to'] as const) {
        if (typeof nh[k] === 'number' && nh[k] !== null) {
          const c = legacyToCents(nh[k]);
          if (c === null) unsure.push({ col, id, field: `history.${k}`, value: nh[k] });
          else if (c !== nh[k]) { nh[k] = c; changed = true; }
        }
      }
      return nh;
    });
    if (changed) patch.history = hist;
  }
  return { patch, unsure };
}

/* ═══════════════ MIGRAÇÃO v1.16.0 — CARIMBAR memberEmail ═══════════════
 * Para FECHAR a leitura legada (qualquer sessão autenticada ler documentos
 * sem dono identificado — BI, telefone e morada expostos), é preciso antes
 * carimbar o email do membro dono em cada registo. Funções PURAS e
 * idempotentes (testadas em __tests__/migrateMemberEmail.test.ts):
 * devolvem o patch a aplicar, ou null se o documento já estiver carimbado.
 * A UI (Admin → Gestão de Dados) aplica em lotes e, no fim, grava o marcador
 * settings/system.memberEmailStamped=true — é esse marcador que FECHA a
 * porta nas firestore.rules (legacyReadOpen()). Sem marcador: porta aberta.
 * ───────────────────────────────────────────────────────────────────────── */

/** Colecções cujos documentos levam `memberEmail` carimbado a partir do membro. */
export const MEMBER_EMAIL_COLLECTIONS = [
  'tithes', 'communions', 'donations', 'renewals',
  'contributions', 'contribution_payments', 'member_budgets',
] as const;

/** Email normalizado (minúsculas, sem espaços) ou null. */
export function normEmail(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  return s.includes('@') ? s : null;
}

export interface MemberEmailSource {
  id: string;
  email?: string | null;
  memberEmail?: string | null;
}

/** Patch para o documento de MEMBRO: memberEmail = email normalizado.
 *  Compara com o valor CRU guardado: as regras do Firestore comparam strings
 *  com caixa — um memberEmail 'MARIA@X.COM' trancaria o próprio fora, por
 *  isso a migração re-carimba para minúsculas. */
export function memberEmailPatchForMember(m: MemberEmailSource): { memberEmail: string } | null {
  const want = normEmail(m?.email) || normEmail(m?.memberEmail);
  if (!want) return null;                       // sem email → sem conta → nada a carimbar
  return String(m?.memberEmail ?? '') === want ? null : { memberEmail: want };
}

/** Patch para documento FILHO (dízimo, comunhão, …): carimba a partir do mapa
 *  memberId → email. Sem membro conhecido/com email → null (órfãos ficam para
 *  decisão manual; a liderança continua a vê-los). */
export function memberEmailPatchForChild(
  child: { memberId?: string | null; memberEmail?: string | null } | null | undefined,
  emailByMemberId: Map<string, string>
): { memberEmail: string } | null {
  const mid = String(child?.memberId ?? '');
  const want = mid ? emailByMemberId.get(mid) : undefined;
  if (!want) return null;
  return String(child?.memberEmail ?? '') === want ? null : { memberEmail: want };
}

/** Constrói o mapa memberId → email normalizado a partir dos membros. */
export function emailMapFromMembers(members: MemberEmailSource[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of members) {
    const e = normEmail(m?.email) || normEmail(m?.memberEmail);
    if (e && m?.id) map.set(m.id, e);
  }
  return map;
}
