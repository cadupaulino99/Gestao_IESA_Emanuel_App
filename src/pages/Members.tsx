import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, addDoc, doc, updateDoc, limit, orderBy, startAfter, DocumentData, QueryDocumentSnapshot, getDoc } from 'firebase/firestore';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Plus, Pencil, Trash2, Download, Upload, Eye, CreditCard, Printer, Search, Phone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { moveToTrash, isRecordLocked } from '../lib/trash';
import { Member } from '../types';
import { useConfirm } from '../context/ConfirmContext';
import { saveXlsx } from '../lib/download';
import { MemberTithesTracker } from '../components/members/MemberTithesTracker';
import MemberCardModal from '../components/members/MemberCardModal';
import { nextInternalCode } from '../lib/members';
import { normalizePhoneAO, phoneError } from '../lib/phone';
import CommunionMonthlyAdmin from '../components/admin/CommunionMonthlyAdmin';
import MemberContactActions from '../components/members/MemberContactActions';
import { memberSchema, type MemberForm } from '../lib/memberSchema';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../lib/audit';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function Members() {
  const { user, isAdmin, userRole } = useAuth();
  const location = useLocation();
  const initialTab = (location.state as { tab?: string } | null)?.tab === 'comunhao' ? 'comunhao' : 'lista';
  const [tab, setTab] = useState(initialTab);
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [cardMember, setCardMember] = useState<Member | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');

  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: { status: 'Activo' },
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['members'],
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam }) => {
      try {
        const constraints: any[] = [orderBy('name', 'asc'), limit(50)];
        if (pageParam) constraints.unshift(startAfter(pageParam));
        const snapshot = await getDocs(query(collection(db, 'members'), ...constraints));
        return {
          docs: snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Member)),
          lastVisible: snapshot.docs[snapshot.docs.length - 1] || null,
        };
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'members');
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage.lastVisible,
  });

  const members = React.useMemo(() => data?.pages.flatMap((p) => p.docs) || [], [data]);

  const filteredMembers = React.useMemo(() => {
    const q = searchTerm.toLowerCase();
    const tBi = searchTerm.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return members.filter((m) => {
      if (statusFilter !== 'all' && (m.status || 'Activo') !== statusFilter) return false;
      if (areaFilter !== 'all' && (m.groupCell || '') !== areaFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.phone || '').includes(searchTerm) ||
        !!(m.documentNumber && m.documentNumber.toUpperCase().includes(tBi)) ||
        !!(m.internalCode && m.internalCode.toLowerCase().includes(q))
      );
    });
  }, [members, searchTerm, statusFilter, areaFilter]);

  const areaOptions = React.useMemo(() => {
    const s = new Set<string>();
    members.forEach((m) => { if (m.groupCell) s.add(m.groupCell); });
    return Array.from(s).sort();
  }, [members]);

  const memberKind = (m: Member) => {
    if (m.baptismDate) return 'Baptizado';
    const r = (m.role || '').toLowerCase();
    if (r.includes('catec')) return 'Catecúmeno';
    if (r.includes('ouv')) return 'Ouvinte';
    return m.role || 'Membro';
  };

  const genderTone = (g?: string) => {
    const x = (g || '').toLowerCase();
    if (x.startsWith('m') || x.includes('masc')) return 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200';
    if (x.startsWith('f') || x.includes('fem')) return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800';
  };

  const kindTone = (k: string) => {
    if (k === 'Baptizado') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    if (k === 'Catecúmeno') return 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200';
    if (k === 'Ouvinte') return 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800';
  };

  const mutation = useMutation({
    mutationFn: async (payload: MemberForm) => {
      if (editingMember) {
        const { locked, reason } = isRecordLocked(editingMember.createdAt);
        if (locked && !isAdmin) throw new Error(reason || 'Registo bloqueado.');
        await updateDoc(doc(db, 'members', editingMember.id), { ...payload, updatedAt: Date.now() });
        void logAudit('member.updated', `members/${editingMember.id}`, user?.email || '', String(payload.name || ''));
      } else {
        const r = await addDoc(collection(db, 'members'), { ...payload, createdAt: Date.now(), updatedAt: Date.now() });
        void logAudit('member.created', `members/${r.id}`, user?.email || '', String(payload.name || ''));
      }
    },
    onSuccess: () => {
      toast.success(editingMember ? 'Membro actualizado.' : 'Membro adicionado.');
      setIsDialogOpen(false);
      reset();
      setEditingMember(null);
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao guardar.');
      if (!error.message?.includes('bloqueado')) handleFirestoreError(error, OperationType.WRITE, 'members');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const snap = await getDoc(doc(db, 'members', id));
      if (snap.exists()) {
        const { locked, reason } = isRecordLocked(snap.data()?.createdAt);
        if (locked && !isAdmin) throw new Error(reason || 'Registo bloqueado.');
      }
      await moveToTrash('members', id, user?.email || 'unknown');
      void logAudit('member.trashed', `members/${id}`, user?.email || '');
    },
    onSuccess: () => {
      toast.success('Membro movido para a lixeira.');
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover.');
      if (!error.message?.includes('bloqueado')) handleFirestoreError(error, OperationType.DELETE, 'members');
    },
  });

  const handleSave = async (formData: MemberForm) => {
    const data: MemberForm & { internalCode?: string } = { ...formData };
    if (data.phone) {
      const err = phoneError(data.phone);
      if (err) { toast.error(err); return; }
      data.phone = normalizePhoneAO(data.phone)!;
    }
    if (!editingMember && !(data as { internalCode?: string }).internalCode) {
      (data as { internalCode?: string }).internalCode = await nextInternalCode();
    }
    Object.keys(data).forEach((k) => {
      if ((data as Record<string, unknown>)[k] === undefined) delete (data as Record<string, unknown>)[k];
    });
    const ok = await confirmDialog('Deseja guardar esta informação?');
    if (ok) mutation.mutate(data);
  };

  const openEdit = (m: Member) => {
    setEditingMember(m);
    reset({
      name: m.name || '',
      status: m.status || 'Activo',
      phone: m.phone || '',
      gender: m.gender || '',
      groupCell: m.groupCell || '',
      role: m.role || '',
      documentNumber: m.documentNumber || '',
      birthDate: m.birthDate || '',
      baptismDate: m.baptismDate || '',
      address: m.address || '',
      email: m.email || '',
    });
    setIsDialogOpen(true);
  };

  const openProfile = (m: Member) => setSelectedMember(m);

  const exportExcel = async () => {
    const rows = filteredMembers.map((m, i) => ({
      'Nº': i + 1, Nome: m.name, Género: m.gender || '', Tipo: memberKind(m),
      Área: m.groupCell || '', Departamento: m.role || '', Telefone: m.phone || '', Estado: m.status || 'Activo',
    }));
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Membros');
    await saveXlsx(XLSX, wb, 'membros-iesa.xlsx');
    toast.success('Excel exportado.');
  };

  const exportPDF = () => {
    const docPdf = new jsPDF();
    docPdf.setFontSize(14);
    docPdf.text('Lista de Membros — IESA Emanuel', 14, 16);
    (docPdf as any).autoTable({
      startY: 22,
      head: [['Nº', 'Nome', 'Género', 'Tipo', 'Área', 'Telefone', 'Estado']],
      body: filteredMembers.map((m, i) => [i + 1, m.name, m.gender || '—', memberKind(m), m.groupCell || '—', m.phone || '—', m.status || 'Activo']),
      styles: { fontSize: 8 },
    });
    docPdf.save('lista-membros.pdf');
    toast.success('PDF gerado.');
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsImporting(true);
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
      if (rows.length < 2) { toast.error('Ficheiro vazio.'); return; }
      const headers: string[] = (rows[0] || []).map((h) => String(h || '').toLowerCase());
      const nameIdx = headers.findIndex((h) => h.includes('nome'));
      let n = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as unknown[];
        const name = String((nameIdx >= 0 ? row[nameIdx] : row[0]) || '').trim();
        if (!name) continue;
        await addDoc(collection(db, 'members'), { name, status: 'Activo', createdAt: Date.now(), updatedAt: Date.now() });
        n++;
      }
      toast.success(`${n} membros importados.`);
      queryClient.invalidateQueries({ queryKey: ['members'] });
    } catch {
      toast.error('Erro na importação.');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const ActionBtns = ({ m }: { m: Member }) => (
    <div className="flex justify-end gap-1">
      <Button size="icon" className="h-8 w-8 bg-blue-600 hover:bg-blue-700" title="Cartão" onClick={() => setCardMember(m)}><CreditCard className="h-3.5 w-3.5" /></Button>
      <Button size="icon" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700" title="Ver" onClick={() => openProfile(m)}><Eye className="h-3.5 w-3.5" /></Button>
      <Button size="icon" className="h-8 w-8 bg-amber-500 hover:bg-amber-600" title="Editar" onClick={() => openEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
      <Button size="icon" className="h-8 w-8 bg-rose-600 hover:bg-rose-700" title="Eliminar" onClick={async () => {
        const ok = await confirmDialog('Eliminar este membro? A acção move para a lixeira.', 'APAGAR');
        if (ok) deleteMutation.mutate(m.id);
      }}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-6">
      <header className="relative overflow-hidden rounded-2xl border bg-card px-4 py-5 shadow-sm sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute -right-14 -top-16 h-52 w-52 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <div className="mb-1 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Comunidade
            </div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Membros da Igreja</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Cadastro, dízimos por membro e registo de comunhão</p>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="space-y-3">
        <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-xl border bg-white p-1 shadow-sm dark:bg-card md:w-auto">
          <TabsTrigger value="lista" className="rounded-lg text-xs sm:text-sm">Lista de Membros</TabsTrigger>
          <TabsTrigger value="dizimos" className="rounded-lg text-xs sm:text-sm">Dízimos por Membro</TabsTrigger>
          <TabsTrigger value="comunhao" className="rounded-lg text-xs sm:text-sm">Comunhão</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-0 space-y-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
            <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { reset(); setEditingMember(null); } setIsDialogOpen(open); }}>
              <DialogTrigger asChild>
                <Button className="gap-1.5 bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4" /> Novo Membro</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingMember ? 'Editar Membro' : 'Novo Membro'}</DialogTitle>
                  <DialogDescription>Preencha os dados do membro.</DialogDescription>
                </DialogHeader>
                <form className="space-y-3" onSubmit={handleSubmit(handleSave)}>
                  <div>
                    <Label>Nome completo</Label>
                    <Input {...register('name')} />
                    {errors.name && <p className="text-xs text-destructive">{String(errors.name.message)}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Género</Label>
                      <Select onValueChange={(v) => setValue('gender', v)} defaultValue={(editingMember?.gender as string) || undefined}>
                        <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Masculino">Masculino</SelectItem>
                          <SelectItem value="Feminino">Feminino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Estado</Label>
                      <Select onValueChange={(v) => setValue('status', v)} defaultValue={editingMember?.status || 'Activo'}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Activo">Activo</SelectItem>
                          <SelectItem value="Inactivo">Inactivo</SelectItem>
                          <SelectItem value="Transferido">Transferido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Telefone</Label><Input {...register('phone')} /></div>
                    <div><Label>Área / Célula</Label><Input {...register('groupCell')} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Departamento</Label><Input {...register('role')} placeholder="ex: JIESA" /></div>
                    <div><Label>Nascimento</Label><Input type="date" {...register('birthDate')} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Baptismo</Label><Input type="date" {...register('baptismDate')} /></div>
                    <div><Label>BI</Label><Input {...register('documentNumber')} /></div>
                  </div>
                  <Button type="submit" className="w-full" disabled={mutation.isPending}>{mutation.isPending ? 'A guardar…' : 'Guardar'}</Button>
                </form>
              </DialogContent>
            </Dialog>
            <div className="relative">
              <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} disabled={isImporting} className="absolute inset-0 cursor-pointer opacity-0" />
              <Button variant="outline" disabled={isImporting} className="pointer-events-none gap-1.5"><Upload className="h-4 w-4" /> Importar</Button>
            </div>
            <Button variant="outline" className="gap-1.5" onClick={exportPDF}><Printer className="h-4 w-4" /> Imprimir Lista</Button>
            <Button variant="outline" className="gap-1.5" onClick={exportExcel}><Download className="h-4 w-4" /> Excel</Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 pl-9" placeholder="Pesquisar por nome, BI, telefone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Membros</SelectItem>
                <SelectItem value="Activo">Activo</SelectItem>
                <SelectItem value="Inactivo">Inactivo</SelectItem>
                <SelectItem value="Transferido">Transferido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="h-10 w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Áreas</SelectItem>
                {areaOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-slate-800">
            <CardContent className="p-0">
              <div className="hidden overflow-x-auto md:block">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow className="bg-slate-900 hover:bg-slate-900">
                      <TableHead className="text-white">Nº</TableHead>
                      <TableHead className="text-white">Nome Completo</TableHead>
                      <TableHead className="text-white">Género</TableHead>
                      <TableHead className="text-white">Membro</TableHead>
                      <TableHead className="text-white">Área Diaconal</TableHead>
                      <TableHead className="text-white">Departamento</TableHead>
                      <TableHead className="text-white">Telefone</TableHead>
                      <TableHead className="text-white">Estado</TableHead>
                      <TableHead className="text-right text-white">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 9 }).map((__, j) => (
                          <TableCell key={j}><div className="h-4 w-14 animate-pulse rounded bg-muted" /></TableCell>
                        ))}</TableRow>
                      ))
                    ) : filteredMembers.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Nenhum membro encontrado.</TableCell></TableRow>
                    ) : filteredMembers.map((m, idx) => {
                      const kind = memberKind(m);
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-semibold">{m.name}</TableCell>
                          <TableCell><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${genderTone(m.gender)}`}>{m.gender || '—'}</span></TableCell>
                          <TableCell><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${kindTone(kind)}`}>{kind}</span></TableCell>
                          <TableCell><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">{m.groupCell || '—'}</span></TableCell>
                          <TableCell><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">{m.role || 'Nenhum'}</span></TableCell>
                          <TableCell>{m.phone ? <span className="inline-flex items-center gap-1 text-sm"><Phone className="h-3.5 w-3.5 text-sky-600" />{m.phone}</span> : '—'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${(m.status || 'Activo') === 'Activo' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${(m.status || 'Activo') === 'Activo' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                              {m.status || 'Activo'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right"><ActionBtns m={m} /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 p-3 md:hidden">
                {filteredMembers.map((m) => (
                  <Card key={m.id}>
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.phone || 'Sem telefone'} · {m.groupCell || 'Sem área'}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${(m.status || 'Activo') === 'Activo' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100'}`}>{m.status || 'Activo'}</span>
                      </div>
                      <ActionBtns m={m} />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex flex-col items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row">
                <span>Mostrando {filteredMembers.length} membro{filteredMembers.length === 1 ? '' : 's'}</span>
                {hasNextPage && (
                  <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                    {isFetchingNextPage ? 'A carregar…' : 'Carregar mais'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="dizimos" className="mt-0"><MemberTithesTracker /></TabsContent>
        <TabsContent value="comunhao" className="mt-0">
          {userRole === 'admin' ? (
            <CommunionMonthlyAdmin />
          ) : (
            <p className="rounded-xl border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
              O registo de comunhão está disponível apenas para administradores.
            </p>
          )}
        </TabsContent>
      </Tabs>
      <Sheet open={!!selectedMember} onOpenChange={(o) => { if (!o) setSelectedMember(null); }}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Perfil do Membro</SheetTitle>
            <SheetDescription>{selectedMember?.name}</SheetDescription>
          </SheetHeader>
          {selectedMember && (
            <div className="mt-4 space-y-3 text-sm">
              <div><span className="text-muted-foreground">Telefone</span><p>{selectedMember.phone || '—'}</p>
                <MemberContactActions phone={selectedMember.phone} email={selectedMember.email} compact />
              </div>
              <div><span className="text-muted-foreground">Área</span><p>{selectedMember.groupCell || '—'}</p></div>
              <div><span className="text-muted-foreground">Departamento</span><p>{selectedMember.role || '—'}</p></div>
              <div><span className="text-muted-foreground">Estado</span><p>{selectedMember.status || 'Activo'}</p></div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setCardMember(selectedMember)}><CreditCard className="mr-1 h-4 w-4" /> Cartão</Button>
                <Button size="sm" onClick={() => { openEdit(selectedMember); setSelectedMember(null); }}><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {cardMember && (
        <MemberCardModal member={cardMember} open={!!cardMember} onOpenChange={(o) => { if (!o) setCardMember(null); }} />
      )}
    </div>
  );
}
