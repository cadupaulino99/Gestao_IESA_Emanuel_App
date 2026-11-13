#!/usr/bin/env python3
from pathlib import Path

# ── AuthContext: lookup de membro por email normalizado + memberEmail ──────
p = Path('src/context/AuthContext.tsx')
t = p.read_text()

old = '''          // Check if user is a registered member
          if (currentUser.email) {
            const memQuery = query(collection(db, 'members'), where('email', '==', currentUser.email));
            const memSnap = await getDocs(memQuery);
            const first = firstMemberOrNone(memSnap.docs);
            if (first) {
              setMemberData({ id: first.id, ...first.data() });
              setSignupMeta(null);
            } else {
              setMemberData(null);
              /* v1.14: auto-cadastro pendente/rejeitado? O documento vive em
                 member_signups/<email-normalizado> (leitura: só o próprio ou a
                 liderança — regras). Sem query: o ID É o email. */
              if (!hasAdminAccess) {
                try {
                  const sSnap = await getDoc(doc(db, 'member_signups', currentUser.email.toLowerCase()));
                  if (sSnap.exists()) {
                    const sd = sSnap.data() as any;
                    setSignupMeta({ statusSignup: sd.statusSignup, reason: sd.reason || null });
                  } else {
                    setSignupMeta(null);
                  }'''

new = '''          // Check if user is a registered member
          // Email no Auth pode ter capitalização diferente da ficha (Firestore é case-sensitive).
          if (currentUser.email) {
            const emailRaw = String(currentUser.email).trim();
            const emailNorm = emailRaw.toLowerCase();
            const emailVariants = Array.from(new Set([emailRaw, emailNorm].filter(Boolean)));
            let first: any = null;
            for (const em of emailVariants) {
              if (first) break;
              const byEmail = await getDocs(query(collection(db, 'members'), where('email', '==', em)));
              first = firstMemberOrNone(byEmail.docs);
              if (first) break;
              const byMemberEmail = await getDocs(query(collection(db, 'members'), where('memberEmail', '==', em)));
              first = firstMemberOrNone(byMemberEmail.docs);
            }
            if (first) {
              setMemberData({ id: first.id, ...first.data() });
              setSignupMeta(null);
            } else {
              setMemberData(null);
              /* v1.14: auto-cadastro pendente/rejeitado? O documento vive em
                 member_signups/<email-normalizado> (leitura: só o próprio ou a
                 liderança — regras). Sem query: o ID É o email. */
              if (!hasAdminAccess) {
                try {
                  const sSnap = await getDoc(doc(db, 'member_signups', emailNorm));
                  if (sSnap.exists()) {
                    const sd = sSnap.data() as any;
                    setSignupMeta({ statusSignup: sd.statusSignup, reason: sd.reason || null });
                  } else {
                    setSignupMeta(null);
                  }'''

if old not in t:
    raise SystemExit('AuthContext block not found')
t = t.replace(old, new, 1)
p.write_text(t)
print('AuthContext OK')

# ── App.tsx: SignupStatusScreen trata «aprovado» correctamente ─────────────
p = Path('src/App.tsx')
t = p.read_text()

old_screen = '''const SignupStatusScreen = ({ meta, onSignOut }: { meta: { statusSignup: string; reason?: string | null }; onSignOut: () => Promise<void> }) => {
  const pending = meta.statusSignup === 'pendente';
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl ${pending ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40' : 'bg-red-100 text-red-600 dark:bg-red-900/40'}`}>
            {pending ? <Hourglass className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
          </div>
          <CardTitle>{pending ? 'Cadastro aguarda aprovação' : 'Cadastro rejeitado'}</CardTitle>
          <CardDescription className="leading-relaxed">
            {pending
              ? 'Recebemos o seu cadastro — foi registado como PENDENTE e aguarda autorização do administrador da igreja. Assim que for aprovado, entre com o seu email e palavra-passe; ser-lhe-á pedido que defina a palavra-passe definitiva.'
              : 'O administrador rejeitou o seu cadastro. Para mais informações, contacte a secretaria da igreja.'}
          </CardDescription>
          {!pending && meta.reason && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <b>Motivo indicado:</b> {meta.reason}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {pending && (
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              Já fui aprovado — verificar novamente
            </Button>
          )}
          <Button className="w-full" onClick={() => { void (async () => { await onSignOut(); window.location.href = '/login'; })(); }}>
            Terminar sessão
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};'''

new_screen = '''const SignupStatusScreen = ({ meta, onSignOut }: { meta: { statusSignup: string; reason?: string | null }; onSignOut: () => Promise<void> }) => {
  const pending = meta.statusSignup === 'pendente';
  const approved = meta.statusSignup === 'aprovado';
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl ${
            pending ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40'
              : approved ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40'
              : 'bg-red-100 text-red-600 dark:bg-red-900/40'
          }`}>
            {pending ? <Hourglass className="h-7 w-7" /> : approved ? <Hourglass className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
          </div>
          <CardTitle>
            {pending ? 'Cadastro aguarda aprovação' : approved ? 'Cadastro aprovado' : 'Cadastro rejeitado'}
          </CardTitle>
          <CardDescription className="leading-relaxed">
            {pending
              ? 'Recebemos o seu cadastro — foi registado como PENDENTE e aguarda autorização do administrador da igreja. Assim que for aprovado, entre com o seu email e palavra-passe; ser-lhe-á pedido que defina a palavra-passe definitiva.'
              : approved
                ? 'O administrador já aprovou o seu cadastro. Toque em «Entrar no portal» para carregar a sua ficha de membro. Se continuar sem acesso, contacte a secretaria da igreja.'
                : 'O administrador rejeitou o seu cadastro. Para mais informações, contacte a secretaria da igreja.'}
          </CardDescription>
          {!pending && !approved && meta.reason && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <b>Motivo indicado:</b> {meta.reason}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {(pending || approved) && (
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              {approved ? 'Entrar no portal — verificar novamente' : 'Já fui aprovado — verificar novamente'}
            </Button>
          )}
          <Button className="w-full" onClick={() => { void (async () => { await onSignOut(); window.location.href = '/login'; })(); }}>
            Terminar sessão
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};'''

if old_screen not in t:
    raise SystemExit('SignupStatusScreen not found')
t = t.replace(old_screen, new_screen, 1)
p.write_text(t)
print('App SignupStatusScreen OK')

# ── PendingSignups: gravar email sempre em minúsculas ─────────────────────
p = Path('src/components/admin/PendingSignups.tsx')
t = p.read_text()
old_m = '''      const member: Record<string, unknown> = {
        name: s.name,
        email: s.email,
        memberEmail: s.email,          // regras isOwnMemberDoc (leitura do próprio)'''
new_m = '''      const emailNorm = String(s.email || '').trim().toLowerCase();
      const member: Record<string, unknown> = {
        name: s.name,
        email: emailNorm,
        memberEmail: emailNorm,          // regras isOwnMemberDoc (leitura do próprio)'''
if old_m not in t:
    print('WARN PendingSignups member block')
else:
    t = t.replace(old_m, new_m, 1)
    p.write_text(t)
    print('PendingSignups OK')

print('DONE')
