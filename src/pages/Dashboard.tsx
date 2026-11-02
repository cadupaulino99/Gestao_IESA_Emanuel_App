import { useState } from 'react';
import { deliveryOf } from '../lib/tithes';
import { toMonthIdx } from '../lib/months';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Users, Wallet, TrendingUp, HandHeart, Activity, Cake, AlertTriangle, Heart } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/badge';
import { useDevice } from '../hooks/useDevice';
import { formatKz } from '../lib/money';
import { AIExecutiveAnalysis } from '../components/finances/AIExecutiveAnalysis';
import {
  luandaYear, luandaMonth, luandaDayOfMonth, luandaMonthStr, luandaMonthNamePT,
  monthNamePT, normalizeBirthDate, isBirthdayToday,
} from '../lib/luanda';

export default function Dashboard() {
  const { userRole } = useAuth();
  const { isMobile, isTablet } = useDevice();
  const year = luandaYear();
  const currentMonth = luandaMonth();
  const currentDay = luandaDayOfMonth();
  const isFinancialStaff = userRole === 'admin' || userRole === 'treasurer';

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

        let statusStats: Record<string, { men: number; women: number }> = {};
        let activeMen = 0, activeWomen = 0, men = 0, women = 0;
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
          if (isMan) men++; if (isWoman) women++;
          const status = m.status || 'Activo';
          if (!statusStats[status]) statusStats[status] = { men: 0, women: 0 };
          if (isMan) statusStats[status].men++;
          if (isWoman) statusStats[status].women++;
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
        let topContributors: any[] = [];
        let cellStats: any[] = [];
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
          const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
          const currMonthText = MONTHS[currentMonth - 1] || 'Janeiro';
          const currentMonthTithes = allTithes.filter((t: any) => {
            const d = deliveryOf(t); return d.month === toMonthIdx(currMonthText) && d.year === year;
          });
          const memberTotals: Record<string, number> = {};
          currentMonthTithes.forEach((t: any) => {
            if (t.memberId) memberTotals[t.memberId] = (memberTotals[t.memberId] || 0) + (t.amount || 0);
          });
          topContributors = Object.entries(memberTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([mId, amt]) => {
            const mem = membersData.find((m: any) => m.id === mId) as any;
            return { role: mem?.groupCell || mem?.role || 'Membro', amount: amt };
          });
          const cStats: Record<string, { totalAmount: number; membersWithTithes: Set<string>; totalMembers: number }> = {};
          membersData.forEach((m: any) => {
            const cell = m.groupCell || 'Sem Célula';
            if (!cStats[cell]) cStats[cell] = { totalAmount: 0, membersWithTithes: new Set(), totalMembers: 0 };
            if (m.status === 'Activo' || !m.status) cStats[cell].totalMembers++;
          });
          allTithes.filter((t: any) => t.year === year).forEach((t: any) => {
            const mem = membersData.find((m: any) => m.id === t.memberId) as any;
            if (mem) {
              const cell = mem.groupCell || 'Sem Célula';
              cStats[cell].totalAmount += (t.amount || 0);
              cStats[cell].membersWithTithes.add(mem.id);
            }
          });
          cellStats = Object.entries(cStats).map(([name, data]) => ({
            name, amount: data.totalAmount,
            retention: data.totalMembers > 0 ? Math.round((data.membersWithTithes.size / data.totalMembers) * 100) : 0,
          })).sort((a, b) => b.amount - a.amount);
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
          statusStats,
          birthdays,
          inactiveTithers,
          topContributors,
          cellStats,
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

  const tabCls = 'rounded-lg px-2.5 py-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white';

  return (
    <div className="space-y-4 pb-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Igreja · {luandaMonthNamePT()} {year}
          </p>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Bom trabalho hoje</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Resumo claro do que importa — membros, finanças e vida da igreja.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <Heart className="h-3.5 w-3.5 fill-current opacity-80" />
          {isLoading ? '…' : `${stats?.activeMembers ?? 0} membros activos`}
        </div>
      </div>

      {isFinancialStaff && !isLoading && stats?.inactiveTithers && stats.inactiveTithers.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50/90 py-3 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-900 dark:text-amber-100">Pendências de discipulado</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200/90">
            <strong>{stats.inactiveTithers.length}</strong> membros activos sem dízimo nos últimos 3 meses. Veja a aba Pendências.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-3 h-auto flex-wrap gap-1 rounded-xl border border-slate-200/70 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900/60">
          <TabsTrigger value="overview" className={tabCls}><Activity className="mr-1.5 h-3.5 w-3.5" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="members" className={tabCls}><Users className="mr-1.5 h-3.5 w-3.5" /> Membros</TabsTrigger>
          <TabsTrigger value="calendar" className={tabCls}>Calendário</TabsTrigger>
          <TabsTrigger value="birthdays" className={tabCls}><Cake className="mr-1.5 h-3.5 w-3.5" /> Aniversários ({stats?.birthdays?.length || 0})</TabsTrigger>
          {isFinancialStaff && !!stats?.inactiveTithers?.length && (
            <TabsTrigger value="inactive" className="rounded-lg px-2.5 py-1.5 text-xs data-[state=active]:bg-amber-50 data-[state=active]:text-amber-800">
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5 text-amber-500" /> Pendências ({stats.inactiveTithers.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="m-0 space-y-3">
          {isFinancialStaff && !isLoading && stats && (
            <AIExecutiveAnalysis
              financialStats={{
                totalTithes: stats.totalTithes || 0,
                totalOfferings: stats.totalOfferings || 0,
                totalExpenses: stats.totalExpenses || 0,
                balance: stats.balance || 0,
                totalMembers: stats.totalMembers || 0,
                activeMembers: stats.activeMembers || 0,
                year: year,
              }}
            />
          )}

          <div className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
            <Card className="border-l-4 border-l-sky-500 bg-gradient-to-br from-sky-50/80 to-white shadow-sm dark:from-sky-950/30 dark:to-slate-950">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 text-muted-foreground">
                <CardTitle className="text-xs font-medium sm:text-sm">{isFinancialStaff ? 'Saldo do ano' : 'Finanças'}</CardTitle>
                <Wallet className="h-4 w-4 text-sky-500" />
              </CardHeader>
              <CardContent>
                <div className="text-base font-bold tabular-nums tracking-tight md:text-xl">
                  {isLoading ? '…' : isFinancialStaff ? formatKz(stats?.balance || 0) : 'Confidencial'}
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-50/80 to-white shadow-sm dark:from-emerald-950/30 dark:to-slate-950">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 text-muted-foreground">
                <CardTitle className="text-xs font-medium sm:text-sm">Membros</CardTitle>
                <Users className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-base font-bold tabular-nums tracking-tight md:text-xl">{isLoading ? '…' : stats?.totalMembers || 0}</div>
                <p className="text-[10px] text-muted-foreground">{stats?.activeMembers ?? 0} activos</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50/80 to-white shadow-sm dark:from-amber-950/30 dark:to-slate-950">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 text-muted-foreground">
                <CardTitle className="text-xs font-medium sm:text-sm">{isFinancialStaff ? 'Dízimos' : 'Ofertas'}</CardTitle>
                <HandHeart className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-base font-bold tabular-nums tracking-tight md:text-xl">
                  {isLoading ? '…' : isFinancialStaff ? formatKz(stats?.totalTithes || 0) : '—'}
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-50/80 to-white shadow-sm dark:from-rose-950/30 dark:to-slate-950">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 text-muted-foreground">
                <CardTitle className="text-xs font-medium sm:text-sm">{isFinancialStaff ? 'Despesas' : 'Retenção'}</CardTitle>
                <TrendingUp className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-base font-bold tabular-nums tracking-tight md:text-xl">
                  {isLoading ? '…' : isFinancialStaff ? formatKz(stats?.totalExpenses || 0) : `${stats?.globalRetentionRate || 0}%`}
                </div>
              </CardContent>
            </Card>
          </div>

          {isFinancialStaff && (
            <div className="grid gap-3 lg:grid-cols-12">
              <Card className="border-slate-200/80 shadow-sm lg:col-span-7">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Fluxo mensal ({year})</CardTitle>
                  <CardDescription className="text-xs">Entradas vs saídas ao longo do ano</CardDescription>
                </CardHeader>
                <CardContent className="h-56 pt-0">
                  {isLoading ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">A carregar…</div>
                  ) : (
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
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 shadow-sm lg:col-span-5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Movimentos recentes</CardTitle>
                  <CardDescription className="text-xs">Últimos registos de ofertas e despesas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {isLoading ? (
                    <p className="text-sm text-muted-foreground">A carregar…</p>
                  ) : !stats?.activities?.length ? (
                    <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">Sem movimentos recentes.</p>
                  ) : (
                    stats.activities.map((act: any) => (
                      <div key={act.id} className="flex items-center justify-between rounded-lg border bg-slate-50/60 px-2.5 py-2 dark:bg-slate-900/40">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{act.description || act.category || (act.type === 'expense' ? 'Despesa' : 'Oferta')}</p>
                          <p className="text-[10px] text-muted-foreground">{act.createdAt ? new Date(act.createdAt).toLocaleDateString('pt-AO') : '—'}</p>
                        </div>
                        <span className={`shrink-0 text-xs font-semibold tabular-nums ${act.type === 'expense' ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {act.type === 'expense' ? '−' : '+'}{formatKz(act.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 shadow-sm lg:col-span-12">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Execução orçamental</CardTitle>
                  <CardDescription className="text-xs">Despesas face ao planeado em {year}</CardDescription>
                </CardHeader>
                <CardContent>
                  {!stats?.budgetStats?.length ? (
                    <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">Orçamento por definir na aba Orçamento.</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {stats.budgetStats.map((b: any, idx: number) => {
                        const over = b.percentage >= 100;
                        return (
                          <div key={idx} className="space-y-1.5 rounded-xl border bg-slate-50/50 p-3 dark:bg-slate-900/40">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">{b.category}</span>
                              <span className={over ? 'font-semibold text-rose-600' : 'text-muted-foreground'}>{b.percentage}%</span>
                            </div>
                            <div className="-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                              <div className={`h-full rounded-full ${over ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(b.percentage, 100)}%` }} />
                            </div>
                            <p className="text-right text-[10px] text-muted-foreground">{formatKz(b.actual)} / {formatKz(b.expected)}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="members" className="m-0 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Membros activos por género</CardTitle>
              </CardHeader>
              <CardContent className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats?.demographics || []} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
                      {(stats?.demographics || []).map((e: any, i: number) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {isFinancialStaff && (
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Dizimistas deste mês</CardTitle>
                </CardHeader>
                <CardContent className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats?.genders || []} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
                        {(stats?.genders || []).map((e: any, i: number) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="m-0">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Eventos da igreja</CardTitle>
              <CardDescription className="text-xs">Próximas actividades registadas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!stats?.events?.length ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Ainda não há eventos registados.</p>
              ) : (
                stats.events.slice(0, 12).map((ev: any) => (
                  <div key={ev.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{ev.title || ev.name || 'Evento'}</p>
                      <p className="text-[11px] text-muted-foreground">{ev.date || ev.when || 'Data a definir'}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{ev.type || 'Evento'}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="birthdays" className="m-0">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Aniversariantes de {luandaMonthNamePT()}</CardTitle>
              <CardDescription className="text-xs">Celebre com a família da fé</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!stats?.birthdays?.length ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Sem aniversários este mês.</p>
              ) : (
                stats.birthdays.map((m: any) => {
                  const isToday = isBirthdayToday(m.birthDate);
                  return (
                    <div key={m.id} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${isToday ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/30' : 'bg-card'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isToday ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}>
                          <Cake className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{m.name}</span>
                            {isToday && <Badge className="bg-rose-500 text-[10px] hover:bg-rose-600">Hoje!</Badge>}
                          </div>
                          <p className="text-[11px] text-muted-foreground">Dia {m.bDay} · {m.groupCell || 'Membro'}</p>
                        </div>
                      </div>
                      {isToday && <span className="text-xs font-semibold text-rose-600">Parabéns!</span>}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isFinancialStaff && !!stats?.inactiveTithers?.length && (
          <TabsContent value="inactive" className="m-0">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sem dízimo recente</CardTitle>
                <CardDescription className="text-xs">Activos há +3 meses, sem registo nos últimos 3 meses</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.inactiveTithers.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {m.phone ? `Tel: ${m.phone} · ` : ''}Registo: {m.createdAt ? new Date(m.createdAt).toLocaleDateString('pt-AO') : '—'}
                        </p>
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
  );
}
