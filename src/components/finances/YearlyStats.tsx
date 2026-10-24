import React, { useEffect, useState } from 'react';
import { MONTHS_IDX, MONTHS_SHORT } from '../../types';
import { deliveryOf } from '../../lib/tithes';
import { toMonthIdx } from '../../lib/months';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { useDevice } from '../../hooks/useDevice';
import { formatKz } from '../../lib/money';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const COLORS = ['#0f172a', '#ef4444', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6'];

export function YearlyStats({ year }: { year: string }) {
  const { isMobile } = useDevice();
  const [data, setData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const numYear = parseInt(year);
        const tithesSnap = await getDocs(query(collection(db, 'tithes'), where('year', '==', numYear)));
        const offeringsSnap = await getDocs(query(collection(db, 'offerings'), where('year', '==', numYear)));
        const expensesSnap = await getDocs(query(collection(db, 'expenses'), where('year', '==', numYear)));
        
        // chaves canónicas '01'..'12' (v1.9.3); name só para exibição
        const monthlyData = MONTHS_IDX.reduce((acc, mi) => {
          acc[mi] = { name: MONTHS_SHORT[MONTHS_IDX.indexOf(mi as any)], Entradas: 0, Saídas: 0 };
          return acc;
        }, {} as Record<string, any>);

        tithesSnap.forEach(doc => {
          const d = doc.data();
          const dm = deliveryOf(d as any).month;
          if (monthlyData[dm]) monthlyData[dm].Entradas += d.amount;
        });
        offeringsSnap.forEach(doc => {
          const d = doc.data();
          const dm = toMonthIdx(d.month);
          if (monthlyData[dm]) monthlyData[dm].Entradas += d.amount;
        });

        const categoryMap: Record<string, number> = {};
        expensesSnap.forEach(doc => {
          const d = doc.data();
          const dm = toMonthIdx(d.month);
          if (monthlyData[dm]) monthlyData[dm].Saídas += d.amount;
          
          categoryMap[d.category] = (categoryMap[d.category] || 0) + d.amount;
        });

        setData(Object.values(monthlyData));
        
        const catData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));
        setCategoryData(catData);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'multiple');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [year]);

  if (loading) return <div className="py-8 text-center text-muted-foreground">A carregar estatísticas...</div>;

  return (
    <div className="grid gap-6 md:grid-cols-2 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Entradas vs Saídas ({year})</CardTitle>
          <CardDescription>Evolução financeira ao longo dos meses.</CardDescription>
        </CardHeader>
        <CardContent className={isMobile ? "h-[250px]" : "h-[300px]"}>
          <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
            <BarChart data={data} margin={{ left: isMobile ? -25 : 0, right: isMobile ? 0 : 10, top: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: isMobile ? 10 : 12, fill: '#64748b' }} dy={10} />
              <YAxis fontSize={isMobile ? 10 : 12} tickFormatter={(value) => formatKz(value as number)} axisLine={false} tickLine={false} width={isMobile ? 40 : 60} tick={{ fill: '#64748b' }} dx={-10} />
              <RechartsTooltip formatter={(value: number) => formatKz(value)} cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '12px', paddingTop: '10px' }} iconType="circle" />
              <Bar dataKey="Entradas" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={isMobile ? 12 : 20} />
              <Bar dataKey="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={isMobile ? 12 : 20} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Despesas por Categoria</CardTitle>
          <CardDescription>Distribuição de gastos no ano corrente.</CardDescription>
        </CardHeader>
        <CardContent className={isMobile ? "h-[250px]" : "h-[300px]"}>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={isMobile ? 45 : 70} outerRadius={isMobile ? 65 : 90} paddingAngle={5} dataKey="value">
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number) => formatKz(value)} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }} iconType="circle" verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Sem dados de despesas.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
