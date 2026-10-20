import { ReactNode } from 'react';
import { prefGet } from '../lib/prefs';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
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
  MessageSquare
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { useState, useEffect } from 'react';
import { Toaster } from './ui/sonner';
import { useCommandPalette } from '../context/CommandPaletteContext';
import { Command as CommandIcon, Search } from 'lucide-react';

export default function Layout() {
  const { user, signOut, isAdmin, userRole } = useAuth();
  const { openPalette } = useCommandPalette();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [churchName, setChurchName] = useState('Emanuel - Xangongo');
  const [logoUrl, setLogoUrl] = useState('/logo-iesa.png');

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
        } catch(e) {}
      }
      setChurchName('Emanuel - Xangongo');
    };

    updateHeaderName();
    window.addEventListener('storage', updateHeaderName);
    return () => window.removeEventListener('storage', updateHeaderName);
  }, []);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: PieChart },
    { name: 'Membros', path: '/members', icon: Users },
    { name: 'Gestão Mensal', path: '/finances', icon: Wallet },
    { name: 'Obrigações Gerais', path: '/obligations', icon: HeartHandshake },
    { name: 'Fundo Construção', path: '/building-fund', icon: Building2 },
    { name: 'Activos', path: '/assets', icon: Landmark },
    { name: 'Orçamento', path: '/budget', icon: BarChart },
    { name: 'Relatórios/Recibos', path: '/reports', icon: ReceiptText },
    ...(userRole === 'admin' ? [{ name: 'Painel do Admin.', path: '/admin', icon: Shield }] : []),
    { name: 'Suporte', path: '/support', icon: MessageSquare },
    { name: 'Definições', path: '/settings', icon: Settings },
  ];

  const NavLinks = () => (
    <>
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
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

  return (
    <div className="flex min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans selection:bg-blue-200">
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

      {/* Main content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Subtle background decorative elements */}
        <div className="absolute top-0 right-0 -z-10 w-full h-full overflow-hidden pointer-events-none opacity-40 dark:opacity-20">
            <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-blue-100/50 blur-3xl mix-blend-multiply" />
            <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-purple-100/50 blur-3xl mix-blend-multiply" />
        </div>

        <header className="flex md:hidden items-center justify-between px-4 py-3 border-b border-slate-200/60 bg-white/80 backdrop-blur-md z-30">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg overflow-hidden border border-slate-200/50 shadow-sm">
              <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="font-semibold tracking-tight">Gestão IESA</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="hover:bg-slate-100" onClick={openPalette} title="Pesquisar (Ctrl+K)">
              <Search className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </Button>
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="hover:bg-slate-100">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
            <SheetContent side="left" className="w-[280px] flex flex-col pt-10 border-r-slate-200/60">
              <nav className="flex-1 space-y-1.5 mt-4">
                <NavLinks />
              </nav>
              <div className="mt-auto pt-6 border-t border-slate-200/60 pb-4">
                 <Button variant="outline" className="w-full justify-start gap-2 h-11" onClick={signOut}>
                  <DoorClosed className="h-4 w-4 text-slate-500" />
                  <span>Terminar Sessão</span>
                </Button>
              </div>
            </SheetContent>
            </Sheet>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, filter: 'blur(4px)', y: 15 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, filter: 'blur(4px)', y: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="h-full max-w-7xl mx-auto"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
