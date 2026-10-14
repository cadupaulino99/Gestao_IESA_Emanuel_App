import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, where, doc, getDoc, setDoc } from 'firebase/firestore';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Pencil, Save, X } from 'lucide-react';

export default function Budget() {
  const currentYear = new Date().getFullYear();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ 
    expectedTithes: 0, 
    expectedOfferings: 0, 
    expectedExpenses_Obras: 0,
    expectedExpenses_Evangelismo: 0,
    expectedExpenses_Sustento: 0,
    expectedExpenses_Administracao: 0,
    expectedExpenses_Outros: 0
  });

  const { data: budgetData, isLoading } = useQuery({
    queryKey: ['budget', currentYear],
    queryFn: async () => {
      try {
        const tithesSnap = await getDocs(query(collection(db, 'tithes'), where('year', '==', currentYear)));
        const offeringsSnap = await getDocs(query(collection(db, 'offerings'), where('year', '==', currentYear)));
        const expensesSnap = await getDocs(query(collection(db, 'expenses'), where('year', '==', currentYear)));

        let tAmount = 0;
        let oAmount = 0;
        let eAmount = 0;
        
        let eObras = 0;
        let eEvangelismo = 0;
        let eSustento = 0;
        let eAdmin = 0;
        let eOutros = 0;

        tithesSnap.forEach(d => tAmount += Number(d.data().amount) || 0);
        offeringsSnap.forEach(d => oAmount += Number(d.data().amount) || 0);
        expensesSnap.forEach(d => {
          const amt = Number(d.data().amount) || 0;
          eAmount += amt;
          const cat = d.data().category;
          if (cat === "Manutenção e Obras") eObras += amt;
          else if (cat === "Evangelismo/Missões") eEvangelismo += amt;
          else if (cat === "Sustento Pastoral") eSustento += amt;
          else if (cat === "Administração") eAdmin += amt;
          else eOutros += amt;
        });

        const budgetDoc = await getDoc(doc(db, 'budgets', currentYear.toString()));
        let bData = {
          expectedTithes: 0,
          expectedOfferings: 0,
          expectedExpenses_Obras: 0,
          expectedExpenses_Evangelismo: 0,
          expectedExpenses_Sustento: 0,
          expectedExpenses_Administracao: 0,
          expectedExpenses_Outros: 0
        };

        if (budgetDoc.exists()) {
          bData = { ...bData, ...budgetDoc.data() };
        }

        const expectedExpenses = bData.expectedExpenses_Obras + bData.expectedExpenses_Evangelismo + bData.expectedExpenses_Sustento + bData.expectedExpenses_Administracao + bData.expectedExpenses_Outros;

        return {
          ...bData,
          expectedExpenses,
          tithes: { expected: bData.expectedTithes, actual: tAmount },
          offerings: { expected: bData.expectedOfferings, actual: oAmount },
          expenses: { expected: expectedExpenses, actual: eAmount },
          obras: { expected: bData.expectedExpenses_Obras, actual: eObras },
          evangelismo: { expected: bData.expectedExpenses_Evangelismo, actual: eEvangelismo },
          sustento: { expected: bData.expectedExpenses_Sustento, actual: eSustento },
          administracao: { expected: bData.expectedExpenses_Administracao, actual: eAdmin },
          outros: { expected: bData.expectedExpenses_Outros, actual: eOutros }
        };
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'multiple');
        throw e;
      }
    }
  });

  useEffect(() => {
    if (budgetData) {
      setEditData({
         expectedTithes: budgetData.expectedTithes,
         expectedOfferings: budgetData.expectedOfferings,
         expectedExpenses_Obras: budgetData.expectedExpenses_Obras,
         expectedExpenses_Evangelismo: budgetData.expectedExpenses_Evangelismo,
         expectedExpenses_Sustento: budgetData.expectedExpenses_Sustento,
         expectedExpenses_Administracao: budgetData.expectedExpenses_Administracao,
         expectedExpenses_Outros: budgetData.expectedExpenses_Outros,
      });
    }
  }, [budgetData]);

  const percentCalc = (actual: number, expected: number) => {
     if(expected === 0) return 0;
     return Math.round((actual / expected) * 100);
  };

  const handleSaveBudget = async () => {
    try {
      await setDoc(doc(db, 'budgets', currentYear.toString()), {
        ...editData,
        year: currentYear,
        updatedAt: Date.now()
      });
      toast.success('Previsão orçamental actualizada.');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['budget', currentYear] });
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'budgets'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Orçamento {currentYear}</h2>
        <p className="text-muted-foreground">Comparação entre orçamento perspectivado vs realizado.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Balanço Anual</CardTitle>
            <CardDescription>Valores previstos vs realizados até ao momento.</CardDescription>
          </div>
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar Previsão
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveBudget}>
                <Save className="h-4 w-4 mr-2" />
                Guardar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Previsto (AOA)</TableHead>
                  <TableHead>Realizado (AOA)</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Calculando...</TableCell></TableRow>
                ) : (
                  <>
                    <TableRow>
                      <TableCell className="font-medium">Entradas Dízimos</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="number" value={editData.expectedTithes} onChange={e => setEditData({...editData, expectedTithes: parseFloat(e.target.value) || 0})} className="w-32 h-8" />
                        ) : new Intl.NumberFormat('pt-AO').format(budgetData?.tithes.expected || 0)}
                      </TableCell>
                      <TableCell>{new Intl.NumberFormat('pt-AO').format(budgetData?.tithes.actual || 0)}</TableCell>
                      <TableCell className={percentCalc(budgetData?.tithes.actual || 0, budgetData?.tithes.expected || 0) >= 100 ? "text-green-600" : "text-amber-500"}>
                         {percentCalc(budgetData?.tithes.actual || 0, budgetData?.tithes.expected || 0)}% alcançado
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Ofertas Diversas</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="number" value={editData.expectedOfferings} onChange={e => setEditData({...editData, expectedOfferings: parseFloat(e.target.value) || 0})} className="w-32 h-8" />
                        ) : new Intl.NumberFormat('pt-AO').format(budgetData?.offerings.expected || 0)}
                      </TableCell>
                      <TableCell>{new Intl.NumberFormat('pt-AO').format(budgetData?.offerings.actual || 0)}</TableCell>
                      <TableCell className={percentCalc(budgetData?.offerings.actual || 0, budgetData?.offerings.expected || 0) >= 100 ? "text-green-600" : "text-amber-500"}>
                         {percentCalc(budgetData?.offerings.actual || 0, budgetData?.offerings.expected || 0)}% alcançado
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium font-bold text-destructive">Total Saídas / Despesas</TableCell>
                      <TableCell className="font-bold text-destructive">
                        {new Intl.NumberFormat('pt-AO').format(budgetData?.expenses.expected || 0)}
                      </TableCell>
                      <TableCell className="font-bold text-destructive">{new Intl.NumberFormat('pt-AO').format(budgetData?.expenses.actual || 0)}</TableCell>
                      <TableCell className={percentCalc(budgetData?.expenses.actual || 0, budgetData?.expenses.expected || 0) >= 100 ? "text-destructive font-bold" : "text-green-600 font-bold"}>
                         {percentCalc(budgetData?.expenses.actual || 0, budgetData?.expenses.expected || 0)}% consumido
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium indent-4">-- Manutenção e Obras</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="number" value={editData.expectedExpenses_Obras} onChange={e => setEditData({...editData, expectedExpenses_Obras: parseFloat(e.target.value) || 0})} className="w-32 h-8" />
                        ) : new Intl.NumberFormat('pt-AO').format(budgetData?.obras.expected || 0)}
                      </TableCell>
                      <TableCell>{new Intl.NumberFormat('pt-AO').format(budgetData?.obras.actual || 0)}</TableCell>
                      <TableCell className={percentCalc(budgetData?.obras.actual || 0, budgetData?.obras.expected || 0) >= 100 ? "text-destructive" : "text-green-600"}>
                         {percentCalc(budgetData?.obras.actual || 0, budgetData?.obras.expected || 0)}% consumido
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium indent-4">-- Evangelismo/Missões</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="number" value={editData.expectedExpenses_Evangelismo} onChange={e => setEditData({...editData, expectedExpenses_Evangelismo: parseFloat(e.target.value) || 0})} className="w-32 h-8" />
                        ) : new Intl.NumberFormat('pt-AO').format(budgetData?.evangelismo.expected || 0)}
                      </TableCell>
                      <TableCell>{new Intl.NumberFormat('pt-AO').format(budgetData?.evangelismo.actual || 0)}</TableCell>
                      <TableCell className={percentCalc(budgetData?.evangelismo.actual || 0, budgetData?.evangelismo.expected || 0) >= 100 ? "text-destructive" : "text-green-600"}>
                         {percentCalc(budgetData?.evangelismo.actual || 0, budgetData?.evangelismo.expected || 0)}% consumido
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium indent-4">-- Sustento Pastoral</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="number" value={editData.expectedExpenses_Sustento} onChange={e => setEditData({...editData, expectedExpenses_Sustento: parseFloat(e.target.value) || 0})} className="w-32 h-8" />
                        ) : new Intl.NumberFormat('pt-AO').format(budgetData?.sustento.expected || 0)}
                      </TableCell>
                      <TableCell>{new Intl.NumberFormat('pt-AO').format(budgetData?.sustento.actual || 0)}</TableCell>
                      <TableCell className={percentCalc(budgetData?.sustento.actual || 0, budgetData?.sustento.expected || 0) >= 100 ? "text-destructive" : "text-green-600"}>
                         {percentCalc(budgetData?.sustento.actual || 0, budgetData?.sustento.expected || 0)}% consumido
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium indent-4">-- Administração</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="number" value={editData.expectedExpenses_Administracao} onChange={e => setEditData({...editData, expectedExpenses_Administracao: parseFloat(e.target.value) || 0})} className="w-32 h-8" />
                        ) : new Intl.NumberFormat('pt-AO').format(budgetData?.administracao.expected || 0)}
                      </TableCell>
                      <TableCell>{new Intl.NumberFormat('pt-AO').format(budgetData?.administracao.actual || 0)}</TableCell>
                      <TableCell className={percentCalc(budgetData?.administracao.actual || 0, budgetData?.administracao.expected || 0) >= 100 ? "text-destructive" : "text-green-600"}>
                         {percentCalc(budgetData?.administracao.actual || 0, budgetData?.administracao.expected || 0)}% consumido
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium indent-4">-- Outras Despesas</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="number" value={editData.expectedExpenses_Outros} onChange={e => setEditData({...editData, expectedExpenses_Outros: parseFloat(e.target.value) || 0})} className="w-32 h-8" />
                        ) : new Intl.NumberFormat('pt-AO').format(budgetData?.outros.expected || 0)}
                      </TableCell>
                      <TableCell>{new Intl.NumberFormat('pt-AO').format(budgetData?.outros.actual || 0)}</TableCell>
                      <TableCell className={percentCalc(budgetData?.outros.actual || 0, budgetData?.outros.expected || 0) >= 100 ? "text-destructive" : "text-green-600"}>
                         {percentCalc(budgetData?.outros.actual || 0, budgetData?.outros.expected || 0)}% consumido
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
