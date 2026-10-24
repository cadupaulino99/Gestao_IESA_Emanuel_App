import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Target, TrendingUp, Plus, Trash2, Pencil } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, where } from 'firebase/firestore';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { useState } from 'react';
import { useConfirm } from '../context/ConfirmContext';
import { moveToTrash, isRecordLocked } from '../lib/trash';
import { getDoc } from 'firebase/firestore';

const fundSchema = z.object({
  type: z.enum(['IN', 'OUT']),
  description: z.string().min(2, "Descrição inválida"),
  amount: z.coerce.number().min(1, "Valor inválido"),
  date: z.string().min(10).max(10), // Expected YYYY-MM-DD
});

type FundForm = z.infer<typeof fundSchema>;

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

import { useAuth } from '../context/AuthContext';

export default function BuildingFund() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const confirmDialog = useConfirm();
  const today = new Date().toISOString().substring(0, 10);

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch, clearErrors } = useForm({
    resolver: zodResolver(fundSchema),
    defaultValues: { type: 'IN', date: today }
  });

  const { data: fundData, isLoading } = useQuery({
    queryKey: ['buildingFund'],
    queryFn: async () => {
      try {
        const snap = await getDocs(query(collection(db, 'buildingFunds'), orderBy('createdAt', 'desc')));
        let totalReceived = 0;
        let totalSpent = 0;
        
        const history: any[] = [];
        
        // Group by YYYY-MM
        const monthlyStats: Record<string, number> = {};

        snap.docs.forEach(d => {
          const dt = d.data() as any;
          const item = { id: d.id, ...dt };
          history.push(item);
          
          if (item.type === 'IN') {
            totalReceived += item.amount;
            const monthKey = item.date?.substring(0,7) || 'Outros';
            monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + item.amount;
          } else {
            totalSpent += item.amount;
          }
        });

        const chartData = Object.entries(monthlyStats).slice(0, 6).map(([name, Valor]) => ({ name, Valor })).reverse();

        return {
          totalReceived,
          totalSpent,
          balance: totalReceived - totalSpent,
          history,
          chartData: chartData.length > 0 ? chartData : [{ name: 'Sem dados', Valor: 0 }]
        };
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'buildingFunds');
        throw e;
      }
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingItem) {
        const { locked, reason } = isRecordLocked(editingItem.createdAt || editingItem.date);
        if (locked && !isAdmin) {
          throw new Error(reason || "Registo bloqueado.");
        }
        await updateDoc(doc(db, 'buildingFunds', editingItem.id), {
          ...data,
          updatedAt: Date.now()
        });
      } else {
        await addDoc(collection(db, 'buildingFunds'), {
          ...data,
          adminId: auth.currentUser?.uid,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    },
    onSuccess: () => {
      toast.success(editingItem ? "Registo actualizado com sucesso" : "Registo gravado com sucesso");
      setIsDialogOpen(false);
      setEditingItem(null);
      reset({ type: 'IN', date: today, description: '', amount: 0 });
      queryClient.invalidateQueries({ queryKey: ['buildingFund'] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao gravar");
      if(!error.message?.includes("bloqueado")) handleFirestoreError(error, OperationType.WRITE, 'buildingFunds');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const docRef = doc(db, 'buildingFunds', id);
      const snap = await getDoc(docRef);
      if(snap.exists()) {
        const { locked, reason } = isRecordLocked(snap.data()?.createdAt);
        if (locked && !isAdmin) {
          throw new Error(reason || "Registo bloqueado.");
        }
      }
      await moveToTrash('buildingFunds', id, user?.email || 'unknown');
    },
    onSuccess: () => {
      toast.success("Registo movido para a lixeira.");
      queryClient.invalidateQueries({ queryKey: ['buildingFund'] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao apagar");
      if(!error.message?.includes("bloqueado")) handleFirestoreError(error, OperationType.DELETE, 'buildingFunds');
    }
  });

  const handleSave = async (data: any) => {
    const confirmed = await confirmDialog("Deseja guardar esta informação?");
    if (confirmed) {
      mutation.mutate(data);
    }
  };

  const openEditDialog = (item: any) => {
    setEditingItem(item);
    setValue('type', item.type);
    setValue('description', item.description);
    setValue('amount', item.amount);
    setValue('date', item.date);
    clearErrors();
    setIsDialogOpen(true);
  };

  const formType = watch('type');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Fundo de Construção</h2>
          <p className="text-muted-foreground">Monitorização do projecto de expansão.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) { setEditingItem(null); reset({ type: 'IN', date: today, description: '', amount: 0 }); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Registar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Editar Registo de Fundo' : 'Registar Fundo'}</DialogTitle>
              <DialogDescription className="sr-only">Preencha os detalhes do fundo.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Movimento</Label>
                <Select value={formType} onValueChange={(v: "IN"|"OUT") => setValue('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Contribuição (+)</SelectItem>
                    <SelectItem value="OUT">Despesa (-)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input {...register('description')} />
                {errors.description && <span className="text-xs text-destructive">{errors.description.message}</span>}
              </div>
              <div className="space-y-2">
                <Label>Valor (AOA)</Label>
                <Input type="number" step="0.01" {...register('amount')} />
                {errors.amount && <span className="text-xs text-destructive">{errors.amount.message}</span>}
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" {...register('date')} />
                {errors.date && <span className="text-xs text-destructive">{errors.date.message}</span>}
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'A Guardar...' : 'Guardar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fundo Actual</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(fundData?.balance || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Valor disponível para a obra</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Arrecadado</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
               {isLoading ? '...' : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(fundData?.totalReceived || 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Despendido</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
               {isLoading ? '...' : new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(fundData?.totalSpent || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Arrecadações</CardTitle>
            <CardDescription>Contribuições recentes por mês.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
             {isLoading ? <div className="text-center py-8">A Carregar...</div> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={fundData?.chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis fontSize={12} tickFormatter={(value) => `${value}`} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{fill: 'transparent'}} formatter={(val) => new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(val as number)} />
                  <Bar dataKey="Valor" fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
             )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <div>
              <CardTitle>Registos Recentes</CardTitle>
              <CardDescription>Fluxo de caixa do projecto.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 pr-2">
              {isLoading ? (
                <div className="text-center py-4">A carregar...</div>
              ) : fundData?.history.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">Nenhum registo.</div>
              ) : (
                 fundData?.history.map((item) => (
                    <div key={item.id} className="flex justify-between items-center pb-2 border-b last:border-0 relative">
                       <div className="pr-8">
                         <div className="font-semibold">{item.description}</div>
                         <div className="text-xs text-muted-foreground">{item.date}</div>
                       </div>
                       <div className="flex items-center gap-2">
                          <div className={`font-bold ${item.type === 'OUT' ? 'text-destructive' : 'text-green-600'}`}>
                            {item.type === 'OUT' ? '-' : '+'}{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(item.amount)}
                          </div>
                          <div className="flex gap-1 ml-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditDialog(item)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={async () => {
                              const confirmed = await confirmDialog("Tem certeza de que deseja eliminar este registo? Esta ação é irreversível.", "APAGAR");
                              if(confirmed) deleteMutation.mutate(item.id);
                            }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                       </div>
                    </div>
                 ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
