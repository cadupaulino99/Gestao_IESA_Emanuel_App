import { useState } from 'react';
import { deliveryOf } from '../lib/tithes';
import { toMonthIdx } from '../lib/months';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Users, Wallet, TrendingUp, HandHeart, Activity, Cake, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/badge';
import { useDevice } from '../hooks/useDevice';
import { AIExecutiveAnalysis } from '../components/finances/AIExecutiveAnalysis';
import { formatKz } from '../lib/money';

export default function Dashboard() {
  const { userRole } = useAuth();
  const { isMobile, isTablet } = useDevice();
  const d = new Date();
  const year = d.getFullYear();
  const currentMonth = d.getMonth() + 1;
  const currentDay = d.getDate();

  const isFinancialStaff = userRole === 'admin' || userRole === 'treasurer';

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', year, isFinancialStaff],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const membersSnapshot = await getDocs(collection(db, 'members'));
        const membersData = membersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        let tithes = 0;
        let offerings = 0;
        let expenses = 0;
        const monthlyData = Array.from({ length: 12 }, (_, i) => ({
          name: format(new Date(year, i), 'MMM', { locale: ptBR }),
          Entradas: 0,
          Saídas: 0,
          Dízimos: 0,
          Ofertas: 0,
          Despesas: 0
        }));
        let activities: any[] = [];

        let budgetStats: any[] = [];
        
        let eventsData: any[] = [];
        let tithesSnapshot: any;
        let offeringsSnapshot: any;
        let expensesSnapshot: any;
        let budgetDoc: any;

        if (isFinancialStaff) {
          const [eSnap, tSnap, oSnap, expSnap, bDoc] = await Promise.all([
            getDocs(query(collection(db, 'events'))),
            getDocs(query(collection(db, 'tithes'), where('year', '==', year))),
            getDocs(query(collection(db, 'offerings'), where('year', '==', year))),
            getDocs(query(collection(db, 'expenses'), where('year', '==', year))),
            getDoc(doc(db, 'budgets', year.toString()))
          ]);
          
          eventsData = eSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
          tithesSnapshot = tSnap;
          offeringsSnapshot = oSnap;
          expensesSnapshot = expSnap;
          budgetDoc = bDoc;
        } else {
          const eSnap = await getDocs(query(collection(db, 'events')));
          eventsData = eSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        }
        
        if (isFinancialStaff) {
          tithesSnapshot.forEach((doc: any) => tithes += doc.data().amount);
          offeringsSnapshot.forEach((doc: any) => offerings += doc.data().amount);
          let budgetData = {
            expectedExpenses_Obras: 0,
            expectedExpenses_Evangelismo: 0,
            expectedExpenses_Sustento: 0,
            expectedExpenses_Administracao: 0,
            expectedExpenses_Outros: 0,
            expectedTithes: 0,
            expectedOfferings: 0,
          };
          if (budgetDoc.exists()) {
            budgetData = { ...budgetData, ...budgetDoc.data() };
          }

          let eObras = 0;
          let eEvangelismo = 0;
          let eSustento = 0;
          let eAdmin = 0;
          let eOutros = 0;

          expensesSnapshot.forEach(doc => {
             const amt = Number(doc.data().amount) || 0;
             expenses += amt;
             const cat = doc.data().category;
             if (cat === "Manutenção e Obras") eObras += amt;
             else if (cat === "Evangelismo/Missões") eEvangelismo += amt;
             else if (cat === "Sustento Pastoral") eSustento += amt;
             else if (cat === "Administração") eAdmin += amt;
             else eOutros += amt;
          });

          // Compute budget stats
          budgetStats = [
            { category: "Manutenção e Obras", actual: eObras, expected: budgetData.expectedExpenses_Obras },
            { category: "Evangelismo/Missões", actual: eEvangelismo, expected: budgetData.expectedExpenses_Evangelismo },
            { category: "Sustento Pastoral", actual: eSustento, expected: budgetData.expectedExpenses_Sustento },
            { category: "Administração", actual: eAdmin, expected: budgetData.expectedExpenses_Administracao },
            { category: "Outras Despesas", actual: eOutros, expected: budgetData.expectedExpenses_Outros }
          ].filter(b => b.expected > 0 || b.actual > 0).map(b => ({
             ...b,
             percentage: b.expected > 0 ? Math.round((b.actual / b.expected) * 100) : 0
          }));

          const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

          tithesSnapshot.forEach(doc => {
            const mText = deliveryOf(doc.data() as any).month;
            const m = MONTHS.indexOf(mText);
            if(m !== -1) {
              monthlyData[m].Entradas += doc.data().amount;
              monthlyData[m].Dízimos += doc.data().amount;
            }
          });
          offeringsSnapshot.forEach(doc => {
            const mText = deliveryOf(doc.data() as any).month;
            const m = MONTHS.indexOf(mText);
            if(m !== -1) {
              monthlyData[m].Entradas += doc.data().amount;
              monthlyData[m].Ofertas += doc.data().amount;
            }
          });
          expensesSnapshot.forEach(doc => {
            const mText = deliveryOf(doc.data() as any).month;
            const m = MONTHS.indexOf(mText);
            if(m !== -1) {
              monthlyData[m].Saídas += doc.data().amount;
              monthlyData[m].Despesas += doc.data().amount;
            }
          });

          // Get Recent activities
          const [recentExpenses, recentOfferings] = await Promise.all([
            getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc'), limit(5))),
            getDocs(query(collection(db, 'offerings'), orderBy('createdAt', 'desc'), limit(5)))
          ]);
          
          activities = [
             ...recentExpenses.docs.map(d => ({...(d.data() as any), type: 'expense', id: d.id})),
             ...recentOfferings.docs.map(d => ({...(d.data() as any), type: 'offering', id: d.id}))
          ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);
        }

        // Demographics
        let statusStats: Record<string, { men: number, women: number }> = {};
        let activeMen = 0;
        let activeWomen = 0;
        let men = 0;
        let women = 0;
        // Tithing stats
        let tithingMenThisMonth = 0;
        let tithingWomenThisMonth = 0;
        let tithingMembersSet = new Set<string>();

        if (isFinancialStaff) {
          const currentMonth = new Date().getMonth() + 1; // 1-12
          const currentYear = new Date().getFullYear();
          const currentMonthTithes = await getDocs(query(collection(db, 'tithes'), where('month', '==', currentMonth), where('year', '==', currentYear)));
          currentMonthTithes.forEach(doc => {
            if (doc.data().memberId) {
              tithingMembersSet.add(doc.data().memberId);
            }
          });
        }
        
        membersData.forEach((m: any) => {
           const genderStr = (m.gender || '').toLowerCase();
           const isMan = genderStr.includes('masc') || genderStr.includes('homem');
           const isWoman = genderStr.includes('fem') || genderStr.includes('mulher');
           
           if (isMan) men++;
           if (isWoman) women++;

           const status = m.status || 'Activo';
           if (!statusStats[status]) {
             statusStats[status] = { men: 0, women: 0 };
           }
           if (isMan) statusStats[status].men++;
           if (isWoman) statusStats[status].women++;

           if (status === 'Activo') {
             if (isMan) activeMen++;
             if (isWoman) activeWomen++;
           }

           if (tithingMembersSet.has(m.id)) {
              if (isMan) tithingMenThisMonth++;
              if (isWoman) tithingWomenThisMonth++;
           }
        });

        const activeMembersGenderArray = [
          { name: 'Homens', value: activeMen, color: '#3b82f6' },
          { name: 'Mulheres', value: activeWomen, color: '#ec4899' },
        ];
        
        const tithingGenderArray = [
          { name: 'Homens', value: tithingMenThisMonth, color: '#3b82f6' },
          { name: 'Mulheres', value: tithingWomenThisMonth, color: '#ec4899' },
        ];

        const birthdays = membersData
          .filter((m: any) => m.birthDate)
          .map((m: any) => {
            const [y, mm, dd] = m.birthDate.split('-');
            return { ...m, bMonth: parseInt(mm, 10), bDay: parseInt(dd, 10) };
          })
          .filter((m: any) => m.bMonth === currentMonth)
          .sort((a: any, b: any) => a.bDay - b.bDay);

        // Find active members who haven't tithed in 3 months
        const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
        let inactiveTithers: any[] = [];
        let topContributors: any[] = [];
        let cellStats: any[] = [];
        let globalRetentionRate = 0;
        
        if (isFinancialStaff) {
            const recentTithesSnapshot = await getDocs(query(collection(db, 'tithes'), where('createdAt', '>=', threeMonthsAgo)));
            
            const uniqueTithesMap = new Map();
            tithesSnapshot.docs.forEach(d => uniqueTithesMap.set(d.id, d.data()));
            recentTithesSnapshot.docs.forEach(d => uniqueTithesMap.set(d.id, d.data()));
            
            const allTithes = Array.from(uniqueTithesMap.values());
            
          inactiveTithers = membersData.filter((m: any) => {
            // Must be active and registered for more than 3 months
            if (m.status && m.status !== 'Activo') return false;
            if (!m.createdAt || m.createdAt > threeMonthsAgo) return false;
            
            // Check if they tithed in the last 3 months
            const memberTithes = allTithes.filter((t: any) => t.memberId === m.id);
            const hasRecentTithe = memberTithes.some((t: any) => {
              // Priority: referenceYear/referenceMonth OR createdAt
              if (t.createdAt) {
                return t.createdAt >= threeMonthsAgo;
              }
              return false;
            });
            
            return !hasRecentTithe;
          });

          // Top 5 Contributors (Current Month)
          const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
          const currMonthText = MONTHS[currentMonth - 1] || 'Janeiro';
          
          const currentMonthTithes = allTithes.filter((t: any) => { const d = deliveryOf(t); return d.month === toMonthIdx(currMonthText) && d.year === year; });
          const memberTotals: Record<string, number> = {};
          currentMonthTithes.forEach((t: any) => {
            if (t.memberId) memberTotals[t.memberId] = (memberTotals[t.memberId] || 0) + (t.amount || 0);
          });
          
          const sortedMembers = Object.entries(memberTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
          topContributors = sortedMembers.map(([mId, amt]) => {
            const mem = membersData.find(m => m.id === mId) as any;
            return { role: mem?.groupCell || mem?.role || 'Membro', amount: amt };
          });

          // Cell performance and retention (Current Year)
          const cStats: Record<string, { totalAmount: number, membersWithTithes: Set<string>, totalMembers: number }> = {};
          membersData.forEach((m: any) => {
            const cell = m.groupCell || 'Sem Célula';
            if (!cStats[cell]) cStats[cell] = { totalAmount: 0, membersWithTithes: new Set(), totalMembers: 0 };
            if (m.status === 'Activo' || !m.status) cStats[cell].totalMembers++;
          });

          const currentYearTithes = allTithes.filter((t: any) => t.year === year);
          currentYearTithes.forEach((t: any) => {
            const mem = membersData.find(m => m.id === t.memberId) as any;
            if (mem) {
              const cell = mem.groupCell || 'Sem Célula';
              cStats[cell].totalAmount += (t.amount || 0);
              cStats[cell].membersWithTithes.add(mem.id);
            }
          });

          cellStats = Object.entries(cStats)
            .map(([name, data]) => ({
              name,
              amount: data.totalAmount,
              retention: data.totalMembers > 0 ? Math.round((data.membersWithTithes.size / data.totalMembers) * 100) : 0
            }))
            .sort((a, b) => b.amount - a.amount);

          const activeMembersCount = membersData.filter((m:any) => m.status === 'Activo' || !m.status).length;
          const tithedMembersSet = new Set(currentYearTithes.map((t:any) => t.memberId));
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
          demographics: activeMembersGenderArray,
          genders: tithingGenderArray,
          statusStats,
          birthdays,
          inactiveTithers,
          topContributors,
          cellStats,
          globalRetentionRate,
          budgetStats,
          events: eventsData
        };
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'dashboard');
        throw error;
      }
    }
  });

  return (
    <div className="space-y-6">
      <div className="relative rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 shadow-lg overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/20 blur-3xl mix-blend-screen" />
        </div>
        <div className="relative z-10">
          <h2 className="text-xl md:text-3xl font-bold tracking-tight text-white mb-2">Painel de Controlo</h2>
          <p className="text-slate-300 max-w-xl">Resumo do ano e indicadores chave do sistema. Visualize rapidamente o progresso financeiro e espiritual da igreja.</p>
        </div>
      </div>

      {isFinancialStaff && !isLoading && stats?.inactiveTithers && stats.inactiveTithers.length > 0 && (
        <Alert variant="destructive" className="bg-red-50/80 backdrop-blur border-red-200/50 shadow-sm">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800 font-semibold">Atenção ao Discipulado</AlertTitle>
          <AlertDescription className="text-red-700">
            Existem <strong>{stats.inactiveTithers.length}</strong> membros activos que completaram mais de 3 meses cadastrados e não entregam dízimos há pelo menos 3 meses. Verifique a aba de 'Pendências' para mais detalhes.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6 flex-wrap bg-white/50 backdrop-blur-md border border-slate-200/50 p-1 shadow-sm rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"><Activity className="h-4 w-4 mr-2" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="members" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"><Users className="h-4 w-4 mr-2" /> Perfil de Membros</TabsTrigger>
          <TabsTrigger value="calendar" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white data-[state=active]:shadow-sm">Calendário</TabsTrigger>
          <TabsTrigger value="birthdays" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"><Cake className="h-4 w-4 mr-2" /> Aniversariantes ({stats?.birthdays?.length || 0})</TabsTrigger>
          {isFinancialStaff && stats?.inactiveTithers && stats.inactiveTithers.length > 0 && (
            <TabsTrigger value="inactive" className="rounded-lg data-[state=active]:bg-red-50 data-[state=active]:text-red-600"><AlertTriangle className="h-4 w-4 mr-2 text-red-500" /> Pendências ({stats.inactiveTithers.length})</TabsTrigger>
          )}
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6 m-0">
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

          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            {isFinancialStaff ? (
              <Card className="bg-gradient-to-br from-card to-card/50 shadow-sm border-l-4 acc-info">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 text-muted-foreground pb-2">
                  <CardTitle className="text-sm font-medium">Saldo Actual (Kz)</CardTitle>
                  <Wallet className="w-4 h-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg md:text-2xl font-bold tabular-nums">{isLoading ? '...' : formatKz(stats?.balance || 0)}</div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-gradient-to-br from-card to-card/50 shadow-sm border-l-4 border-l-slate-300 opacity-70">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 text-muted-foreground pb-2">
                  <CardTitle className="text-sm font-medium">Finanças</CardTitle>
                  <Wallet className="w-4 h-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-sm font-semibold">Acesso Confidencial</div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-gradient-to-br from-card to-card/50 shadow-sm border-l-4 acc-ok">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 text-muted-foreground pb-2">
                <CardTitle className="text-sm font-medium">Membros Registados</CardTitle>
                <Users className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-lg md:text-2xl font-bold tabular-nums">{isLoading ? '...' : stats?.totalMembers || 0}</div>
              </CardContent>
            </Card>

            {isFinancialStaff ? (
              <Card className="bg-gradient-to-br from-card to-card/50 shadow-sm border-l-4 border-l-slate-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 text-muted-foreground pb-2">
                  <CardTitle className="text-sm font-medium">Dízimos (Ano)</CardTitle>
                  <TrendingUp className="w-4 h-4 text-slate-800" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg md:text-2xl font-bold tabular-nums">{isLoading ? '...' : formatKz(stats?.totalTithes || 0)}</div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-gradient-to-br from-card to-card/50 shadow-sm border-l-4 border-l-slate-300 opacity-70">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 text-muted-foreground pb-2">
                  <CardTitle className="text-sm font-medium">Dízimos</CardTitle>
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-sm font-semibold">Acesso Confidencial</div>
                </CardContent>
              </Card>
            )}

            {isFinancialStaff ? (
              <Card className="bg-gradient-to-br from-card to-card/50 shadow-sm border-l-4 acc-gold">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 text-muted-foreground pb-2">
                  <CardTitle className="text-sm font-medium">Ofertas (Ano)</CardTitle>
                  <HandHeart className="w-4 h-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg md:text-2xl font-bold tabular-nums">{isLoading ? '...' : formatKz(stats?.totalOfferings || 0)}</div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-gradient-to-br from-card to-card/50 shadow-sm border-l-4 border-l-slate-300 opacity-70">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 text-muted-foreground pb-2">
                  <CardTitle className="text-sm font-medium">Ofertas</CardTitle>
                  <HandHeart className="w-4 h-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-sm font-semibold">Acesso Confidencial</div>
                </CardContent>
              </Card>
            )}
          </div>

          {isFinancialStaff && (
            <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 shadow-sm min-w-0">
                  <CardHeader>
                    <CardTitle>Balanço Anual e Tendências ({year})</CardTitle>
                    <CardDescription>Visão detalhada de Dízimos, Ofertas e Despesas.</CardDescription>
                  </CardHeader>
                  <CardContent className={isMobile ? "h-[300px]" : "h-[350px]"}>
                    <ResponsiveContainer width="100%" height={isMobile ? 300 : 350}>
                      <LineChart data={stats?.chartData || []} margin={{ left: isMobile ? -25 : 0, right: isMobile ? 0 : 10, top: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: isMobile ? 10 : 12, fill: '#64748b' }} dy={10} />
                        <YAxis fontSize={isMobile ? 10 : 12} tick={{ fill: '#64748b' }} tickFormatter={(value) => `${value}`} axisLine={false} tickLine={false} width={isMobile ? 40 : 60} dx={-10} />
                        <Tooltip cursor={{fill: '#f8fafc'}} formatter={(val) => formatKz(val as number)} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} iconType="circle" />
                        <Line type="monotone" dataKey="Dízimos" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="Ofertas" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              
              <Card className="col-span-3 shadow-sm">
                <CardHeader>
                  <CardTitle>Últimos Movimentos</CardTitle>
                  <CardDescription>Actividades mais recentes de tesouraria.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 text-sm">
                      {isLoading ? (
                        <div className="text-muted-foreground">A carregar...</div>
                      ) : stats?.activities.length === 0 ? (
                        <div className="text-muted-foreground mt-4 border-2 border-dashed p-8 rounded text-center">Nenhuma actividade recente.</div>
                      ) : stats?.activities.map((act) => (
                        <div key={act.id} className="flex justify-between items-center py-2 border-b last:border-0 hover:bg-muted/50 px-2 rounded transition-colors">
                           <div>
                             <p className="font-medium">{act.description || act.contributionDetail || 'Entrada / Saída'}</p>
                             <p className="text-xs text-muted-foreground">{act.type === 'expense' ? act.category : (act.type || 'Oferta/Dízimo')}</p>
                           </div>
                           <div className={`font-bold ${act.type === 'expense' ? 'text-red-500' : 'text-green-600'}`}>
                             {act.type === 'expense' ? '-' : '+'} {formatKz(act.amount)}
                           </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-7 shadow-sm">
                <CardHeader>
                  <CardTitle>Execução Orçamental de Despesas ({year})</CardTitle>
                  <CardDescription>Progresso das categorias de saídas face ao planeado na aba Orçamento.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {isLoading ? (
                      <div className="text-muted-foreground">A carregar...</div>
                    ) : stats?.budgetStats?.length === 0 ? (
                      <div className="text-muted-foreground text-center border-2 border-dashed p-6 rounded col-span-2">Orçamento não definido. Configure-o na aba Orçamento.</div>
                    ) : (
                      stats?.budgetStats?.map((b: any, idx: number) => {
                        const isOver = b.percentage >= 100;
                        return (
                          <div key={idx} className="space-y-2 p-3 border rounded-lg bg-slate-50/50">
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-medium">{b.category}</span>
                              <span className={`font-semibold ${isOver ? 'text-destructive' : 'text-muted-foreground'}`}>
                                 {b.percentage}% esgotado
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden border">
                               <div className={`h-2.5 rounded-full ${isOver ? 'bg-destructive' : 'bg-green-500'}`} style={{ width: `${Math.min(b.percentage, 100)}%`, transition: 'width 0.5s ease-in-out' }}></div>
                            </div>
                            <div className="text-xs text-muted-foreground text-right">
                              {formatKz(b.actual)} / {formatKz(b.expected)}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Maiores Dizimistas / Contribuidores (Mês)</CardTitle>
                  <CardDescription>Top 5 membros anonimizados (apenas por cargo/célula).</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {isLoading ? (
                      <div className="text-muted-foreground">A carregar...</div>
                    ) : stats?.topContributors?.length === 0 ? (
                      <div className="text-muted-foreground text-center border-2 border-dashed p-6 rounded">Sem dízimos registados neste mês.</div>
                    ) : (
                      stats?.topContributors?.map((tc, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b pb-2 last:border-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="px-2"># {idx + 1}</Badge>
                            <span className="font-medium text-sm text-muted-foreground">Membro ({tc.role})</span>
                          </div>
                          <span className="font-bold text-slate-700">
                             {formatKz(tc.amount)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>Taxa de Retenção e Células ({year})</CardTitle>
                      <CardDescription>Taxa global e cruzamento de dízimos por Célula.</CardDescription>
                    </div>
                    {stats?.globalRetentionRate !== undefined && (
                      <Badge variant={stats.globalRetentionRate > 70 ? 'default' : 'destructive'} className="text-sm">
                        {stats.globalRetentionRate}% Retidos
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 pr-2">
                    {isLoading ? (
                      <div className="text-muted-foreground">A carregar...</div>
                    ) : stats?.cellStats?.length === 0 ? (
                      <div className="text-muted-foreground text-center border-2 border-dashed p-6 rounded">Nenhum dado das células encontrado.</div>
                    ) : (
                      stats?.cellStats?.map((cs, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b pb-2 last:border-0 last:pb-0">
                          <div>
                            <p className="font-medium text-sm">{cs.name}</p>
                            <p className="text-xs text-muted-foreground">Taxa de cont. na célula: {cs.retention}%</p>
                          </div>
                          <span className="font-bold text-blue-700">
                            {formatKz(cs.amount)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="members" className="m-0 space-y-6">
           <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Membros Activos (Género)</CardTitle>
                  <CardDescription>Homens vs Mulheres na membresia geral ativa.</CardDescription>
                </CardHeader>
                <CardContent className={isMobile ? "h-[250px] flex items-center justify-center relative" : "h-[300px] flex items-center justify-center relative"}>
                    {!isLoading && stats?.demographics && stats.demographics.every(d => d.value === 0) ? (
                        <div className="text-muted-foreground">Sem dados suficientes</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
                        <PieChart>
                          <Pie
                            data={stats?.demographics || []}
                            cx="50%"
                            cy="50%"
                            innerRadius={isMobile ? 40 : 60}
                            outerRadius={isMobile ? 60 : 90}
                            paddingAngle={5}
                            dataKey="value"
                            nameKey="name"
                          >
                            {stats?.demographics.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dizimistas do Mês (Género)</CardTitle>
                  <CardDescription>Membros que contribuíram com dízimos {format(new Date(), 'MMMM', { locale: ptBR })}</CardDescription>
                </CardHeader>
                <CardContent className={isMobile ? "h-[250px] flex items-center justify-center relative" : "h-[300px] flex items-center justify-center relative"}>
                    {!isLoading && stats?.genders && stats.genders.every(d => d.value === 0) ? (
                        <div className="text-muted-foreground">Sem dados suficientes</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
                        <PieChart>
                          <Pie
                            data={stats?.genders || []}
                            cx="50%"
                            cy="50%"
                            innerRadius={isMobile ? 40 : 60}
                            outerRadius={isMobile ? 60 : 90}
                            paddingAngle={5}
                            dataKey="value"
                            nameKey="name"
                          >
                            {stats?.genders.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle>Membros por Estado</CardTitle>
                  <CardDescription>Distribuição de géneros de acordo com o estado do membro.</CardDescription>
                </CardHeader>
                <CardContent className={isMobile ? "h-[250px] flex items-center justify-center" : "h-[300px] flex items-center justify-center"}>
                    {!isLoading && stats?.statusStats && Object.keys(stats.statusStats).length === 0 ? (
                        <div className="text-muted-foreground">Sem dados suficientes</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
                        <BarChart data={Object.entries(stats?.statusStats || {}).map(([status, counts]) => ({ name: status, Homens: counts.men, Mulheres: counts.women }))} margin={{ left: -20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} />
                          <YAxis tickLine={false} axisLine={false} />
                          <Tooltip cursor={{ fill: '#f1f5f9' }} />
                          <Legend />
                          <Bar dataKey="Homens" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Mulheres" fill="#ec4899" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>
           </div>
        </TabsContent>

        <TabsContent value="calendar" className="m-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agenda da Igreja</CardTitle>
              <CardDescription>Eventos programados, jejuns, vigílias e conferências.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-muted-foreground text-center py-8">A carregar eventos...</div>
              ) : stats?.events?.length === 0 ? (
                <div className="text-muted-foreground border-2 border-dashed p-8 rounded text-center">Nenhum evento registado. O administrador pode adicionar eventos no painel.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {stats?.events
                    ?.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((ev: any) => (
                    <div key={ev.id} className="flex flex-col p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors gap-2">
                       <div className="flex justify-between items-start">
                         <h4 className="font-bold text-lg">{ev.title}</h4>
                         <Badge variant="outline" className="bg-blue-50 text-blue-700 hover:bg-blue-50">Eventos</Badge>
                       </div>
                       <p className="text-sm text-muted-foreground line-clamp-3">{ev.description}</p>
                       <div className="mt-auto pt-4 flex justify-between items-center text-sm font-medium">
                         <span>{new Date(ev.date).toLocaleDateString('pt-AO')}</span>
                         {ev.time && <span className="text-muted-foreground">{ev.time}</span>}
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="birthdays" className="m-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aniversariantes do Mês ({format(d, 'MMMM', { locale: ptBR })})</CardTitle>
              <CardDescription>Membros que celebram aniversário este mês.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {isLoading ? (
                  <div className="text-muted-foreground">A carregar...</div>
                ) : stats?.birthdays?.length === 0 ? (
                  <div className="text-muted-foreground border-2 border-dashed p-8 rounded text-center">Nenhum aniversariante este mês.</div>
                ) : (
                  stats?.birthdays?.map((m: any) => {
                    const isToday = m.bDay === currentDay;
                    return (
                      <div key={m.id} className={`flex justify-between items-center p-3 rounded-lg border ${isToday ? 'bg-orange-50 border-orange-200' : 'bg-card'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${isToday ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            <Cake className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {m.name}
                              {isToday && <Badge className="bg-orange-500 hover:bg-orange-600">Hoje!</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">Dia {m.bDay} - {m.groupCell || 'Membro'}</div>
                          </div>
                        </div>
                        <div className="text-sm font-semibold">
                          {isToday ? 'Parabéns!' : ''}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isFinancialStaff && stats?.inactiveTithers && stats.inactiveTithers.length > 0 && (
          <TabsContent value="inactive" className="m-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Membros Sem Dizimar (Pendências)</CardTitle>
                <CardDescription>Lista de membros activos, há mais de 3 meses na igreja, que não registam dízimos nos últimos 3 meses.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats?.inactiveTithers?.map((m: any) => (
                    <div key={m.id} className="flex justify-between items-center p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {m.phone ? `Tel: ${m.phone} | ` : ''} 
                            Registado em: {m.createdAt ? new Date(m.createdAt).toLocaleDateString('pt-AO') : '-'}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm">
                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Contacto Sugerido</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

