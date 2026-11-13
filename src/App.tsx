/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useState } from 'react';
import { Input } from './components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { prefGet } from './lib/prefs';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { SettingsProvider } from './context/SettingsContext';
import { CommandPaletteProvider } from './context/CommandPaletteContext';
import CommandPalette from './components/CommandPalette';
import Layout from './components/Layout';
import { Button } from './components/ui/button';
import { Loader2, Hourglass, XCircle, LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';

// Lazy load for simplicity in this file, we will create these components next.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Members = lazy(() => import('./pages/Members'));
const Finances = lazy(() => import('./pages/Finances'));
const Communion = lazy(() => import('./pages/Communion'));
const BuildingFund = lazy(() => import('./pages/BuildingFund'));
const Assets = lazy(() => import('./pages/Assets'));
const Budget = lazy(() => import('./pages/Budget'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));
const MemberPortal = lazy(() => import('./pages/MemberPortal'));
const Obligations = lazy(() => import('./pages/Obligations'));
const Support = lazy(() => import('./pages/Support'));
const Radio = lazy(() => import('./pages/Radio'));
const Contributions = lazy(() => import('./pages/Contributions'));
const SelfRegister = lazy(() => import('./pages/SelfRegister'));
const MemberForcePasswordChange = lazy(() => import('./components/members/MemberForcePasswordChange'));
import { useNotifications } from './hooks/useNotifications';
import { Toaster } from './components/ui/sonner';
import ErrorBoundary from './components/ErrorBoundary';
import { currentVersion } from './lib/updateCheck';
import { friendlyAuthError, isUnknownAccountError, RESET_MESSAGE } from './lib/authMessages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Igreja local: dados mudam pouco; evita refetch ao mudar de separador
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/* v1.14.0 — Ecrã de estado do auto-cadastro (pendente/rejeitado): o membro
   vê a mensagem correspondente ao estado e NÃO entra (requisito 5). */
const SignupStatusScreen = ({ meta, onSignOut }: { meta: { statusSignup: string; reason?: string | null }; onSignOut: () => Promise<void> }) => {
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
              ? 'O seu cadastro foi recebido e está PENDENTE de aprovação. Enquanto o administrador da igreja não aprovar o pedido, não consegue aceder ao portal. Aguarde a autorização; depois entre com o mesmo email e palavra-passe (poderá ter de definir a palavra-passe definitiva no primeiro acesso).'
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
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAdmin, memberData, signupMeta, signOut } = useAuth();
  
  useNotifications();

  if (loading) return <div className="h-screen w-screen flex items-center justify-center">A carregar...</div>;

  if (!user) {
    return <Navigate to="/login" />;
  }

  /* v1.14: 1.º login após aprovação — troca obrigatória da palavra-passe
     ANTES de qualquer outro ecrã (requisito 8). */
  if (!isAdmin && memberData?.mustChangePassword) {
    return (<Suspense fallback={<PageFallback />}><MemberForcePasswordChange /></Suspense>);
  }

  if (!isAdmin && memberData) {
    return (<Suspense fallback={<PageFallback />}><MemberPortal /></Suspense>);
  }

  /* v1.14: auto-cadastro pendente/rejeitado — mensagem de estado, sem acesso. */
  if (!isAdmin && !memberData && signupMeta) {
    return <SignupStatusScreen meta={signupMeta} onSignOut={signOut} />;
  }

  if (!isAdmin) {
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
  }

  return <>{children}</>;
};

const Login = () => {
  const { user, signIn, signInWithEmail, resetPassword, loading } = useAuth();
  const [mode, setMode] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (loading) return null;
  if (user) return <Navigate to="/" />;

  let churchName = 'Igreja Local de Emanuel - Xangongo';
  const saved = prefGet('church-settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.nome) {
        churchName = parsed.nome;
      }
    } catch(e) {}
  }

  /* v1.14.7: mensagens extraídas para lib/authMessages (testáveis). */
  const friendlyError = friendlyAuthError;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null); setBusy(true);
    try {
      await signIn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) { setError('Escreva primeiro o seu email.'); return; }
    setError(null); setBusy(true);
    try {
      await resetPassword(email);
      setInfo(RESET_MESSAGE);
    } catch (err: any) {
      /* v1.14.1: email inexistente NÃO revela — mesma mensagem genérica
         (evita enumeração de contas e confusão). Só erros reais de rede
         mostram erro. */
      if (isUnknownAccountError(err)) {
        setInfo(RESET_MESSAGE);
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="rounded-xl overflow-hidden mb-4 border border-slate-200 dark:border-slate-700">
            <img src="/banner-emanuel.jpg" alt="Capelão da Emanuel — Programa de Gestão da Igreja Emanuel, Xangongo" className="w-full h-36 object-cover" />
          </div>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden mb-2 bg-primary/10">
            <img src="/logo-iesa.png" alt="Logo IESA Emanuel" className="w-full h-full object-cover" />
          </div>
          <CardTitle className="text-2xl">Gestão IESA</CardTitle>
          <CardDescription className="line-clamp-2" title={churchName}>{churchName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as 'google' | 'email'); setError(null); setInfo(null); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="google">Google</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
            </TabsList>

            <TabsContent value="google" className="mt-4">
              <Button className="w-full" size="lg" onClick={handleGoogle} disabled={busy}>
                {busy ? 'A entrar…' : 'Entrar com Google'}
              </Button>
            </TabsContent>

            <TabsContent value="email" className="mt-4">
              <form onSubmit={handleEmailLogin} className="space-y-3">
                <Input
                  type="email"
                  placeholder="O seu email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  placeholder="Palavra-passe"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button className="w-full" size="lg" type="submit" disabled={busy}>
                  {busy ? 'A entrar…' : 'Entrar'}
                </Button>
                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  onClick={handleReset}
                  disabled={busy}
                >
                  Esqueci-me da palavra-passe
                </button>
              </form>
            </TabsContent>
          </Tabs>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}
          {info && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-md px-3 py-2">{info}</p>
          )}
          <div className="space-y-2 text-center">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const PageFallback = () => (
  <div className="mx-auto w-full max-w-3xl space-y-4 p-4 py-10" aria-busy="true" aria-label="A carregar">
    <div className="h-8 w-48 skeleton rounded-md" />
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="h-24 skeleton rounded-xl" />
      <div className="h-24 skeleton rounded-xl" />
    </div>
    <div className="h-40 skeleton rounded-xl" />
    <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
    </div>
  </div>
);

export default function App() {
  return (
    <ThemeProvider>
      {/* v1.14.2: Toaster GLOBAL — antes só existia dentro do Layout (liderança)
          e os ecrãs fora dele (login, /register, pendente/rejeitado, troca de
          palavra-passe) mostravam erros INVISÍVEIS: o cadastro falhava em
          silêncio. */}
      <Toaster position="top-center" richColors />
      <SettingsProvider>
        <ConfirmProvider>
          <CommandPaletteProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <BrowserRouter>
                  <CommandPalette />
                  <ErrorBoundary>
                  <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<SelfRegister />} />
                    
                    <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                      <Route index element={<Dashboard />} />
                      <Route path="members" element={<Members />} />
                      <Route path="finances" element={<Finances />} />
                      <Route path="communion" element={<Communion />} />
                      <Route path="obligations" element={<Obligations />} />
                      <Route path="building-fund" element={<BuildingFund />} />
                      <Route path="assets" element={<Assets />} />
                      <Route path="budget" element={<Budget />} />
                      <Route path="reports" element={<Reports />} />
                      <Route path="admin" element={<Admin />} />
                      <Route path="support" element={<Support />} />
                      <Route path="radio" element={<Radio />} />
                      <Route path="contributions" element={<Contributions />} />
                      <Route path="settings" element={<Settings />} />
                    </Route>
                  </Routes>
                  </Suspense>
                  </ErrorBoundary>
                </BrowserRouter>
              </AuthProvider>
            </QueryClientProvider>
          </CommandPaletteProvider>
        </ConfirmProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
