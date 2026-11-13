#!/usr/bin/env python3
from pathlib import Path

p = Path('src/pages/Admin.tsx')
t = p.read_text()

old = '''    try {
      const tempPassword = genTempPassword();
      await createAuthAccount({ email: targetEmail, tempPassword, name: targetName, phone: targetPhone });
      await setDoc(doc(db, 'admins', targetEmail), {
        email: targetEmail,
        role,
        createdAt: Date.now(),
        name: targetName,
        phone: targetPhone,
        disabled: false,
        mustChangePassword: true,
        tempPasswordIssuedAt: Date.now(),
        isSuper: false,
      });
      if (picked && !picked.email) {
        await updateDoc(doc(db, 'members', picked.id), { email: targetEmail, updatedAt: Date.now() });
      }
      await audit('admin.created', targetEmail);
      setIsDialogOpen(false);
      setEmail(''); setUserName(''); setUserPhone(''); setMemberSearch(''); setPicked(null); setRole('admin');
      setCreds({ appName: 'Gestão IESA Emanuel', name: targetName, email: targetEmail, phone: targetPhone, tempPassword });
      await reloadUsers();
    } catch (err: any) {
      const msg = err?.message || '';
      if (/EMAIL_EXISTS|Já existe/.test(msg)) {
        /* v1.14.1 — RECUPERAÇÃO DE CONTA ÓRFÃ: se a conta Auth existe mas o
           documento admins/ não (criação anterior falhou a meio), o utilizador
           ficava PRESO («Acesso Restrito») e o super não conseguia repor a
           palavra-passe (o Worker exige o documento). Recria-se o documento e
           emite-se nova temporária. */
        try {
          const admRef = doc(db, 'admins', targetEmail);
          const admSnap = await getDoc(admRef);
          if (!admSnap.exists()) {
            await setDoc(admRef, {
              email: targetEmail, role, createdAt: Date.now(),
              name: targetName, phone: targetPhone,
              disabled: false, mustChangePassword: true,
              tempPasswordIssuedAt: Date.now(), isSuper: false,
            });
            const tempPassword = genTempPassword();
            await resetTempPassword({ email: targetEmail, tempPassword });
            await audit('admin.doc-repaired', targetEmail);
            setCreds({ appName: 'Gestão IESA Emanuel', name: targetName, email: targetEmail, phone: targetPhone, tempPassword });
            await reloadUsers();
            toast.success('A conta de autenticação já existia sem documento de administrador — foi recuperada. Partilhe as novas credenciais (mostram-se uma vez).');
          } else {
            toast.error('Já existe conta com este email. Use «Gerar nova palavra-passe temporária» na lista.');
          }
        } catch (e2: any) {
          toast.error(e2?.message || 'Já existe conta com este email e a recuperação falhou.');
        }
      } else if (/super administrador/.test(msg)) {
        toast.error('Apenas o super administrador pode criar contas.');
      } else {
        toast.error(msg || 'Erro ao criar o administrador. (O Worker precisa da versão 2.4.0 publicada.)');
      }
      handleFirestoreError(err, OperationType.WRITE, 'admins');
    }'''

new = '''    try {
      const tempPassword = genTempPassword();
      const adminPayload = {
        email: targetEmail,
        role,
        createdAt: Date.now(),
        name: targetName,
        phone: targetPhone,
        disabled: false,
        mustChangePassword: true,
        tempPasswordIssuedAt: Date.now(),
        isSuper: false,
      };

      // 1) Conta Firebase Auth (Worker)
      await createAuthAccount({ email: targetEmail, tempPassword, name: targetName, phone: targetPhone });

      // 2) Documento admins/ — se falhar, NÃO mostrar credenciais como «sucesso total»
      try {
        await setDoc(doc(db, 'admins', targetEmail), adminPayload);
      } catch (docErr: any) {
        console.error('admin doc create failed after Auth:', docErr);
        toast.error(
          'A conta de autenticação foi criada, mas o perfil de administrador (Firestore) falhou. ' +
          'Tente de novo com o mesmo email — o sistema tenta reparar a conta órfã. ' +
          String(docErr?.message || ''),
        );
        handleFirestoreError(docErr, OperationType.WRITE, 'admins');
        setIsSubmitting(false);
        return;
      }

      // 3) Verificar que o documento existe antes de mostrar a senha
      const verify = await getDoc(doc(db, 'admins', targetEmail));
      if (!verify.exists()) {
        toast.error(
          'A conta Auth existe, mas o documento admins/ não foi encontrado após gravar. ' +
          'Não foram mostradas credenciais. Tente criar de novo (reparação automática) ou contacte suporte.',
        );
        setIsSubmitting(false);
        return;
      }

      if (picked && !picked.email) {
        await updateDoc(doc(db, 'members', picked.id), { email: targetEmail, updatedAt: Date.now() }).catch(() => {});
      }
      await audit('admin.created', targetEmail);
      setIsDialogOpen(false);
      setEmail(''); setUserName(''); setUserPhone(''); setMemberSearch(''); setPicked(null); setRole('admin');
      setCreds({ appName: 'Gestão IESA Emanuel', name: targetName, email: targetEmail, phone: targetPhone, tempPassword });
      await reloadUsers();
      toast.success('Administrador criado. Partilhe a palavra-passe temporária (mostra-se uma vez).');
    } catch (err: any) {
      const msg = err?.message || '';
      if (/EMAIL_EXISTS|Já existe/.test(msg)) {
        /* RECUPERAÇÃO DE CONTA ÓRFÃ: Auth existe, admins/ em falta */
        try {
          const admRef = doc(db, 'admins', targetEmail);
          const admSnap = await getDoc(admRef);
          if (!admSnap.exists()) {
            await setDoc(admRef, {
              email: targetEmail, role, createdAt: Date.now(),
              name: targetName, phone: targetPhone,
              disabled: false, mustChangePassword: true,
              tempPasswordIssuedAt: Date.now(), isSuper: false,
            });
            const verify = await getDoc(admRef);
            if (!verify.exists()) {
              toast.error('Não foi possível criar o documento admins/. Tente novamente.');
              setIsSubmitting(false);
              return;
            }
            const tempPassword = genTempPassword();
            await resetTempPassword({ email: targetEmail, tempPassword });
            await audit('admin.doc-repaired', targetEmail);
            setCreds({ appName: 'Gestão IESA Emanuel', name: targetName, email: targetEmail, phone: targetPhone, tempPassword });
            await reloadUsers();
            toast.success('Conta órfã reparada (Auth + documento admin). Partilhe as novas credenciais (uma vez).');
          } else {
            toast.error('Já existe conta com este email. Use «Gerar nova palavra-passe temporária» na lista.');
          }
        } catch (e2: any) {
          toast.error(e2?.message || 'Já existe conta com este email e a recuperação falhou.');
        }
      } else if (/super administrador/.test(msg)) {
        toast.error('Apenas o super administrador pode criar contas.');
      } else {
        toast.error(msg || 'Erro ao criar o administrador. (O Worker precisa da versão com create-auth-account.)');
      }
      handleFirestoreError(err, OperationType.WRITE, 'admins');
    }'''

if old not in t:
    raise SystemExit('handleAddUser block not found')
t = t.replace(old, new, 1)
p.write_text(t)
print('Admin.tsx handleAddUser OK')

# Confirmar ForcePasswordChangeModal tem reauth (já deve ter)
modal = Path('src/components/admin/ForcePasswordChangeModal.tsx').read_text()
if 'reauthenticateWithCredential' not in modal:
    raise SystemExit('ForcePasswordChangeModal missing reauth')
print('ForcePasswordChangeModal reauth OK')

rules = Path('firestore.rules').read_text()
if 'request.auth.token.email.lower() == resource.data.email.lower()' not in rules:
    raise SystemExit('rules missing email.lower() self update')
print('firestore.rules isSelfAdminFieldUpdate OK')
print('DONE')
