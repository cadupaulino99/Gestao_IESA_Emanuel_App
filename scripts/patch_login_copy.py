#!/usr/bin/env python3
from pathlib import Path

p = Path('src/App.tsx')
t = p.read_text()

# 1) Acesso Restrito
old_ar = '''  if (!isAdmin) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              A sua conta não tem permissões de administrador. Solicite o acesso a um administrador do sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => window.location.reload()}>Recarregar Página</Button>
            {/* v1.14.1: sem este botão o utilizador ficava PRESO neste ecrã —
                nem terminar sessão conseguia (dead-end reportado: «admins que
                não conseguem aceder»). */}
            <Button variant="outline" className="w-full gap-1.5" onClick={() => { void (async () => { await signOut(); window.location.href = '/login'; })(); }}>
              <LogOut className="h-4 w-4" /> Terminar sessão
            </Button>
            <Link to="/register" className="block text-center text-xs text-muted-foreground hover:underline">
              Ainda não tem conta? Criar conta / Cadastrar-me
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }'''

new_ar = '''  if (!isAdmin) {
    /* Conta autenticada, mas sem ficha de membro e sem registo de cadastro legível.
       Não é (só) «falta de permissão de admin» — falta vínculo à igreja. */
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Conta sem vínculo à igreja</CardTitle>
            <CardDescription className="leading-relaxed space-y-2">
              <span className="block">
                A sua sessão está activa, mas esta conta ainda <b>não está ligada</b> a uma ficha de membro
                nem a um perfil de administrador da igreja.
              </span>
              <span className="block text-muted-foreground">
                O que pode fazer: (1) se acabou de se registar, o pedido pode ainda estar a ser processado —
                contacte a secretaria; (2) se já era membro, peça ao administrador para associar o seu email
                à ficha; (3) contas desactivadas deixam de poder usar a app — fale com o super administrador.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => window.location.reload()}>Tentar novamente</Button>
            <Button variant="outline" className="w-full gap-1.5" onClick={() => { void (async () => { await signOut(); window.location.href = '/login'; })(); }}>
              <LogOut className="h-4 w-4" /> Terminar sessão
            </Button>
            <Link to="/register" className="block text-center text-xs text-muted-foreground hover:underline">
              Registar-me como membro (auto-cadastro)
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }'''

if old_ar not in t:
    raise SystemExit('Acesso Restrito block not found')
t = t.replace(old_ar, new_ar, 1)

# 2) SignupStatusScreen — reforçar pendente
old_pend = "? 'Recebemos o seu cadastro — foi registado como PENDENTE e aguarda autorização do administrador da igreja. Assim que for aprovado, entre com o seu email e palavra-passe; ser-lhe-á pedido que defina a palavra-passe definitiva.'"
new_pend = "? 'O seu cadastro foi recebido e está PENDENTE de aprovação. Enquanto o administrador da igreja não aprovar o pedido, não consegue aceder ao portal. Aguarde a autorização; depois entre com o mesmo email e palavra-passe (poderá ter de definir a palavra-passe definitiva no primeiro acesso).'"
if old_pend not in t:
    raise SystemExit('pending text not found')
t = t.replace(old_pend, new_pend, 1)

# 3) Login footer help
old_foot = '''          <div className="space-y-1 text-center">
            <Link
              to="/register"
              className="inline-block text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline"
            >
              Ainda não tem conta? Criar conta / Cadastrar-me
            </Link>
            <p className="text-[11px] text-muted-foreground">
              O acesso é concedido pelo administrador da igreja.
            </p>
            <p className="text-[10px] text-center text-slate-400" title="Versão instalada neste aparelho">
              v{currentVersion()}
            </p>
          </div>'''

new_foot = '''          <div className="space-y-2 text-center">
            <Link
              to="/register"
              className="inline-block text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline"
            >
              Ainda não tem conta? Criar conta / Cadastrar-me
            </Link>
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-left text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground/80 mb-1">Antes de entrar, saiba que:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Se <b>acabou de se registar</b>, o cadastro fica <b>pendente</b> até o administrador aprovar — só depois consegue usar o portal.</li>
                <li>Se a conta <b>não tem ficha de membro</b> nem perfil de administrador, contacte a secretaria da igreja para criar o vínculo.</li>
                <li>Se a conta foi <b>desactivada</b>, só o super administrador pode reactivá-la.</li>
              </ul>
            </div>
            <p className="text-[10px] text-center text-slate-400" title="Versão instalada neste aparelho">
              v{currentVersion()}
            </p>
          </div>'''

if old_foot not in t:
    raise SystemExit('login footer not found')
t = t.replace(old_foot, new_foot, 1)

p.write_text(t)
print('App.tsx login copy OK')
