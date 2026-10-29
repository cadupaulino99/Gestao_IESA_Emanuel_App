import { Fragment, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { prefGet, prefSet } from '../lib/prefs';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart,
  Users,
  Wallet,
  Building2,
  Landmark,
  ReceiptText,
  DoorClosed,
  Settings,
  Shield,
  HeartHandshake,
  MessageSquare,
  Radio as RadioIcon,
  Home,
  MoreHorizontal,
  Pause,
  Maximize2,
  HandCoins,
  Search,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useCommandPalette } from '../context/CommandPaletteContext';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { livePlayer } from '../lib/radio';
import UpdateBanner from './UpdateBanner';
import ForcePasswordChangeModal from './admin/ForcePasswordChangeModal';
import NotificationBell from './NotificationBell';

/* ═══════════════════════════════════════════════════════════════
   FASE 2 — Navegação com três modos, decididos só por CSS
   (variantes nav-side / nav-rail definidas em index.css):

   • Retrato (telemóvel)      → barra inferior: 4 destinos + «Mais»
   • Paisagem (altura <500px) → rail de ícones à esquerda (64 px) +
                                cabeçalho compacto (48 px)
   • Tablet/desktop (≥768 px com altura ≥500, ou ≥1024 px)
                              → sidebar expansível com grupos colapsáveis

   A lógica de papéis (userRole) e tudo o que não é apresentação
   mantém-se exatamente como antes.
   ═══════════════════════════════════════════════════════════════ */

type NavItem = { name: string; path: string; icon: LucideIcon; adminOnly?: boolean };
type NavSection = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'geral',
    label: 'Geral',
    icon: Home,
    items: [{ name: 'Início', path: '/', icon: Home }],
  },
  {
    id: 'comunidade',
    label: 'Comunidade',
    icon: Users,
    items: [
      { name: 'Membros', path: '/members', icon: Users },
      { name: 'Obrigações', path: '/obligations', icon: HeartHandshake },
      { name: 'Rádio Maranata', path: '/radio', icon: RadioIcon },
    ],
  },
  {
    id: 'financas',
    label: 'Finanças',
    icon: Wallet,
    items: [
      { name: 'Finanças', path: '/finances', icon: Wallet },
      { name: 'Contribuições', path: '/contributions', icon: HandCoins },
      { name: 'Fundo de Construção', path: '/building-fund', icon: Building2 },
      { name: 'Orçamento', path: '/budget', icon: BarChart },
      { name: 'Património', path: '/assets', icon: Landmark },
      { name: 'Relatórios', path: '/reports', icon: ReceiptText },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    icon: Settings,
    items: [
      { name: 'Administração', path: '/admin', icon: Shield, adminOnly: true },
      { name: 'Suporte & IA', path: '/support', icon: MessageSquare },
      { name: 'Definições', path: '/settings', icon: Settings },
    ],
  },
];

/* Separadores da barra inferior (estilo app Android) — 4 destinos + «Mais» */
const BOTTOM_TABS: NavItem[] = [
  { name: 'Início', path: '/', icon: Home },
  { name: 'Membros', path: '/members', icon: Users },
  { name: 'Finanças', path: '/finances', icon: Wallet },
  { name: 'Rádio', path: '/radio', icon: RadioIcon },
];
const BOTTOM_PATHS = BOTTOM_TABS.map((t) => t.path);

export default function Layout() {
  const { user, signOut, userRole } = useAuth();
  const { openPalette } = useCommandPalette();
  const { isDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [railMenuOpen, setRailMenuOpen] = useState(false);
  const [churchName, setChurchName] = useState('Emanuel - Xangongo');
  const [logoUrl, setLogoUrl] = useState('/logo-iesa.png');
  const [, force] = useState(0);

  /* Sidebar desktop recolhida (persistido; no Android sobrevive via Preferences) */
  const [collapsed, setCollapsed] = useState(() => prefGet('nav-sidebar-collapsed') === '1');
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    prefSet('nav-sidebar-collapsed', next ? '1' : null);
  };

  /* Grupos da sidebar: todos abertos por omissão; colapsáveis */
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  /* estado do mini-player da rádio */
  useEffect(() => livePlayer.subscribe(() => force((n) => n + 1)), []);

  /* FASE 3 — o teclado do Android nunca tapa o campo focado: ao focar um
     campo, centramo-lo no ecrã (imediatamente e após a animação do teclado).
     Em paisagem, onde o espaço é crítico, isto é essencial. */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const center = () => t.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      center();
      clearTimeout(timer);
      timer = setTimeout(center, 350);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      clearTimeout(timer);
    };
  }, []);

  /* Barra de estado nativa acompanha o tema — cor lida do token --background
     em runtime (o StatusBar nativo não conhece vars de CSS) */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const tokenBg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: tokenBg || (isDark ? '#020617' : '#f8fafc') }).catch(() => {});
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

  /* Itens visíveis segundo o papel — MESMA regra de antes (admin vê Administração) */
  const sections = useMemo(
    () =>
      NAV_SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter((i) => !i.adminOnly || userRole === 'admin'),
      })).filter((s) => s.items.length > 0),
    [userRole],
  );
  const navItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  /* Secções para as folhas «Mais» (tudo o que não está na barra inferior) */
  const moreSections = useMemo(
    () =>
      sections
        .map((s) => ({ ...s, items: s.items.filter((i) => !BOTTOM_PATHS.includes(i.path)) }))
        .filter((s) => s.items.length > 0),
    [sections],
  );

  const pageTitle = navItems.find((i) => i.path === location.pathname)?.name ?? 'Gestão IESA';
  const roleLabel =
    userRole === 'admin'
      ? 'Administrador Geral'
      : userRole === 'pastor'
        ? 'Pastor'
        : userRole === 'treasurer'
          ? 'Tesoureiro'
          : 'Acesso Restrito';

  /* Garante que o grupo da página ativa está aberto na sidebar */
  useEffect(() => {
    const sec = sections.find((s) => s.items.some((i) => i.path === location.pathname));
    if (sec) setClosedGroups((g) => (g[sec.id] ? { ...g, [sec.id]: false } : g));
  }, [location.pathname, sections]);

  const showMiniPlayer = (livePlayer.playing || livePlayer.loading) && location.pathname !== '/radio';

  /* ── Partilhado: lista de ligações agrupadas das folhas «Mais» ── */
  const SheetMenuList = ({ twoCols, onNavigate }: { twoCols: boolean; onNavigate: () => void }) => (
    <div className="space-y-4">
      {moreSections.map((s) => (
        <div key={s.id}>
          <p className="px-1 pb-2 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            {s.label}
          </p>
          <div className={twoCols ? 'grid gap-2 min-[480px]:grid-cols-2' : 'grid gap-1.5'}>
            {s.items.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    onNavigate();
                    navigate(item.path);
                  }}
                  className={`flex min-h-12 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-body-sm font-medium transition-colors duration-200 ${
                    active
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border bg-card text-foreground hover:bg-muted active:bg-primary-soft'
                  }`}
                >
                  <item.icon className={`h-5 w-5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="truncate">{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  /* ── Partilhado: conta + terminar sessão no rodapé das folhas ── */
  const SheetUserFooter = ({ onNavigate }: { onNavigate: () => void }) => (
    <div className="shrink-0 space-y-3 border-t border-border bg-card p-3 pb-safe">
      <div className="flex items-center gap-3 rounded-lg bg-muted p-2.5">
        <Avatar className="h-10 w-10 border border-border">
          <AvatarImage src={user?.photoURL || ''} />
          <AvatarFallback className="bg-primary font-medium text-primary-foreground">
            {user?.displayName?.charAt(0) || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-semibold">{user?.displayName}</p>
          <p className="truncate text-caption text-muted-foreground">{roleLabel}</p>
        </div>
      </div>
      <Button
        variant="outline"
        className="h-11 w-full justify-start gap-2"
        onClick={() => {
          onNavigate();
          signOut();
        }}
      >
        <DoorClosed className="h-4 w-4 text-muted-foreground" />
        <span>Terminar Sessão</span>
      </Button>
    </div>
  );

  const logoBlock = (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      <img src={logoUrl} alt="" className="h-full w-full object-cover" />
    </div>
  );

  const avatarSmall = (
    <Avatar className="h-9 w-9 border border-border">
      <AvatarImage src={user?.photoURL || ''} />
      <AvatarFallback className="bg-primary text-body-sm font-medium text-primary-foreground">
        {user?.displayName?.charAt(0) || 'U'}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <div className="flex min-h-dvh bg-background font-sans text-foreground selection:bg-primary/25">
      {/* ═══ RAIL — telemóvel em paisagem (altura < 500 px) ═══
          64 px de largura, rolável, respeita o safe-area do notch */}
      <aside className="nav-rail:z-30 nav-rail:flex hidden w-16 shrink-0 flex-col border-r border-border bg-card pl-safe">
        <nav aria-label="Navegação principal" className="scrollbar-hide flex flex-1 flex-col items-center gap-0.5 overflow-y-auto py-2">
          {sections.map((s, si) => (
            <Fragment key={s.id}>
              {si > 0 && <div aria-hidden className="my-1.5 h-px w-8 bg-border" />}
              {s.items.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    aria-label={item.name}
                    title={item.name}
                    className={`relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors duration-200 ${
                      active
                        ? 'bg-primary-soft text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-primary-soft'
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {active && (
                      <span aria-hidden className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                  </NavLink>
                );
              })}
            </Fragment>
          ))}
        </nav>
        {/* Conta → folha lateral com menu agrupado e sessão */}
        <Sheet open={railMenuOpen} onOpenChange={setRailMenuOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Conta e menu"
              className="m-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border transition-colors duration-200 hover:bg-muted"
            >
              {avatarSmall}
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(20rem,85vw)] gap-0 px-4 pt-3">
            <div className="scroll-native min-h-0 flex-1 overflow-y-auto pb-3">
              {/* O X de fechar (44 px) já vem embutido no SheetContent */}
              <SheetTitle className="pb-3 pr-12 text-title-sm font-semibold">Menu</SheetTitle>
              <SheetMenuList twoCols={false} onNavigate={() => setRailMenuOpen(false)} />
            </div>
            <SheetUserFooter onNavigate={() => setRailMenuOpen(false)} />
          </SheetContent>
        </Sheet>
      </aside>

      {/* ═══ SIDEBAR — tablet/desktop: expansível, grupos colapsáveis ═══ */}
      <aside
        className={`nav-side:z-20 nav-side:flex hidden shrink-0 flex-col border-r border-border bg-card py-4 transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
          collapsed ? 'w-16 px-2' : 'w-64 px-3'
        }`}
      >
        {/* Marca + sino + alternar largura (coluna quando recolhida:
            logótipo → sino → botão de expandir) */}
        <div className={`mb-4 flex items-center gap-1 ${collapsed ? 'flex-col' : 'px-1'}`}>
          {logoBlock}
          {!collapsed && (
            <div className="min-w-0 flex-1 pl-2">
              <p className="truncate text-body-sm font-semibold">Gestão IESA</p>
              <p className="truncate text-caption text-muted-foreground">{churchName}</p>
            </div>
          )}
          <NotificationBell />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>
        </div>

        {/* Comando/busca — atalho sempre visível */}
        {collapsed ? (
          <Button variant="ghost" size="icon" className="mb-2 w-full" onClick={openPalette} title="Pesquisar (Ctrl+K)" aria-label="Pesquisar">
            <Search className="h-5 w-5" />
          </Button>
        ) : (
          <button
            onClick={openPalette}
            className="mb-3 flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 text-body-sm text-muted-foreground transition-colors duration-200 hover:bg-primary-soft hover:text-primary"
          >
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Pesquisar…
            </span>
            <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-caption">Ctrl K</kbd>
          </button>
        )}

        {/* Grupos: acordeão (expandida) ou flyout (recolhida) */}
        <nav aria-label="Navegação principal" className="scrollbar-hide flex-1 space-y-1 overflow-y-auto">
          {sections.map((s) => {
            const open = !closedGroups[s.id];
            const containsActive = s.items.some((i) => i.path === location.pathname);

            if (collapsed) {
              return (
                <Popover key={s.id}>
                  <PopoverTrigger asChild>
                    <button
                      title={s.label}
                      aria-label={s.label}
                      className={`relative flex h-11 w-full items-center justify-center rounded-lg transition-colors duration-200 ${
                        containsActive
                          ? 'bg-primary-soft text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <s.icon className="h-5 w-5" />
                      {containsActive && (
                        <span aria-hidden className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" className="w-60 p-1.5">
                    <p className="px-2 py-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                      {s.label}
                    </p>
                    {s.items.map((item) => {
                      const active = location.pathname === item.path;
                      return (
                        <button
                          key={item.path}
                          onClick={() => navigate(item.path)}
                          className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-body-sm transition-colors duration-200 ${
                            active
                              ? 'bg-primary-soft font-medium text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <item.icon className={`h-5 w-5 shrink-0 ${active ? 'text-primary' : ''}`} />
                          <span className="truncate">{item.name}</span>
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              );
            }

            return (
              <div key={s.id}>
                <button
                  onClick={() => setClosedGroups((g) => ({ ...g, [s.id]: !open }))}
                  aria-expanded={open}
                  className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  {s.label}
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
                </button>
                {open && (
                  <div className="mt-0.5 space-y-0.5">
                    {s.items.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === '/'}
                        className={({ isActive }) =>
                          `relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-body-sm transition-colors duration-200 ${
                            isActive
                              ? 'bg-primary-soft font-medium text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-primary-soft'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span aria-hidden className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                            )}
                            <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-primary' : ''}`} />
                            <span className="truncate">{item.name}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Conta + sessão */}
        <div className="mt-4 border-t border-border pt-3">
          {collapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Conta"
                  className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-muted"
                >
                  {avatarSmall}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-60">
                <div className="px-2 py-1.5">
                  <p className="truncate text-body-sm font-semibold">{user?.displayName}</p>
                  <p className="truncate text-caption text-muted-foreground">{roleLabel}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut} className="min-h-11 text-destructive focus:text-destructive">
                  <DoorClosed className="h-4 w-4" />
                  <span>Terminar Sessão</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted p-2.5">
                {avatarSmall}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold">{user?.displayName}</p>
                  <p className="truncate text-caption text-muted-foreground">{roleLabel}</p>
                </div>
              </div>
              <Button variant="outline" className="h-11 w-full justify-start gap-2 font-medium" onClick={signOut}>
                <DoorClosed className="h-4 w-4 text-muted-foreground" />
                <span>Terminar Sessão</span>
              </Button>
            </>
          )}
        </div>
      </aside>

      {/* Coluna principal — cabeçalho + scroll EM FLUXO (nada fica escondido
          debaixo da barra de navegação) */}
      <main className="relative flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        {/* Cabeçalho compacto — telemóvel (retrato 56 px / paisagem 48 px) */}
        <header className="nav-side:hidden nav-rail:min-h-12 z-30 flex min-h-14 items-center gap-2 border-b border-border bg-card px-3 pt-safe">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-title-sm font-semibold tracking-tight">{pageTitle}</h1>
            <p className="nav-rail:hidden truncate text-caption text-muted-foreground">{churchName}</p>
          </div>
          <div className="flex shrink-0 items-center">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={openPalette} title="Pesquisar (Ctrl+K)" aria-label="Pesquisar">
              <Search className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="nav-rail:p-3 nav-side:p-6 flex-1 overflow-auto p-4">
          <UpdateBanner />
          <ForcePasswordChangeModal />
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
              className="mx-auto max-w-7xl"
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
              className="nav-side:hidden miniplayer-above-nav absolute inset-x-3 z-40"
            >
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-elev-3">
                <button onClick={() => navigate('/radio')} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <RadioIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-semibold leading-tight">Rádio Maranata</span>
                    <span className="block text-caption leading-tight text-muted-foreground">
                      {livePlayer.loading ? 'A ligar…' : 'Em direto · 91.9 FM'}
                    </span>
                  </span>
                </button>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => livePlayer.pause()} title="Pausar emissão" aria-label="Pausar emissão">
                  <Pause className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/radio')} title="Abrir rádio" aria-label="Abrir rádio">
                  <Maximize2 className="h-5 w-5" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ BARRA INFERIOR — telemóvel em retrato: 4 destinos + «Mais» ═══ */}
        <nav
          aria-label="Navegação principal"
          className="nav-side:hidden nav-rail:hidden pb-safe z-30 border-t border-border bg-card"
        >
          <div className="grid grid-cols-5">
            {BOTTOM_TABS.map((t) => {
              const active = location.pathname === t.path;
              return (
                <button
                  key={t.path}
                  onClick={() => navigate(t.path)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-1 py-1.5 text-caption font-medium transition-colors duration-200 ${
                    active ? 'text-primary' : 'text-muted-foreground active:bg-primary-soft'
                  }`}
                >
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
                      active ? 'bg-primary-soft' : ''
                    }`}
                  >
                    <t.icon className="h-5 w-5" />
                  </span>
                  {t.name}
                  {t.path === '/radio' && livePlayer.playing && (
                    <span aria-hidden className="absolute right-1/2 top-2 h-1.5 w-1.5 translate-x-4 rounded-full bg-success" />
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={mobileMenuOpen}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 py-1.5 text-caption font-medium transition-colors duration-200 ${
                mobileMenuOpen ? 'text-primary' : 'text-muted-foreground active:bg-primary-soft'
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
                  mobileMenuOpen ? 'bg-primary-soft' : ''
                }`}
              >
                <MoreHorizontal className="h-5 w-5" />
              </span>
              Mais
            </button>
          </div>
        </nav>
      </main>

      {/* ═══ FOLHA «MAIS» — retrato: fundo, agrupada por secção ═══ */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 px-4 pt-3">
          <div className="scroll-native min-h-0 flex-1 overflow-y-auto pb-3">
            <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
            {/* O X de fechar (44 px) já vem embutido no SheetContent */}
            <SheetTitle className="pb-3 pr-12 text-title-sm font-semibold">Menu</SheetTitle>
            <SheetMenuList twoCols onNavigate={() => setMobileMenuOpen(false)} />
          </div>
          <SheetUserFooter onNavigate={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      {/* Toaster movido para a raiz do App (v1.14.2) — global, cobre login/registro/portal */}
    </div>
  );
}
