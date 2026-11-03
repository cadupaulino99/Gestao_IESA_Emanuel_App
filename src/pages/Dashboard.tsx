import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deliveryOf } from '../lib/tithes';
import { toMonthIdx } from '../lib/months';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Users, Activity, Cake, AlertTriangle, Handshake, BarChart3, CalendarDays, FileText, ArrowRight, Megaphone, Radio as RadioIcon, Play, Pause, MapPin, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/badge';
import { formatKz } from '../lib/money';
import { AIExecutiveAnalysis } from '../components/finances/AIExecutiveAnalysis';
import { RADIO, livePlayer } from '../lib/radio';
import {
  luandaYear, luandaMonth, luandaMonthStr, luandaMonthNamePT,
  monthNamePT, normalizeBirthDate, isBirthdayToday,
} from '../lib/luanda';

export default function Dashboard() {
  const { userRole } = useAuth();
  const year = luandaYear();
  const currentMonth = luandaMonth();
  const isFinancialStaff = userRole === 'admin' || userRole === 'treasurer';
  const isAdminHome = userRole === 'admin';
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [, tick] = useState(0);
  useEffect(() => livePlayer.subscribe(() => tick((n) => n + 1)), []);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', year, isFinancialStaff],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const membersSnapshot = await getDocs(collection(db, 'members'));
        const membersData = membersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let tithes = 0, offerings = 0, expenses = 0;
        const monthlyData = Array.from({ length: 12 }, (_, i) => ({
          name: monthNamePT(i + 1, true), Entradas: 0, Saídas: 0, Dízimos: 0, Ofertas: 0, Despesas: 0,
        }));
        let activities: any[] = [];
        let budgetStats: any[] = [];
        let eventsData: any[] = [];
        let tithesSnapshot: any, offeringsSnapshot: any, expensesSnapshot: any, budgetDoc: any;

        if (isFinancialStaff) {
          const [eSnap, tSnap, oSnap, expSnap, bDoc] = await Promise.all([
            getDocs(query(collection(db, 'events'))),
            getDocs(query(collection(db, 'tithes'), where('year', '==', year))),
            getDocs(query(collection(db, 'offerings'), where('year', '==', year))),
            getDocs(query(collection(db, 'expenses'), where('year', '==', year))),
            getDoc(doc(db, 'budgets', year.toString())),
          ]);
          eventsData = eSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
          tithesSnapshot = tSnap; offeringsSnapshot = oSnap; expensesSnapshot = expSnap; budgetDoc = bDoc;
        } else {
          const eSnap = await getDocs(query(collection(db, 'events')));
          eventsData = eSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        }

        if (isFinancialStaff) {
          tithesSnapshot.forEach((d: any) => { tithes += d.data().amount; });
          offeringsSnapshot.forEach((d: any) => { offerings += d.data().amount; });
          let budgetData: any = {
            expectedExpenses_Obras: 0, expectedExpenses_Evangelismo: 0, expectedExpenses_Sustento: 0,
            expectedExpenses_Administracao: 0, expectedExpenses_Outros: 0, expectedTithes: 0, expectedOfferings: 0,
          };
          if (budgetDoc.exists()) budgetData = { ...budgetData, ...budgetDoc.data() };
          let eObras = 0, eEvangelismo = 0, eSustento = 0, eAdmin = 0, eOutros = 0;
          expensesSnapshot.forEach((d: any) => {
            const amt = Number(d.data().amount) || 0;
            expenses += amt;
            const cat = d.data().category;
            if (cat === 'Manutenção e Obras') eObras += amt;
            else if (cat === 'Evangelismo/Missões') eEvangelismo += amt;
            else if (cat === 'Sustento Pastoral') eSustento += amt;
            else if (cat === 'Administração') eAdmin += amt;
            else eOutros += amt;
          });
          budgetStats = [
            { category: 'Manutenção e Obras', actual: eObras, expected: budgetData.expectedExpenses_Obras },
            { category: 'Evangelismo/Missões', actual: eEvangelismo, expected: budgetData.expectedExpenses_Evangelismo },
            { category: 'Sustento Pastoral', actual: eSustento, expected: budgetData.expectedExpenses_Sustento },
            { category: 'Administração', actual: eAdmin, expected: budgetData.expectedExpenses_Administracao },
            { category: 'Outras Despesas', actual: eOutros, expected: budgetData.expectedExpenses_Outros },
          ].filter(b => b.expected > 0 || b.actual > 0).map(b => ({
            ...b, percentage: b.expected > 0 ? Math.round((b.actual / b.expected) * 100) : 0,
          }));
          const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
          const addMonth = (snap: any, fieldIn: 'Entradas'|'Saídas', fieldDetail: string) => {
            snap.forEach((d: any) => {
              const m = MONTHS.indexOf(deliveryOf(d.data() as any).month);
              if (m !== -1) {
                monthlyData[m][fieldIn] += d.data().amount;
                (monthlyData[m] as any)[fieldDetail] += d.data().amount;
              }
            });
          };
          addMonth(tithesSnapshot, 'Entradas', 'Dízimos');
          addMonth(offeringsSnapshot, 'Entradas', 'Ofertas');
          addMonth(expensesSnapshot, 'Saídas', 'Despesas');
          const [recentExpenses, recentOfferings] = await Promise.all([
            getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc'), limit(5))),
            getDocs(query(collection(db, 'offerings'), orderBy('createdAt', 'desc'), limit(5))),
          ]);
          activities = [
            ...recentExpenses.docs.map(d => ({ ...(d.data() as any), type: 'expense', id: d.id })),
            ...recentOfferings.docs.map(d => ({ ...(d.data() as any), type: 'offering', id: d.id })),
          ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);
        }

        let activeMen = 0, activeWomen = 0;
        let tithingMenThisMonth = 0, tithingWomenThisMonth = 0;
        const tithingMembersSet = new Set<string>();
        if (isFinancialStaff) {
          const currentMonthStr = luandaMonthStr();
          const currentYear = luandaYear();
          const currentMonthTithes = await getDocs(query(collection(db, 'tithes'), where('month', '==', currentMonthStr), where('year', '==', currentYear)));
          currentMonthTithes.forEach(d => { if (d.data().memberId) tithingMembersSet.add(d.data().memberId); });
        }
        membersData.forEach((m: any) => {
          const g = (m.gender || '').toLowerCase();
          const isMan = g.includes('masc') || g.includes('homem');
          const isWoman = g.includes('fem') || g.includes('mulher');
          const status = m.status || 'Activo';
          if (status === 'Activo') { if (isMan) activeMen++; if (isWoman) activeWomen++; }
          if (tithingMembersSet.has(m.id)) { if (isMan) tithingMenThisMonth++; if (isWoman) tithingWomenThisMonth++; }
        });

        const birthdays = membersData
          .filter((m: any) => m.birthDate)
          .map((m: any) => {
            const iso = normalizeBirthDate(m.birthDate);
            return { ...m, bIso: iso, bMonth: Number(iso.slice(5, 7)), bDay: Number(iso.slice(8, 10)) };
          })
          .filter((m: any) => m.bMonth === currentMonth)
          .sort((a: any, b: any) => a.bDay - b.bDay);

        const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
        let inactiveTithers: any[] = [];
        let globalRetentionRate = 0;

        if (isFinancialStaff) {
          const recentTithesSnapshot = await getDocs(query(collection(db, 'tithes'), where('createdAt', '>=', threeMonthsAgo)));
          const uniqueTithesMap = new Map();
          tithesSnapshot.docs.forEach((d: any) => uniqueTithesMap.set(d.id, d.data()));
          recentTithesSnapshot.docs.forEach((d: any) => uniqueTithesMap.set(d.id, d.data()));
          const allTithes = Array.from(uniqueTithesMap.values());
          inactiveTithers = membersData.filter((m: any) => {
            if (m.status && m.status !== 'Activo') return false;
            if (!m.createdAt || m.createdAt > threeMonthsAgo) return false;
            return !allTithes.some((t: any) => t.memberId === m.id && t.createdAt && t.createdAt >= threeMonthsAgo);
          });
          const activeMembersCount = membersData.filter((m: any) => m.status === 'Activo' || !m.status).length;
          const tithedMembersSet = new Set(allTithes.filter((t: any) => t.year === year).map((t: any) => t.memberId));
          globalRetentionRate = activeMembersCount > 0 ? Math.round((tithedMembersSet.size / activeMembersCount) * 100) : 0;
        }

        const activeMembersCount = membersData.filter((m: any) => m.status === 'Activo' || !m.status).length;
        return {
          totalMembers: membersSnapshot.size,
          activeMembers: activeMembersCount,
          totalTithes: tithes,
          totalOfferings: offerings,
          totalExpenses: expenses,
          balance: tithes + offerings - expenses,
          chartData: monthlyData,
          activities,
          demographics: [
            { name: 'Homens', value: activeMen, color: '#0ea5e9' },
            { name: 'Mulheres', value: activeWomen, color: '#f43f5e' },
          ],
          genders: [
            { name: 'Homens', value: tithingMenThisMonth, color: '#0ea5e9' },
            { name: 'Mulheres', value: tithingWomenThisMonth, color: '#f43f5e' },
          ],
          birthdays,
          inactiveTithers,
          globalRetentionRate,
          budgetStats,
          events: eventsData,
        };
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'dashboard');
        throw error;
      }
    },
  });

  const goTab = (value: string) => {
    setTab(value);
    requestAnimationFrame(() => {
      document.getElementById('inicio-detalhe')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const tiles = [
    { id: 'overview', title: 'Visão Geral', desc: 'Resumo da Igreja', icon: BarChart3, from: 'from-blue-600', to: 'to-blue-500' },
    { id: 'members', title: 'Membros', desc: 'Gerir membros', icon: Users, from: 'from-emerald-600', to: 'to-emerald-500', path: '/members' },
    { id: 'calendar', title: 'Calendário', desc: 'Eventos e agenda', icon: CalendarDays, from: 'from-amber-500', to: 'to-orange-500' },
    { id: 'birthdays', title: 'Aniversariantes', desc: 'Celebre vidas', icon: Cake, from: 'from-violet-600', to: 'to-purple-500' },
    ...(isFinancialStaff
      ? [{ id: 'parecer', title: 'Parecer', desc: 'Análise da tesouraria', icon: FileText, from: 'from-teal-600', to: 'to-cyan-500' }]
      : []),
  ] as const;

  const todayBirthdays = (stats?.birthdays || []).filter((m: any) => isBirthdayToday(m.birthDate));

  const upcomingEvents = (stats?.events || []).slice(0, 3);

  const toggleRadio = async () => {
    if (livePlayer.playing || livePlayer.loading) {
      livePlayer.pause();
      return;
    }
    try { await livePlayer.play(); } catch { /* ok */ }
  };

  return (
    <div className="space-y-3 pb-3">
      {isAdminHome && (
      <>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-700 via-blue-700 to-indigo-800 text-white shadow-md">
        <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 80% 40%, rgba(255,255,255,0.25), transparent 55%)' }} />
        <div className="relative p-3.5 sm:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-100/90">Palavra do dia</p>
          <p className="mt-1 text-[13px] leading-snug text-white/95 sm:text-sm">
            «Porque onde estiverem dois ou três reunidos em meu nome, ali estou eu no meio deles.»
          </p>
          <p className="mt-1.5 text-xs font-semibold text-amber-300">Mateus 18:20</p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 px-0.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
          <Handshake className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white sm:text-lg">Bem-vindo(a)!</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Que a graça de Deus continue guiando o nosso trabalho na Sua Igreja.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if ('path' in t && (t as any).path) {
                  navigate((t as any).path);
                  return;
                }
                goTab(t.id === 'parecer' ? 'overview' : t.id);
                if (t.id === 'parecer') {
                  requestAnimationFrame(() => document.getElementById('parecer-box')?.scrollIntoView({ behavior: 'smooth' }));
                }
              }}
              className={`group relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl bg-gradient-to-br ${t.from} ${t.to} p-3 text-left text-white shadow-md transition active:scale-[0.98]`}
            >
              <Icon className="h-6 w-6 opacity-95" />
              <div className="min-w-0 pr-6">
                <p className="text-sm font-bold leading-tight">{t.title}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-white/85">{t.desc}</p>
              </div>
              <span className="absolute bottom-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <BarChart3 className="h-4 w-4 text-sky-600" /> Resumo da Igreja
          </h3>
          <button type="button" onClick={() => goTab('overview')} className="text-[11px] font-medium text-sky-600 hover:underline">Ver mais</button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-2.5 text-white">
            <p className="text-xl font-bold tabular-nums leading-none">{isLoading ? '…' : stats?.totalMembers ?? 0}</p>
            <p className="mt-1 text-[10px] text-white/90">Membros no total</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-2.5 text-white">
            <p className="text-xl font-bold tabular-nums leading-none">{isLoading ? '…' : stats?.activeMembers ?? 0}</p>
            <p className="mt-1 text-[10px] text-white/90">Membros activos</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 p-2.5 text-white">
            <p className="text-xl font-bold tabular-nums leading-none">{isLoading ? '…' : stats?.events?.length ?? 0}</p>
            <p className="mt-1 text-[10px] text-white/90">Eventos registados</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 p-2.5 text-white">
            <p className="text-xl font-bold tabular-nums leading-none">{isLoading ? '…' : stats?.birthdays?.length ?? 0}</p>
            <p className="mt-1 text-[10px] text-white/90">Aniversários do mês</p>
          </div>
        </div>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Megaphone className="h-4 w-4 text-sky-600" /> Últimas notícias
            </h3>
            <button type="button" onClick={() => goTab('calendar')} className="text-[11px] font-medium text-sky-600 hover:underline">Ver todas</button>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="rounded-xl border border-dashed py-6 text-center text-xs text-muted-foreground">Ainda não há eventos ou avisos.</p>
          ) : (
            <ul className="space-y-2">
              {upcomingEvents.map((ev: any) => (
                <li key={ev.id} className="flex gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-lg dark:bg-sky-950">📖</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{ev.title || ev.name || 'Evento'}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />{ev.date || ev.when || 'Data a definir'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {todayBirthdays.length > 0 && (
            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50/80 px-2.5 py-2 dark:border-rose-900 dark:bg-rose-950/30">
              <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                🎂 Hoje: {todayBirthdays.map((m: any) => m.name).join(', ')}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <RadioIcon className="h-4 w-4 text-sky-600" /> {RADIO.name}
            </h3>
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{RADIO.freq} · Louvor, Palavra e Vida</p>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={toggleRadio} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white shadow-md active:scale-95" aria-label={livePlayer.playing ? 'Pausar' : 'Tocar'}>
              {livePlayer.loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : livePlayer.playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className={`h-full rounded-full bg-sky-500 ${livePlayer.playing ? 'w-2/3 animate-pulse' : 'w-0'}`} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {livePlayer.playing ? 'A tocar ao vivo' : livePlayer.loading ? 'A ligar…' : 'Parado'}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => navigate('/radio')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            <RadioIcon className="h-3.5 w-3.5" /> Ouça a {RADIO.name}
          </button>
        </div>
      </div>

      {isFinancialStaff && !isLoading && stats?.inactiveTithers && stats.inactiveTithers.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50/90 py-3 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900 dark:text-amber-100">Pendências de discipulado</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200/90">
            <strong>{stats.inactiveTithers.length}</strong> membros activos sem dízimo nos últimos 3 meses.
          </AlertDescription>
        </Alert>
      )}
      </>
      )}

      {!isAdminHome && (
        <div className="space-y-1 px-0.5 pb-1">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Início</h2>
          <p className="text-sm text-muted-foreground">Resumo operacional da sua área.</p>
        </div>
      )}

      <div id="inicio-detalhe">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mb-3 h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200/70 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900/60">
            <TabsTrigger value="overview" className="rounded-lg px-2.5 py-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800"><Activity className="mr-1 h-3.5 w-3.5" /> Visão Geral</TabsTrigger>
            <TabsTrigger value="members" className="rounded-lg px-2.5 py-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800"><Users className="mr-1 h-3.5 w-3.5" /> Membros</TabsTrigger>
            <TabsTrigger value="calendar" className="rounded-lg px-2.5 py-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800">Calendário</TabsTrigger>
            <TabsTrigger value="birthdays" className="rounded-lg px-2.5 py-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800"><Cake className="mr-1 h-3.5 w-3.5" /> Aniversários ({stats?.birthdays?.length || 0})</TabsTrigger>
            {isFinancialStaff && !!stats?.inactiveTithers?.length && (
              <TabsTrigger value="inactive" className="rounded-lg px-2.5 py-1.5 text-xs data-[state=active]:bg-amber-50 data-[state=active]:text-amber-800"><AlertTriangle className="mr-1 h-3.5 w-3.5 text-amber-500" /> Pendências</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="m-0 space-y-3">
            {isFinancialStaff && !isLoading && stats && (
              <div id="parecer-box">
                <AIExecutiveAnalysis financialStats={{
                  totalTithes: stats.totalTithes || 0,
                  totalOfferings: stats.totalOfferings || 0,
                  totalExpenses: stats.totalExpenses || 0,
                  balance: stats.balance || 0,
                  totalMembers: stats.totalMembers || 0,
                  activeMembers: stats.activeMembers || 0,
                  year,
                }} />
              </div>
            )}
            {isFinancialStaff && (
              <div className="grid gap-3 lg:grid-cols-12">
                <Card className="border-slate-200/80 shadow-sm lg:col-span-7">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Fluxo mensal ({year})</CardTitle>
                  </CardHeader>
                  <CardContent className="h-52 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats?.chartData || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                        <Tooltip formatter={(v: any) => formatKz(Number(v) || 0)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="Saídas" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="border-slate-200/80 shadow-sm lg:col-span-5">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Movimentos recentes</CardTitle></CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {!stats?.activities?.length ? (
                      <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">Sem movimentos recentes.</p>
                    ) : stats.activities.map((act: any) => (
                      <div key={act.id} className="flex items-center justify-between rounded-lg border bg-slate-50/60 px-2.5 py-2 dark:bg-slate-900/40">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{act.description || act.category || (act.type === 'expense' ? 'Despesa' : 'Oferta')}</p>
                          <p className="text-[10px] text-muted-foreground">{act.createdAt ? new Date(act.createdAt).toLocaleDateString('pt-AO') : '—'}</p>
                        </div>
                        <span className={`shrink-0 text-xs font-semibold tabular-nums ${act.type === 'expense' ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {act.type === 'expense' ? '−' : '+'}{formatKz(act.amount)}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="members" className="m-0 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Membros activos por género</CardTitle></CardHeader>
                <CardContent className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats?.demographics || []} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
                        {(stats?.demographics || []).map((e: any, i: number) => (<Cell key={i} fill={e.color} />))}
                      </Pie>
                      <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Gestão de membros</CardTitle></CardHeader>
                <CardContent>
                  <button type="button" onClick={() => navigate('/members')} className="flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-900">
                    Ir para Membros <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="calendar" className="m-0">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Eventos da igreja</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!stats?.events?.length ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">Ainda não há eventos registados.</p>
                ) : stats.events.slice(0, 12).map((ev: any) => (
                  <div key={ev.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{ev.title || ev.name || 'Evento'}</p>
                      <p className="text-[11px] text-muted-foreground">{ev.date || ev.when || 'Data a definir'}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{ev.type || 'Evento'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="birthdays" className="m-0">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Aniversariantes de {luandaMonthNamePT()}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!stats?.birthdays?.length ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">Sem aniversários este mês.</p>
                ) : stats.birthdays.map((m: any) => {
                  const isToday = isBirthdayToday(m.birthDate);
                  return (
                    <div key={m.id} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${isToday ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/30' : 'bg-card'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isToday ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}><Cake className="h-4 w-4" /></div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{m.name}</span>
                            {isToday && <Badge className="bg-rose-500 text-[10px]">Hoje!</Badge>}
                          </div>
                          <p className="text-[11px] text-muted-foreground">Dia {m.bDay} · {m.groupCell || 'Membro'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {isFinancialStaff && !!stats?.inactiveTithers?.length && (
            <TabsContent value="inactive" className="m-0">
              <Card className="shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Sem dízimo recente</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {stats.inactiveTithers.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="h-4 w-4" /></div>
                        <div>
                          <p className="text-sm font-medium">{m.name}</p>
                          <p className="text-[11px] text-muted-foreground">{m.phone ? `Tel: ${m.phone}` : '—'}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-800">Contactar</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
