import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function Obligations() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  const { data: obligationsData, isLoading } = useQuery({
    queryKey: ['obligations', selectedYear],
    queryFn: async () => {
      try {
        const offeringsSnap = await getDocs(query(collection(db, 'offerings'), where('year', '==', parseInt(selectedYear))));
        const tithesSnap = await getDocs(query(collection(db, 'tithes'), where('year', '==', parseInt(selectedYear))));
        
        let missoesData: any = { total: 0, byMonth: {} };
        let prevSocialData: any = { total: 0, byMonth: {} };
        let literaturasData: any = { total: 0, byMonth: {} };

        MONTHS.forEach(m => {
          missoesData.byMonth[m] = 0;
          prevSocialData.byMonth[m] = 0;
          literaturasData.byMonth[m] = 0;
        });

        const processItem = (pMonth: string, val: number, typeStr: string) => {
          if (typeStr === 'Missões' || typeStr === 'Fundo para missões') {
            missoesData.total += val;
            missoesData.byMonth[pMonth] = (missoesData.byMonth[pMonth] || 0) + val;
          } else if (typeStr === 'Segurança Social') {
            prevSocialData.total += val;
            prevSocialData.byMonth[pMonth] = (prevSocialData.byMonth[pMonth] || 0) + val;
          } else if (typeStr === 'Literaturas' || typeStr === 'Compra de Literatura') {
            literaturasData.total += val;
            literaturasData.byMonth[pMonth] = (literaturasData.byMonth[pMonth] || 0) + val;
          }
        };

        offeringsSnap.forEach(d => {
          const dt = d.data();
          const pMonth = dt.month || MONTHS[0];
          const val = dt.amount || 0;
          processItem(pMonth, val, dt.type);
        });

        tithesSnap.forEach(d => {
          const dt = d.data();
          const pMonth = dt.referenceMonth || dt.month || MONTHS[0];
          const val = dt.amount || 0;
          processItem(pMonth, val, dt.contributionType);
        });

        return {
          missoes: missoesData,
          seguranca: prevSocialData,
          literaturas: literaturasData
        };
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'multiple');
        throw e;
      }
    }
  });

  const getYearOptions = () => {
    const years = [];
    for (let y = currentYear - 5; y <= currentYear + 2; y++) years.push(y.toString());
    return years.sort((a,b)=>parseInt(b)-parseInt(a));
  };

  const formatAOA = (amount: number) => {
    return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Obrigações / Direcção Geral</h2>
          <p className="text-muted-foreground text-sm">Resumo mensal e geral das contribuições destinadas à Direcção Geral</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {getYearOptions().map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-t-4 border-t-amber-500 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Fundo para Missões</CardTitle>
            <CardDescription>Total arrecadado em {selectedYear}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">
              {isLoading ? '...' : formatAOA(obligationsData?.missoes.total || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-blue-500 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Segurança Social</CardTitle>
            <CardDescription>Total arrecadado em {selectedYear}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {isLoading ? '...' : formatAOA(obligationsData?.seguranca.total || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-purple-500 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Literaturas</CardTitle>
            <CardDescription>Total arrecadado em {selectedYear}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {isLoading ? '...' : formatAOA(obligationsData?.literaturas.total || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Detalhe Mensal ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40 font-bold">Mês</TableHead>
                  <TableHead className="font-bold">Fundo para Missões</TableHead>
                  <TableHead className="font-bold">Segurança Social</TableHead>
                  <TableHead className="font-bold">Literaturas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">A carregar...</TableCell></TableRow>
                ) : (
                  MONTHS.map(month => (
                    <TableRow key={month} className="hover:bg-slate-50">
                      <TableCell className="font-medium">{month}</TableCell>
                      <TableCell>{formatAOA(obligationsData?.missoes.byMonth[month] || 0)}</TableCell>
                      <TableCell>{formatAOA(obligationsData?.seguranca.byMonth[month] || 0)}</TableCell>
                      <TableCell>{formatAOA(obligationsData?.literaturas.byMonth[month] || 0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
