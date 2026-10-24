import { MONTHS_IDX, MONTHS_SHORT } from '../types';

/* nomes já normalizados (sem acentos) — o input é normalizado antes de comparar */
const NAMES = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

/**
 * Converte qualquer representação de mês usada no sistema (nome por extenso
 * legado — «Janeiro» —, sigla, número ou '01'..'12') no formato canónico
 * '01'..'12'. Devolve '' se não reconhecer.
 */
export function toMonthIdx(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s) return '';
  const n = Number(s);
  if (!Number.isNaN(n) && n >= 1 && n <= 12) return String(n).padStart(2, '0');
  const low = s.toLowerCase().replace('ç','c').replace('ã','a').replace('á','a');
  const i = NAMES.findIndex((nm) => nm.startsWith(low) || low.startsWith(nm.slice(0, 4)));
  if (i >= 0) return MONTHS_IDX[i];
  const si = MONTHS_SHORT.findIndex((sm) => sm.toLowerCase() === low.slice(0, 3));
  return si >= 0 ? MONTHS_IDX[si] : '';
}

const DISPLAY = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export function idxToName(idx: string): string {
  const i = MONTHS_IDX.indexOf(idx as any);
  return i >= 0 ? DISPLAY[i] : idx;
}
