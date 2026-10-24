/** Normaliza telefone angolano: aceita 9XX… , 2449XX… , +2449XX…, com espaços.
 *  Devolve '+2449XXXXXXXX' ou null se não for um móvel angolano válido. */
export function normalizePhoneAO(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('244')) d = d.slice(3);
  if (d.length !== 9 || !d.startsWith('9')) return null;
  return `+244${d}`;
}

export function phoneError(value: string): string | null {
  if (!value.trim()) return null; // opcional
  return normalizePhoneAO(value) ? null : 'Telefone angolano inválido: use +244 e 9 dígitos (ex.: +244 923 000 000).';
}

/** Números repetidos entre membros (aviso antes de enviar mensagens). */
export function duplicatePhones(members: { id: string; name: string; phone?: string | null }[]) {
  const map = new Map<string, { id: string; name: string }[]>();
  for (const m of members) {
    const n = normalizePhoneAO(m.phone);
    if (!n) continue;
    const arr = map.get(n) || [];
    arr.push({ id: m.id, name: m.name });
    map.set(n, arr);
  }
  return [...map.entries()].filter(([, arr]) => arr.length > 1);
}
