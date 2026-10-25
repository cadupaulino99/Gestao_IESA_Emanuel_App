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
import { Loader2, Hourglass, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';

// Lazy load for simplicity in this file, we will create these components next.
import Dashboard from './pages/Dashboard';
const Members = lazy(() => import('./pages/Members'));
const Finances = lazy(() => import('./pages/Finances'));
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

const queryClient = new QueryClient();

/* v1.14.0 — Ecrã de estado do auto-cadastro (pendente/rejeitado): o membro
   vê a mensagem correspondente ao estado e NÃO entra (requisito 5). */
const SignupStatusScreen = ({ meta, onSignOut }: { meta: { statusSignup: string; reason?: string | null }; onSignOut: () => Promise<void> }) => {
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
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              A sua conta não tem permissões de administrador. Solicite o acesso a um administrador do sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => window.location.reload()}>Recarregar Página</Button>
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

  const friendlyError = (e: any): string => {
    const code = e?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found')
      return 'Email ou palavra-passe incorretos.';
    if (code === 'auth/user-disabled')
      return 'Esta conta foi desativada. Contacte o administrador.';
    if (code === 'auth/too-many-requests')
      return 'Demasiadas tentativas. Aguarde alguns minutos e tente novamente.';
    if (code === 'auth/network-request-failed')
      return 'Sem ligação à internet. Verifique a rede e tente novamente.';
    if (code === 'auth/operation-not-allowed')
      return 'Este método de entrada não está ativo. Contacte o administrador.';
    return e?.message || 'Não foi possível iniciar sessão.';
  };

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
      setInfo('Enviámos um email para repor a palavra-passe. Verifique a caixa de entrada.');
    } catch (err) {
      setError(friendlyError(err));
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
          <div className="space-y-1 text-center">
            <Link
              to="/register"
              className="inline-block text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline"
            >
              Ainda não tem conta? Criar conta / Cadastrar-me
            </Link>
            <p className="text-[11px] text-muted-foreground">
              O acesso é concedido pelo administrador da igreja.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const PageFallback = () => (
  <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
  </div>
);

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <ConfirmProvider>
          <CommandPaletteProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <BrowserRouter>
                  <CommandPalette />
                  <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<SelfRegister />} />
                    
                    <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                      <Route index element={<Dashboard />} />
                      <Route path="members" element={<Members />} />
                      <Route path="finances" element={<Finances />} />
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
                </BrowserRouter>
              </AuthProvider>
            </QueryClientProvider>
          </CommandPaletteProvider>
        </ConfirmProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
