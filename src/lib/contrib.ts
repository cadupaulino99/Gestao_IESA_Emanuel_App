import { Contribution, ContributionPayment } from '../types';

/** Estado de uma contribuição: concluída só por pagamentos/fecho manual;
 *  em atraso = prazo passado e por completar; resto = em curso. */
export function computeStatus(
  c: Pick<Contribution, 'status' | 'dueDate' | 'completedAt'>,
  paidSum: number,
  total: number,
  now = Date.now()
): Contribution['status'] {
  if (c.status === 'concluida') return 'concluida'; // fecho (auto ou manual) é definitivo até reabertura
  if (paidSum + 0.005 >= total) return 'concluida';
  const due = new Date(c.dueDate + 'T23:59:59').getTime();
  if (!Number.isNaN(due) && now > due) return 'em_atraso';
  return 'em_curso';
}

export const paidSumOf = (payments: ContributionPayment[], contributionId: string): number =>
  payments.filter((p) => p.contributionId === contributionId).reduce((a, b) => a + (Number(b.amount) || 0), 0);

/* ------------------------------------------------------------------ */
/* Modelos com marcadores — a IA escreve SOFT; o sistema substitui.     */
/* ------------------------------------------------------------------ */
export const PLACEHOLDERS = ['{nome}', '{descricao}', '{valor}', '{prazo}', '{valor_em_falta}'] as const;

export function fillTemplate(tpl: string, vars: Record<string, string>): { text: string; missing: string[] } {
  let text = tpl;
  const missing: string[] = [];
  for (const ph of PLACEHOLDERS) {
    if (!text.includes(ph)) continue;
    const key = ph.slice(1, -1);
    const v = vars[key];
    if (v === undefined || v === null || v === '') {
      missing.push(ph);
    } else {
      text = text.split(ph).join(v);
    }
  }
  return { text, missing };
}

/** Um SMS simples leva 160 caracteres (GSM-7); acima disso, várias partes. */
export function smsSegments(text: string): number {
  return Math.max(1, Math.ceil(text.length / 153));
}

/** Marcadores presentes num modelo (para validação e destaque na UI). */
export function placeholdersIn(tpl: string): string[] {
  return PLACEHOLDERS.filter((ph) => tpl.includes(ph));
}
