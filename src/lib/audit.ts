import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

/* ═══════════════════════════════════════════════════════════════════════
   AUDITORIA UNIFICADA (v1.14.4, P1 da auditoria de 2026-10-25)
   ───────────────────────────────────────────────────────────────────────
   Coexistiam DOIS esquemas em `audit_logs`:
     • Admin/modais:  { action, targetEmail, byEmail, at }
     • Finanças:      { adminEmail, action, collectionName, createdAt, … }
   …e a aba «Auditoria» só lia o segundo — as entradas do próprio Admin
   apareciam com data «-» e autor vazio. `logAudit` grava os DOIS conjuntos
   de campos: qualquer ecrã as mostra bem, e o histórico antigo continua
   legível. A auditoria NUNCA bloqueia a operação (falhou → só consola).
   ═══════════════════════════════════════════════════════════════════════ */

export async function logAudit(
  action: string,
  target: string,
  byEmail: string,
  detail?: string
): Promise<void> {
  const at = Date.now();
  try {
    await addDoc(collection(db, 'audit_logs'), {
      // esquema Admin
      action,
      targetEmail: target,
      byEmail: byEmail || 'unknown',
      at,
      // esquema Finanças/aba Auditoria
      adminEmail: byEmail || 'unknown',
      createdAt: at,
      collectionName: String(target).split('/')[0] || '',
      detail: detail || '',
    });
  } catch (e) {
    console.error('audit log falhou (não bloqueante):', e);
  }
}
