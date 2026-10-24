import { ReactNode } from 'react';
import { prefGet } from '../lib/prefs';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  BarChart,
  Users,
  Wallet,
  Building2,
  Landmark,
  ReceiptText,
  DoorClosed,
  Menu,
  PieChart,
  Settings,
  Shield,
  HeartHandshake,
  MessageSquare,
  Radio as RadioIcon,
  Home,
  MoreHorizontal,
  Pause,
  Maximize2,
  X,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './ui/sheet';
import { useState, useEffect } from 'react';
import { Toaster } from './ui/sonner';
import { useCommandPalette } from '../context/CommandPaletteContext';
import { Search } from 'lucide-react';
import { livePlayer } from '../lib/radio';
import UpdateBanner from './UpdateBanner';

export default function Layout() {
  const { user, signOut, isAdmin, userRole } = useAuth();
  const { openPalette } = useCommandPalette();
  const { isDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [churchName, setChurchName] = useState('Emanuel - Xangongo');
  const [logoUrl, setLogoUrl] = useState('/logo-iesa.png');
  const [, force] = useState(0);

  /* estado do mini-player da rádio */
  useEffect(() => livePlayer.subscribe(() => force((n) => n + 1)), []);

  /* Barra de estado nativa acompanha o tema (sensação de app nativa) */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: isDark ? '#0b0e14' : '#f6f7f9' }).catch(() => {});
  }, [isDark]);

  useEffect(() => {
    const updateHeaderName = () => {
      const saved = prefGet('church-settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.logoUrl) {
            setLogoUrl(parsed.logoUrl);
          }
          if (parsed.nome) {
            const shortName = parsed.nome.split('-')[1]?.trim() || parsed.nome.substring(0, 20);
            setChurchName(shortName);
            return;
          }
        } catch (e) {}
      }
      setChurchName('Emanuel - Xangongo');
    };

    updateHeaderName();
    window.addEventListener('storage', updateHeaderName);
    return () => window.removeEventListener('storage', updateHeaderName);
  }, []);

  const navItems = [
    { name: 'Início', path: '/', icon: PieChart },
    { name: 'Membros', path: '/members', icon: Users },
    { name: 'Finanças', path: '/finances', icon: Wallet },
    { name: 'Obrigações', path: '/obligations', icon: HeartHandshake },
    { name: 'Fundo de Construção', path: '/building-fund', icon: Building2 },
    { name: 'Património', path: '/assets', icon: Landmark },
    { name: 'Orçamento', path: '/budget', icon: BarChart },
    { name: 'Relatórios', path: '/reports', icon: ReceiptText },
    { name: 'Rádio Maranata', path: '/radio', icon: RadioIcon },
    ...(userRole === 'admin' ? [{ name: 'Administração', path: '/admin', icon: Shield }] : []),
    { name: 'Suporte & IA', path: '/support', icon: MessageSquare },
    { name: 'Definições', path: '/settings', icon: Settings },
  ];

  /* Separadores da barra inferior (estilo app Android) */
  const bottomTabs = [
    { name: 'Início', path: '/', icon: Home },
    { name: 'Membros', path: '/members', icon: Users },
    { name: 'Finanças', path: '/finances', icon: Wallet },
    { name: 'Rádio', path: '/radio', icon: RadioIcon },
  ];
  const bottomPaths = bottomTabs.map((t) => t.path);
  const moreItems = navItems.filter((i) => !bottomPaths.includes(i.path));

  const NavLinks = () => (
    <>
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
              isActive
                ? 'bg-slate-900 text-white font-medium shadow-md shadow-slate-900/10'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`
          }
          onClick={() => setMobileMenuOpen(false)}
        >
          <item.icon className={`h-5 w-5 ${location.pathname === item.path ? 'text-white' : 'text-slate-400'}`} />
          <span>{item.name}</span>
        </NavLink>
      ))}
    </>
  );

  const showMiniPlayer = (livePlayer.playing || livePlayer.loading) && location.pathname !== '/radio';

  return (
    <div className="flex min-h-dvh bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans selection:bg-blue-200">
      {/* Sidebar for desktop */}
      <aside className="hidden md:flex flex-col w-72 border-r border-slate-200/60 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl px-4 py-6 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl overflow-hidden bg-slate-100 shadow-sm border border-slate-200/50">
            <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="font-semibold text-lg tracking-tight text-slate-900 dark:text-white">Gestão IESA</h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{churchName}</p>
          </div>
        </div>

        <button
          onClick={openPalette}
          className="flex items-center justify-between w-full px-3 py-2 mb-4 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 transition-all shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" />
            <span>Busca rápida & Comandos...</span>
          </div>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded bg-slate-200 dark:bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-600 dark:text-slate-300">
            Ctrl K
          </kbd>
        </button>

        <nav className="flex-1 space-y-1.5 overflow-y-auto pr-2 scrollbar-hide">
          <NavLinks />
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center gap-3 px-2 mb-4 bg-slate-100/50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
            <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700 shadow-sm">
              <AvatarImage src={user?.photoURL || ''} />
              <AvatarFallback className="bg-slate-900 text-white font-medium">{user?.displayName?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold truncate text-slate-900 dark:text-white">{user?.displayName}</p>
              <p className="text-xs text-slate-500 font-medium truncate capitalize">
                {userRole === 'admin' ? 'Administrador Geral' : userRole === 'pastor' ? 'Pastor' : userRole === 'treasurer' ? 'Tesoureiro' : 'Acesso Restrito'}
              </p>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start gap-2 h-10 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 font-medium" onClick={signOut}>
            <DoorClosed className="h-4 w-4 text-slate-500" />
            <span className="text-slate-600 dark:text-slate-300">Terminar Sessão</span>
          </Button>
        </div>
      </aside>

      {/* Main content — coluna flex: cabeçalho + scroll + rodapé EM FLUXO
          (nada fica escondido debaixo da barra de navegação) */}
      <main className="flex-1 flex flex-col h-dvh overflow-hidden relative">
        {/* Subtle background decorative elements */}
        <div className="absolute top-0 right-0 -z-10 w-full h-full overflow-hidden pointer-events-none opacity-40 dark:opacity-20">
          <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-blue-100/50 blur-3xl mix-blend-multiply" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-purple-100/50 blur-3xl mix-blend-multiply" />
        </div>

        <header className="flex md:hidden items-center justify-between px-4 pt-safe py-2.5 border-b border-slate-200/60 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg overflow-hidden border border-slate-200/50 shadow-sm">
              <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold tracking-tight leading-none truncate">Gestão IESA</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none mt-0.5 truncate">{churchName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="hover:bg-slate-100 dark:hover:bg-slate-800" onClick={openPalette} title="Pesquisar (Ctrl+K)">
              <Search className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </Button>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              {/* Menu como bottom-sheet nativo (nunca "meio ecrã" lateral) */}
              <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[85vh] flex flex-col gap-0 overflow-hidden border-t-0 px-4 pt-3">
                <div className="scroll-native min-h-0 flex-1 pb-3">
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden />
                <SheetTitle className="flex items-center justify-between text-base font-semibold pb-2">
                  Menu
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileMenuOpen(false)} title="Fechar">
                    <X className="h-4 w-4" />
                  </Button>
                </SheetTitle>
                <div className="grid grid-cols-2 gap-2 pb-2">
                  {moreItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => { setMobileMenuOpen(false); navigate(item.path); }}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors ${
                        location.pathname === item.path
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <item.icon className="h-4.5 w-4.5 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-slate-100/60 dark:bg-slate-900/60 p-3 my-2 border border-slate-200/60 dark:border-slate-800/60">
                  <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700">
                    <AvatarImage src={user?.photoURL || ''} />
                    <AvatarFallback className="bg-slate-900 text-white font-medium">{user?.displayName?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{user?.displayName}</p>
                    <p className="text-xs text-slate-500 truncate capitalize">
                      {userRole === 'admin' ? 'Administrador Geral' : userRole === 'pastor' ? 'Pastor' : userRole === 'treasurer' ? 'Tesoureiro' : 'Acesso Restrito'}
                    </p>
                  </div>
                </div>
                <Button variant="outline" className="w-full justify-start gap-2 h-11 mb-2" onClick={() => { setMobileMenuOpen(false); signOut(); }}>
                  <DoorClosed className="h-4 w-4 text-slate-500" />
                  <span>Terminar Sessão</span>
                </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <UpdateBanner />
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, filter: 'blur(4px)', y: 15 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, filter: 'blur(4px)', y: -15 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="max-w-7xl mx-auto"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Mini-player da rádio (flutua acima da barra de navegação) */}
        <AnimatePresence>
          {showMiniPlayer && (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="md:hidden absolute inset-x-3 z-40 miniplayer-above-nav"
            >
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2 shadow-xl shadow-slate-900/10">
                <button onClick={() => navigate('/radio')} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white">
                    <RadioIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight truncate">Rádio Maranata</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      {livePlayer.loading ? 'A ligar…' : 'Em direto · 91.9 FM'}
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => livePlayer.pause()}
                  title="Pausar emissão"
                >
                  <Pause className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => navigate('/radio')}
                  title="Abrir rádio"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Barra de navegação inferior EM FLUXO (parte da coluna, nunca cobre conteúdo) */}
        <nav className="md:hidden border-t border-slate-200/60 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur pb-safe z-30">
          <div className="grid grid-cols-5">
            {bottomTabs.map((t) => {
              const active = location.pathname === t.path;
              return (
                <button
                  key={t.path}
                  onClick={() => navigate(t.path)}
                  className={`relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
                    active ? 'text-brand' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-brand/10' : ''}`}>
                    <t.icon className="h-5 w-5" />
                  </span>
                  {t.name}
                  {t.path === '/radio' && livePlayer.playing && (
                    <span className="absolute top-1.5 right-1/2 translate-x-4 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-slate-500 dark:text-slate-400"
            >
              <span className="flex h-7 w-12 items-center justify-center rounded-full">
                <MoreHorizontal className="h-5 w-5" />
              </span>
              Mais
            </button>
          </div>
        </nav>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
