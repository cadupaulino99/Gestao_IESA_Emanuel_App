import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { useState } from 'react';
import { useConfirm } from '../context/ConfirmContext';
import { moveToTrash, isRecordLocked } from '../lib/trash';
import { getDoc } from 'firebase/firestore';

const assetSchema = z.object({
  name: z.string().min(2, "Nome inválido"),
  category: z.string().min(2, "Categoria inválida"),
  acquisitionDate: z.string().min(10).max(10),
  purchaseValue: z.coerce.number().min(0, "Valor inválido"),
  currentRate: z.coerce.number().optional()
});

type AssetForm = z.infer<typeof assetSchema>;

import { useAuth } from '../context/AuthContext';

export default function Assets() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const confirmDialog = useConfirm();
  const today = new Date().toISOString().substring(0, 10);

  const { register, handleSubmit, formState: { errors }, reset, setValue, clearErrors } = useForm({
    resolver: zodResolver(assetSchema),
    defaultValues: { acquisitionDate: today, purchaseValue: 0 }
  });

  const { data: assets, isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: async () => {
      try {
        const snap = await getDocs(query(collection(db, 'assets'), orderBy('createdAt', 'desc')));
        return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'assets');
        throw e;
      }
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingItem) {
        const { locked, reason } = isRecordLocked(editingItem.createdAt || editingItem.acquisitionDate);
        if (locked && !isAdmin) {
          throw new Error(reason || "Registo bloqueado.");
        }
        await updateDoc(doc(db, 'assets', editingItem.id), {
          ...data,
          updatedAt: Date.now()
        });
      } else {
        await addDoc(collection(db, 'assets'), {
          ...data,
          adminId: auth.currentUser?.uid,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    },
    onSuccess: () => {
      toast.success(editingItem ? "Activo actualizado" : "Activo registado");
      setIsDialogOpen(false);
      setEditingItem(null);
      reset({ name: '', category: '', acquisitionDate: today, purchaseValue: 0 });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao gravar");
      if(!error.message?.includes("bloqueado")) handleFirestoreError(error, OperationType.WRITE, 'assets');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const docRef = doc(db, 'assets', id);
      const snap = await getDoc(docRef);
      if(snap.exists()) {
        const { locked, reason } = isRecordLocked(snap.data()?.createdAt);
        if (locked && !isAdmin) {
          throw new Error(reason || "Registo bloqueado.");
        }
      }
      await moveToTrash('assets', id, user?.email || 'unknown');
    },
    onSuccess: () => {
      toast.success("Registo movido para a lixeira.");
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao apagar");
      if(!error.message?.includes("bloqueado")) handleFirestoreError(error, OperationType.DELETE, 'assets');
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
    setValue('name', item.name);
    setValue('category', item.category);
    setValue('acquisitionDate', item.acquisitionDate);
    setValue('purchaseValue', item.purchaseValue);
    clearErrors();
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Activos da Igreja</h2>
          <p className="text-muted-foreground">Inventário e património da congregação.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) { setEditingItem(null); reset({ name: '', category: '', acquisitionDate: today, purchaseValue: 0 }); }
        }}>
          <DialogTrigger asChild>
             <Button><Plus className="w-4 h-4 mr-2" /> Registar Bem</Button>
          </DialogTrigger>
          <DialogContent>
             <DialogHeader>
               <DialogTitle>{editingItem ? 'Editar Activo' : 'Novo Activo'}</DialogTitle>
             </DialogHeader>
             <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Designação do Bem</Label>
                  <Input {...register('name')} placeholder="Ex: Sistema de Som" />
                  {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Input {...register('category')} placeholder="Ex: Equip. Áudio" />
                  {errors.category && <span className="text-xs text-destructive">{errors.category.message}</span>}
                </div>
                <div className="space-y-2">
                  <Label>Data de Aquisição</Label>
                  <Input type="date" {...register('acquisitionDate')} />
                  {errors.acquisitionDate && <span className="text-xs text-destructive">{errors.acquisitionDate.message}</span>}
                </div>
                <div className="space-y-2">
                  <Label>Valor de Aquisição (AOA)</Label>
                  <Input type="number" step="0.01" {...register('purchaseValue')} />
                  {errors.purchaseValue && <span className="text-xs text-destructive">{errors.purchaseValue.message}</span>}
                </div>
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? 'A Guardar...' : 'Guardar'}
                </Button>
             </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventário Geral</CardTitle>
          <CardDescription>Lista de equipamentos e património.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">A carregar inventário...</div>
          ) : (
            <>
              <div className="hidden md:block">
                <div className="overflow-x-auto"><Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bem</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Data Aquis.</TableHead>
                      <TableHead>Valor Aquis.</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets?.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell>{a.category}</TableCell>
                        <TableCell>{a.acquisitionDate}</TableCell>
                        <TableCell>{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(a.purchaseValue)}</TableCell>
                        <TableCell>
                           <div className="flex gap-1 justify-end">
                             <Button variant="ghost" size="icon" onClick={() => openEditDialog(a)}>
                               <Pencil className="h-4 w-4" />
                             </Button>
                             <Button variant="ghost" size="icon" onClick={async () => {
                               const confirmed = await confirmDialog("Tem certeza de que deseja eliminar este património? Esta ação é irreversível.", "APAGAR");
                               if(confirmed) deleteMutation.mutate(a.id);
                             }}>
                               <Trash2 className="h-4 w-4 text-destructive" />
                             </Button>
                           </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {assets?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center">Nenhum activo registado.</TableCell></TableRow>}
                  </TableBody>
                </Table></div>
              </div>
              <div className="md:hidden space-y-4">
                 {assets?.length === 0 ? (
                    <div className="text-center text-muted-foreground py-4">Nenhum activo registado.</div>
                 ) : assets?.map((a: any) => (
                    <div key={a.id} className="border p-4 rounded-lg shadow-sm flex flex-col gap-2 relative">
                       <div className="font-semibold pr-8">{a.name}</div>
                       <div className="text-sm text-muted-foreground">Categoria: {a.category} | Data: {a.acquisitionDate}</div>
                       <div className="font-bold text-lg">{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(a.purchaseValue)}</div>
                       <div className="flex gap-1 absolute top-2 right-2">
                         <Button variant="ghost" size="icon" onClick={() => openEditDialog(a)}>
                           <Pencil className="h-4 w-4" />
                         </Button>
                         <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => {
                           const confirmed = await confirmDialog("Tem certeza de que deseja eliminar este património? Esta ação é irreversível.", "APAGAR");
                           if(confirmed) deleteMutation.mutate(a.id);
                         }}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                       </div>
                    </div>
                 ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
