#!/usr/bin/env python3
from pathlib import Path
w = Path("worker/ai-worker.js")
wt = w.read_text()
if "/admin/delete-admin" in wt:
    print("worker already")
else:
    needle = """        await patchAdminDoc(env, target, { disabled: !!disabled });
        roleCache = { ts: 0, map: {} };
        return json({ ok: true, disabled: !!disabled });
      }

      /* --- v2.9.0: apagar CONTA+PEDIDO de um cadastro REJEITADO (admin)."""
    insert = """        await patchAdminDoc(env, target, { disabled: !!disabled });
        roleCache = { ts: 0, map: {} };
        return json({ ok: true, disabled: !!disabled });
      }

      /* --- apagar administrador (super): Auth + documento admins/<email> --- */
      if (path === '/admin/delete-admin') {
        if (!isSuper) return json({ error: 'Só o super administrador pode apagar administradores.' }, 403);
        const body = await request.json().catch(() => ({}));
        const target = String(body.email || '').toLowerCase().trim();
        if (!target || !target.includes('@')) return json({ error: 'Email obrigatório.' }, 400);
        const caller = String(claims.email || '').toLowerCase();
        if (target === caller) return json({ error: 'Não pode apagar a sua própria conta.' }, 403);
        const tDoc = await getAdminDoc(target, env);
        if (!tDoc) return json({ error: 'Este email não está na coleção admins.' }, 404);
        if (tDoc.isSuper === true) return json({ error: 'A conta de super administrador não pode ser apagada.' }, 403);
        let accountDeleted = false;
        const localId = await itGetLocalId(env, target);
        if (localId) {
          const tok = await saAccessToken(env.FIREBASE_SA_JSON);
          const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ localId }),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            return json({ error: 'Falha ao apagar a conta Auth: ' + ((j.error && j.error.message) || r.status) }, 500);
          }
          accountDeleted = true;
        }
        await fsDeleteDoc(env, 'admins', target);
        roleCache = { ts: 0, map: {} };
        try {
          await fsAdd(env, 'audit_logs', {
            action: 'admin.deleted',
            targetEmail: target,
            byEmail: caller,
            adminEmail: caller,
            at: Date.now(),
            createdAt: Date.now(),
            accountDeleted,
          });
        } catch (_) {}
        return json({ ok: true, accountDeleted, email: target });
      }

      /* --- v2.9.0: apagar CONTA+PEDIDO de um cadastro REJEITADO (admin)."""
    if needle not in wt:
        raise SystemExit("worker needle missing")
    w.write_text(wt.replace(needle, insert, 1))
    print("worker patched")

ai = Path("src/lib/ai.ts")
at = ai.read_text()
if "deleteAdminAccount" not in at:
    old = """/** Ativa/desativa a conta de um admin sem apagar dados (só super). */
export async function setAccountDisabled(input: { email: string; disabled: boolean }) {
  return callWorker<{ ok: boolean; disabled: boolean }>('/admin/set-account-disabled', input);
}
"""
    new = """/** Ativa/desativa a conta de um admin sem apagar dados (só super). */
export async function setAccountDisabled(input: { email: string; disabled: boolean }) {
  return callWorker<{ ok: boolean; disabled: boolean }>('/admin/set-account-disabled', input);
}

/** Apaga administrador: documento admins/ + conta Auth (SÓ super; Worker valida). */
export async function deleteAdminAccount(input: { email: string }) {
  return callWorker<{ ok: boolean; accountDeleted: boolean; email: string }>(
    '/admin/delete-admin',
    input,
  );
}
"""
    if old not in at:
        raise SystemExit("ai.ts marker missing")
    ai.write_text(at.replace(old, new, 1))
    print("ai patched")
else:
    print("ai already")

adm = Path("src/pages/Admin.tsx")
at = adm.read_text()
if "deleteAdminAccount" not in at:
    at = at.replace(
        "import { createAuthAccount, resetTempPassword, setAccountDisabled } from '../lib/ai';",
        "import { createAuthAccount, resetTempPassword, setAccountDisabled, deleteAdminAccount } from '../lib/ai';",
    )
if "handleDeleteAdmin" not in at:
    marker = "  const deleteDocSafely = async (col: string, id: string) => {"
    handler = """  const handleDeleteAdmin = async (u: any) => {
    if (!isSuperAdmin) {
      toast.error('Só o super administrador pode apagar administradores.');
      return;
    }
    if (u?.isSuper === true) {
      toast.error('A conta de super administrador não pode ser apagada.');
      return;
    }
    if (String(u?.email || '').toLowerCase() === String(user?.email || '').toLowerCase()) {
      toast.error('Não pode apagar a sua própria conta.');
      return;
    }
    const confirmed = await confirmDialog(
      `Apagar definitivamente o administrador «${u.name || u.email}»?\\n\\nIsto remove o acesso e a conta de autenticação. Não pode ser desfeito pelo painel.`,
      'APAGAR',
    );
    if (!confirmed) return;
    try {
      const r = await deleteAdminAccount({ email: u.email });
      setUsers((prev) => prev.filter((x) => String(x.email || x.id).toLowerCase() !== String(u.email).toLowerCase()));
      toast.success(r.accountDeleted
        ? `Administrador ${u.email} apagado (conta Auth removida).`
        : `Administrador ${u.email} removido (não havia conta Auth).`);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao apagar administrador.');
    }
  };

  const deleteDocSafely = async (col: string, id: string) => {"""
    if marker not in at:
        raise SystemExit("deleteDocSafely marker missing")
    at = at.replace(marker, handler, 1)
old_btn = """                            {!isSuperRow && (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" title="Gerar nova palavra-passe temporária" onClick={() => handleResetTemp(u)}>
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" title={u.disabled ? 'Reativar' : 'Desativar'} onClick={() => handleToggleDisabled(u)}>
                                  {u.disabled ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
                                </Button>
                              </div>
                            )}"""
new_btn = """                            {!isSuperRow && (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" title="Gerar nova palavra-passe temporária" onClick={() => handleResetTemp(u)}>
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" title={u.disabled ? 'Reativar' : 'Desativar'} onClick={() => handleToggleDisabled(u)}>
                                  {u.disabled ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
                                </Button>
                                {isSuperAdmin && (
                                  <Button variant="ghost" size="sm" title="Apagar administrador" className="text-destructive hover:text-destructive" onClick={() => handleDeleteAdmin(u)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            )}"""
if "handleDeleteAdmin(u)" not in at:
    if old_btn not in at:
        raise SystemExit("button block not found")
    at = at.replace(old_btn, new_btn, 1)
adm.write_text(at)
print("admin ui patched")
print("done")
