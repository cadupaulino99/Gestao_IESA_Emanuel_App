import React, { useState } from 'react';
import DocumentReaderModal, { type DocKind } from '../components/documents/DocumentReaderModal';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, addDoc, doc, updateDoc, deleteDoc, limit, startAfter, orderBy, where, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Plus, Pencil, Trash2, Download, Upload, Eye, CreditCard, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { moveToTrash, isRecordLocked } from '../lib/trash';
import { getDoc } from 'firebase/firestore';
import { Member } from '../types';
import { useConfirm } from '../context/ConfirmContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { generateMembershipCard } from '../lib/pdfUtils';
import { MemberTithesTracker } from '../components/members/MemberTithesTracker';
import MemberCardModal from '../components/members/MemberCardModal';
import CommunionTracker from '../components/members/CommunionTracker';
import { compressImageFile } from '../lib/ai';
import { PastoralMessageGeneratorModal } from '../components/members/PastoralMessageGeneratorModal';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const memberSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  documentNumber: z.string().optional(),
  memberNumber: z.string().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  placeOfBirth: z.string().optional(),
  photoBase64: z.string().optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  baptismDate: z.string().optional(),
  gender: z.string().optional(),
  maritalStatus: z.string().optional(),
  spouseName: z.string().optional(),
  education: z.string().optional(),
  profession: z.string().optional(),
  address: z.string().optional(),
  groupCell: z.string().optional(),
  status: z.string().default("Activo"),
});

type MemberForm = z.infer<typeof memberSchema>;

import { useAuth } from '../context/AuthContext';

export default function Members() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const XLSX = await import('xlsx');
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const membersData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (membersData.length > 1) {
            let totalImported = 0;
            // Assuming first row is header
            const headers: string[] = membersData[0].map((h: string) => h?.toString().toLowerCase().trim() || '');
            
            const nameIdx = headers.findIndex(h => h.includes('nome'));
            const statusIdx = headers.findIndex(h => h.includes('estado') || h.includes('status'));
            const phoneIdx = headers.findIndex(h => h.includes('telefone') || h.includes('telemóvel'));
            const cellIdx = headers.findIndex(h => h.includes('célula'));
            const birthIdx = headers.findIndex(h => h.includes('nascimento') || h.includes('data'));
            const genderIdx = headers.findIndex(h => h.includes('sexo') || h.includes('género') || h.includes('genero'));

            for (let i = 1; i < membersData.length; i++) {
              const row = membersData[i];
              if (!row || row.length === 0) continue;
              
              const rawName = nameIdx !== -1 ? row[nameIdx] : (row[0] || '').toString();
              if (!rawName) continue;
              const nameStr = rawName.toString().trim();
              if (!nameStr) continue;

              const status = statusIdx !== -1 ? row[statusIdx] : 'Activo';
              const phone = phoneIdx !== -1 ? row[phoneIdx] : '';
              const groupCell = cellIdx !== -1 ? row[cellIdx] : '';
              const gender = genderIdx !== -1 ? row[genderIdx] : '';
              
              let birthDate = '';
              if (birthIdx !== -1 && row[birthIdx]) {
                // If the date is Excel serial number
                if (typeof row[birthIdx] === 'number') {
                  const date = XLSX.SSF.parse_date_code(row[birthIdx]);
                  birthDate = new Date(date.y, date.m - 1, date.d).toISOString().split('T')[0];
                } else {
                  birthDate = row[birthIdx].toString(); // Might need parsing based on format
                }
              }

              const memberData: any = {
                name: nameStr,
                status: status?.toString().trim() || 'Activo',
                phone: phone?.toString().trim() || '',
                groupCell: groupCell?.toString().trim() || '',
                createdAt: Date.now(),
                updatedAt: Date.now()
              };
              if (birthDate) {
                memberData.birthDate = birthDate;
              }
              if (gender) {
                const gStr = gender.toString().toLowerCase().trim();
                if (gStr.startsWith('m') || gStr === 'homem') memberData.gender = 'Masculino';
                else if (gStr.startsWith('f') || gStr === 'mulher') memberData.gender = 'Feminino';
                else memberData.gender = gender.toString().trim();
              }

              try {
                await addDoc(collection(db, 'members'), memberData);
                totalImported++;
              } catch (err) {
                 console.error("Error creating member: ", memberData);
                 handleFirestoreError(err, OperationType.WRITE, 'members');
                 throw err;
              }
            }
            
            toast.success(`${totalImported} membros importados com sucesso!`);
            queryClient.invalidateQueries({ queryKey: ['members'] });
          } else {
             toast.error("O ficheiro está vazio ou não tem o formato correto.");
          }
        } catch (error) {
          console.error("Erro na importação:", error);
          toast.error("Erro ao processar o ficheiro de importação.");
        } finally {
          setIsImporting(false);
          event.target.value = '';
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao ler o ficheiro.");
      setIsImporting(false);
      event.target.value = '';
    }
  };
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [aiMessageMember, setAiMessageMember] = useState<Member | null>(null);
  const [docKind, setDocKind] = useState<DocKind | null>(null);
  const [cardMember, setCardMember] = useState<Member | null>(null);
  const [memberTithes, setMemberTithes] = useState<any[]>([]);
  const [loadingTithes, setLoadingTithes] = useState(false);
  const confirmDialog = useConfirm();

  const [searchTerm, setSearchTerm] = useState('');

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: { status: 'Activo' }
  });

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['members', searchTerm],
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam }) => {
      try {
        let q = collection(db, 'members');
        let constraints: any[] = [];
        constraints.push(where('status', '==', 'Activo'));
        constraints.push(orderBy('name', 'asc')); // Order by name for easier searching
        
        if (searchTerm) {
          // If searching, we might skip pagination or do local filtering, but it's hard with Firestore text search.
          // For now, if searchTerm is active, we can fetch more or we just let local filtering handle it if it's small,
          // but we want pagination. We'll stick to basic pagination, local filtering will only apply to fetched items.
          // Ideally, we shouldn't mix local search with pagination directly, but let's just paginate the main list.
        }

        if (pageParam) {
          constraints.push(startAfter(pageParam));
        }
        constraints.push(limit(50));
        
        const snapshot = await getDocs(query(q, ...constraints));
        return {
          docs: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member)),
          lastVisible: snapshot.docs[snapshot.docs.length - 1] || null
        };
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'members');
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage.lastVisible,
  });

  const members = React.useMemo(() => {
    return data?.pages.flatMap(page => page.docs) || [];
  }, [data]);

  const filteredMembers = React.useMemo(() => {
    return members.filter(m => 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.phone?.includes(searchTerm)
    );
  }, [members, searchTerm]);

  const mutation = useMutation({
    mutationFn: async (payload: MemberForm) => {
      if (editingMember) {
        const { locked, reason } = isRecordLocked(editingMember.createdAt);
        if (locked && !isAdmin) {
          throw new Error(reason || "Registo bloqueado.");
        }
        await updateDoc(doc(db, 'members', editingMember.id), { ...payload, updatedAt: Date.now() });
      } else {
        await addDoc(collection(db, 'members'), { ...payload, createdAt: Date.now(), updatedAt: Date.now() });
      }
    },
    onSuccess: () => {
      toast.success(editingMember ? "Membro actualizado." : "Membro adicionado.");
      setIsDialogOpen(false);
      reset();
      setEditingMember(null);
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao guardar. Verifique as permissões.");
      if(!error.message?.includes("bloqueado")) handleFirestoreError(error, OperationType.WRITE, 'members');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const docRef = doc(db, 'members', id);
      const snap = await getDoc(docRef);
      if(snap.exists()) {
        const { locked, reason } = isRecordLocked(snap.data()?.createdAt);
        if (locked && !isAdmin) {
          throw new Error(reason || "Registo bloqueado.");
        }
      }
      await moveToTrash('members', id, user?.email || 'unknown');
    },
    onSuccess: () => {
      toast.success("Membro movido para a lixeira.");
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao remover.");
      if(!error.message?.includes("bloqueado")) handleFirestoreError(error, OperationType.DELETE, 'members');
    }
  });

  const handleSave = async (data: any) => {
    const confirmed = await confirmDialog("Deseja guardar esta informação?");
    if (confirmed) {
      const cleanData = { ...data };
      Object.keys(cleanData).forEach(key => {
        if (cleanData[key] === undefined) delete cleanData[key];
      });
      mutation.mutate(cleanData);
    }
  };

  const openEdit = (member: Member) => {
    setEditingMember(member);
    const validStatuses = ['Activo', 'Inativo', 'Sob Disciplina', 'Transferido', 'Falecido'];
    let safeStatus = member.status || 'Activo';
    if (!validStatuses.includes(safeStatus)) {
      safeStatus = 'Activo';
    }

    const validGenders = ['Masculino', 'Feminino', 'Outro'];
    let safeGender = member.gender || '';
    if (safeGender && !validGenders.includes(safeGender)) {
      safeGender = 'Outro';
    }

    const validMarital = ['Solteiro(a)', 'Casado(a)', 'Viúvo(a)', 'Divorciado(a)'];
    let safeMarital = member.maritalStatus || '';
    if (safeMarital && !validMarital.includes(safeMarital)) {
       safeMarital = '';
    }

    reset({
      name: member.name,
      documentNumber: member.documentNumber || '',
      memberNumber: member.memberNumber || '',
      fatherName: member.fatherName || '',
      motherName: member.motherName || '',
      placeOfBirth: member.placeOfBirth || '',
      photoBase64: member.photoBase64 || '',
      phone: member.phone || '',
      birthDate: member.birthDate || '',
      baptismDate: member.baptismDate || '',
      gender: safeGender,
      maritalStatus: safeMarital,
      spouseName: member.spouseName || '',
      education: member.education || '',
      profession: member.profession || '',
      address: member.address || '',
      groupCell: member.groupCell || '',
      status: safeStatus,
    });
    setIsDialogOpen(true);
  };

  const openProfile = async (member: Member) => {
    setSelectedMember(member);
    setLoadingTithes(true);
    setMemberTithes([]);
    try {
      const q = query(
        collection(db, 'tithes'),
        where('memberId', '==', member.id)
      );
      const snapshot = await getDocs(q);
      
      const tithesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort in memory as orderby might require an index
      tithesData.sort((a: any, b: any) => {
        if (b.referenceYear !== a.referenceYear) return b.referenceYear - a.referenceYear;
        // Simple month string compare or just rely on createdAt if available
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      
      setMemberTithes(tithesData);
    } catch (error) {
      console.error("Error fetching tithes:", error);
      toast.error("Erro ao carregar os dízimos.");
    } finally {
       setLoadingTithes(false);
    }
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const data = filteredMembers.map(m => ({
      'Nome': m.name,
      'Estado': m.status,
      'Telefone': m.phone || '-',
      'Nascimento': m.birthDate ? new Date(m.birthDate).toLocaleDateString('pt-AO') : '-',
      'Célula': m.groupCell || '-'
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Membros");
    XLSX.writeFile(workbook, "membros.xlsx");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao exportar Excel.");
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Lista de Membros", 14, 15);
    doc.setFontSize(10);
    doc.text(`Total: ${filteredMembers.length}`, 14, 22);

    const tableData = filteredMembers.map(m => [
      m.name,
      m.status,
      m.phone || '-',
      m.birthDate ? new Date(m.birthDate).toLocaleDateString('pt-AO') : '-',
      m.groupCell || '-'
    ]);

    (doc as any).autoTable({
      startY: 25,
      head: [['Nome', 'Estado', 'Telefone', 'Nascimento', 'Célula']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save('membros.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Membros</h2>
          <p className="text-muted-foreground">Gerir o cadastro da igreja.</p>
        </div>
      </div>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista">Lista de Membros</TabsTrigger>
          <TabsTrigger value="dizimos">Dízimos por Membro</TabsTrigger>
          <TabsTrigger value="comunhao">Comunhão</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4 mt-0">
          <div className="flex flex-wrap gap-2 w-full justify-end">
            <div className="relative">
               <Input
                 type="file"
                 accept=".csv, .xlsx, .xls"
                 onChange={handleImport}
                 disabled={isImporting}
                 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-transparent file:text-transparent"
               />
               <Button variant="outline" disabled={isImporting} className="pointer-events-none w-full" title="Importar">
                 <Upload className="h-4 w-4 sm:mr-2"/> <span className="hidden sm:inline">Importar</span>
               </Button>
            </div>
            <Button variant="outline" onClick={exportExcel} className="flex-1 sm:flex-none" title="Exportar Excel">
               <Download className="h-4 w-4 sm:mr-2"/> <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button variant="outline" onClick={exportPDF} className="flex-1 sm:flex-none" title="Exportar PDF">
               <Download className="h-4 w-4 sm:mr-2"/> <span className="hidden sm:inline">PDF</span>
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
               if(!open) { reset(); setEditingMember(null); }
               setIsDialogOpen(open);
            }}>
              <DialogTrigger asChild>
                <Button className="flex-1 sm:flex-none">
                  <Plus className="mr-2 h-4 w-4" /> Novo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>{editingMember ? 'Editar Membro' : 'Novo Membro'}</DialogTitle>
                  <DialogDescription className="sr-only">Preencha os dados do membro</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 px-4 py-2">
                  <form id="member-form" onSubmit={handleSubmit(handleSave)} className="space-y-4 px-1">
                    <div className="rounded-xl border border-dashed border-gold/60 bg-gold/5 px-3 py-2.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 mr-auto">Preencher com IA a partir de fotografia:</span>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setDocKind('bi')}>
                        🪪 Bilhete de Identidade
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setDocKind('cartao')}>
                        ✝️ Cartão de Membro
                      </Button>
                      <DocumentReaderModal
                        open={docKind !== null}
                        onOpenChange={(o) => { if (!o) setDocKind(null); }}
                        kind={(docKind || 'bi') as DocKind}
                        onApply={(f) => {
                          /* Os valores já vêm normalizados por normalizeMemberFields()
                             (datas AAAA-MM-DD, sexo Masculino/Feminino, tel. +244…).
                             Aqui só copiamos para o formulário — e avisamos o que a IA leu. */
                          const s = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : String(v));
                          const applied: string[] = [];
                          const set = (field: 'name' | 'documentNumber' | 'phone' | 'birthDate' | 'baptismDate' | 'address' | 'groupCell' | 'gender', label: string) => {
                            const v = s(f[field]);
                            if (v !== undefined) { setValue(field, v as never, { shouldDirty: true }); applied.push(label); }
                          };
                          set('name', 'Nome');
                          set('documentNumber', 'Nº do BI');
                          set('phone', 'Telefone');
                          set('birthDate', 'Nascimento');
                          set('baptismDate', 'Baptismo');
                          set('address', 'Morada');
                          set('groupCell', 'Célula');
                          set('gender', 'Género');
                          if (applied.length) {
                            toast.success(`IA preencheu: ${applied.join(', ')}. Confira antes de guardar.`);
                          }
                        }}
                      />
                    </div>
                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2.5 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nº do Cartão de Membro</Label>
                        <Input {...register("memberNumber")} placeholder="Ex.: 0141" inputMode="numeric" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Naturalidade</Label>
                        <Input {...register("placeOfBirth")} placeholder="Ex.: Quitwa" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Filiação — pai («Filho de…»)</Label>
                        <Input {...register("fatherName")} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Filiação — mãe («…e de…»)</Label>
                        <Input {...register("motherName")} />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs">Fotografia do titular (para o cartão)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (!f) return;
                              try {
                                const p = await compressImageFile(f, { max: 400, quality: 0.8 });
                                setValue('photoBase64', p.base64, { shouldDirty: true });
                                toast.success('Fotografia anexada ao cartão.');
                              } catch {
                                toast.error('Não foi possível ler a imagem.');
                              }
                            }}
                          />
                          {watch('photoBase64') && (
                            <>
                              <img src={`data:image/jpeg;base64,${watch('photoBase64')}`} alt="pré-visualização" className="h-10 w-9 rounded object-cover border" />
                              <Button type="button" variant="ghost" size="sm" onClick={() => setValue('photoBase64', '', { shouldDirty: true })}>Remover</Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome Completo *</Label>
                        <Input {...register("name")} />
                        {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
                      </div>
                      <div className="space-y-2">
                        <Label>Telefone</Label>
                        <Input {...register("phone")} placeholder="+244 9XX XXX XXX" inputMode="tel" />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label>Nº do Bilhete de Identidade</Label>
                        <Input {...register("documentNumber")} placeholder="Ex.: 004578123LA040" inputMode="numeric" />
                        <span className="text-[11px] text-muted-foreground">Preenchido automaticamente ao ler a foto do BI com IA.</span>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Data de Nascimento</Label>
                        <Input type="date" {...register("birthDate")} />
                      </div>
                      <div className="space-y-2">
                        <Label>Data de Baptismo</Label>
                        <Input type="date" {...register("baptismDate")} />
                      </div>
                      <div className="space-y-2">
                        <Label>Género</Label>
                        <Select value={watch('gender') || undefined} onValueChange={v => setValue('gender', v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Masculino">Masculino</SelectItem>
                            <SelectItem value="Feminino">Feminino</SelectItem>
                            <SelectItem value="Outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Estado Civil</Label>
                        <Select value={watch('maritalStatus') || undefined} onValueChange={v => setValue('maritalStatus', v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Solteiro(a)">Solteiro(a)</SelectItem>
                            <SelectItem value="Casado(a)">Casado(a)</SelectItem>
                            <SelectItem value="Viúvo(a)">Viúvo(a)</SelectItem>
                            <SelectItem value="Divorciado(a)">Divorciado(a)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {watch('maritalStatus') === 'Casado(a)' && (
                        <div className="space-y-2 md:col-span-2">
                          <Label>Nome do Cônjuge</Label>
                          <Input {...register("spouseName")} />
                        </div>
                      )}

                      <div className="space-y-2 md:col-span-2">
                        <Label>Morada/Endereço</Label>
                        <Input {...register("address")} />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label>Célula/Grupo</Label>
                        <Input {...register("groupCell")} />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label>Estado</Label>
                        <Select value={watch('status')} onValueChange={v => setValue('status', v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Activo">Activo</SelectItem>
                            <SelectItem value="Inativo">Inativo</SelectItem>
                            <SelectItem value="Sob Disciplina">Sob Disciplina</SelectItem>
                            <SelectItem value="Transferido">Transferido</SelectItem>
                            <SelectItem value="Falecido">Falecido</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </form>
                </ScrollArea>
                <div className="pt-4 px-2 border-t mt-auto shrink-0 w-full">
                  <Button type="submit" form="member-form" className="w-full" disabled={mutation.isPending}>
                    {mutation.isPending ? 'A Guardar...' : 'Guardar'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg">Filtros de Pesquisa</CardTitle>
              <div className="mt-4">
                <Input 
                  placeholder="Pesquisar por nome ou nº de telefone..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Nascimento</TableHead>
                      <TableHead>Célula</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded"></div></TableCell>
                          <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded"></div></TableCell>
                          <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded"></div></TableCell>
                          <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded"></div></TableCell>
                          <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded"></div></TableCell>
                          <TableCell><div className="h-4 w-12 bg-muted animate-pulse rounded"></div></TableCell>
                        </TableRow>
                      ))
                    ) : filteredMembers.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8">Nenhum membro encontrado.</TableCell></TableRow>
                    ) : filteredMembers.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell>
                          <Badge variant={m.status === 'Activo' ? 'default' : m.status === 'Sob Disciplina' ? 'destructive' : 'secondary'}>
                            {m.status || 'Activo'}
                          </Badge>
                        </TableCell>
                        <TableCell>{m.phone || '-'}</TableCell>
                        <TableCell>{m.birthDate || '-'}</TableCell>
                        <TableCell>{m.groupCell || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setAiMessageMember(m)} title="Mensagem Pastoral com IA"><Sparkles className="h-4 w-4 text-purple-600" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => generateMembershipCard(m)} title="Gerar Cartão"><CreditCard className="h-4 w-4 text-emerald-600" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => openProfile(m)} title="Ver Perfil"><Eye className="h-4 w-4 text-blue-500" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(m)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => {
                               const confirmed = await confirmDialog('Tem certeza de que deseja eliminar o registo deste membro? Esta ação é irreversível.', 'APAGAR');
                               if(confirmed) deleteMutation.mutate(m.id);
                            }} title="Eliminar"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Mobile view */}
              <div className="md:hidden flex flex-col p-4 gap-4">
                 {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <Card key={i} className="p-4 space-y-3">
                        <div className="h-5 w-40 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
                      </Card>
                    ))
                 ) : filteredMembers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">Nenhum membro encontrado.</div>
                 ) : filteredMembers.map(m => (
                     <Card key={m.id}>
                        <CardContent className="p-4 flex justify-between items-center">
                           <div>
                              <div className="font-medium">{m.name}</div>
                              <div className="text-sm text-muted-foreground">{m.phone || m.address || '-'}</div>
                              <div className="mt-2">
                                 <Badge variant={m.status === 'Activo' ? 'default' : 'secondary'}>{m.status}</Badge>
                              </div>
                           </div>
                           <div className="flex flex-col gap-2">
                              <Button variant="outline" size="icon" onClick={() => generateMembershipCard(m)} title="Gerar Cartão"><CreditCard className="h-4 w-4 text-emerald-600"/></Button>
                              <Button variant="outline" size="icon" onClick={() => openProfile(m)}><Eye className="h-4 w-4 text-blue-500"/></Button>
                              <Button variant="outline" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4"/></Button>
                              <Button variant="outline" size="icon" className="text-destructive" onClick={async () => {
                                 const confirmed = await confirmDialog('Tem certeza de que deseja eliminar o registo deste membro? Esta ação é irreversível.', 'APAGAR');
                                 if(confirmed) deleteMutation.mutate(m.id);
                              }}><Trash2 className="h-4 w-4"/></Button>
                           </div>
                        </CardContent>
                     </Card>
                 ))}
              </div>
              
              {hasNextPage && !searchTerm && (
                <div className="flex justify-center p-4 border-t">
                  <Button 
                    variant="outline" 
                    onClick={() => fetchNextPage()} 
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? 'A carregar...' : 'Carregar Mais'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dizimos" className="mt-0">
          <MemberTithesTracker />
        </TabsContent>

        <TabsContent value="comunhao" className="mt-0">
          <CommunionTracker />
        </TabsContent>
      </Tabs>

      {/* Member Profile Sheet */}
      <Sheet open={!!selectedMember} onOpenChange={(open) => {
        if (!open) setSelectedMember(null);
      }}>
        <SheetContent className="sm:max-w-xl w-full flex flex-col gap-0 p-0">
          <SheetHeader className="p-6 border-b flex flex-row items-center justify-between">
            <div>
              <SheetTitle>Perfil do Membro</SheetTitle>
              <SheetDescription>
                {selectedMember?.name}
              </SheetDescription>
            </div>
            {selectedMember && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCardMember(selectedMember)}>
                  <CreditCard className="h-4 w-4 mr-2 text-emerald-600" />
                  Cartão de Membro
                </Button>
                <Button variant="ghost" size="sm" onClick={() => generateMembershipCard(selectedMember)} title="Cartão pequeno (CR80)">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            )}
          </SheetHeader>
          <ScrollArea className="flex-1 p-6">
            {selectedMember && (
               <div className="space-y-6">
                 <div>
                   <h3 className="font-semibold text-lg mb-2">Detalhes</h3>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground block">Telefone</span>
                        {selectedMember.phone || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Nº do BI</span>
                        {selectedMember.documentNumber || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Nascimento</span>
                        {selectedMember.birthDate || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Morada</span>
                        {selectedMember.address || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Célula</span>
                        {selectedMember.groupCell || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Estado Civil</span>
                        {selectedMember.maritalStatus || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Estado</span>
                        <Badge variant={selectedMember.status === 'Activo' ? 'default' : selectedMember.status === 'Sob Disciplina' ? 'destructive' : 'secondary'}>
                          {selectedMember.status || 'Activo'}
                        </Badge>
                      </div>
                   </div>
                 </div>

                 <div>
                   <h3 className="font-semibold text-lg mb-4">Histórico de Dízimos & Ofertas</h3>
                   {loadingTithes ? (
                     <div className="text-center py-4 text-muted-foreground text-sm">A carregar registos...</div>
                   ) : memberTithes.length === 0 ? (
                     <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">Nenhum registo financeiro encontrado.</div>
                   ) : (
                     <>
                       {(() => {
                         const currentMonth = new Date().getMonth();
                         const currentYear = new Date().getFullYear();
                         
                         const chartData = [];
                         for (let i = 5; i >= 0; i--) {
                           let mDate = new Date(currentYear, currentMonth - i, 1);
                           const mName = mDate.toLocaleString('pt-AO', { month: 'short' });
                           const mMonth = String(mDate.getMonth() + 1).padStart(2, '0');
                           const yYear = mDate.getFullYear();
                           
                           const tithesSum = memberTithes
                             .filter(t => t.referenceMonth === mMonth && t.referenceYear === yYear)
                             .reduce((acc, curr) => acc + curr.amount, 0);
                             
                           chartData.push({
                             name: `${mName}/${yYear.toString().substring(2)}`,
                             valor: tithesSum
                           });
                         }

                         return (
                           <div className="h-[200px] w-full mb-6">
                             <ResponsiveContainer width="100%" height={200}>
                               <BarChart data={chartData}>
                                 <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                 <YAxis 
                                   fontSize={12} 
                                   tickLine={false} 
                                   axisLine={false} 
                                   tickFormatter={(value) => `${value / 1000}k`} 
                                 />
                                 <Tooltip 
                                   formatter={(value: number) => new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(value)}
                                   cursor={{fill: 'transparent'}}
                                 />
                                 <Bar dataKey="valor" fill="#2563eb" radius={[4, 4, 0, 0]} />
                               </BarChart>
                             </ResponsiveContainer>
                           </div>
                         );
                       })()}
                       <Table>
                         <TableHeader>
                           <TableRow>
                             <TableHead>Mês/Ano Ref.</TableHead>
                             <TableHead>Data de Registo</TableHead>
                             <TableHead>Valor</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {memberTithes.map(t => (
                             <TableRow key={t.id}>
                               <TableCell>{t.referenceMonth}/{t.referenceYear || '-'}</TableCell>
                               <TableCell>{t.createdAt ? new Date(t.createdAt).toLocaleDateString('pt-AO') : '-'}</TableCell>
                               <TableCell>{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(t.amount)}</TableCell>
                             </TableRow>
                           ))}
                         </TableBody>
                       </Table>
                     </>
                   )}
                 </div>
               </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <MemberCardModal
        member={cardMember}
        open={!!cardMember}
        onOpenChange={(o) => { if (!o) setCardMember(null); }}
      />

      <PastoralMessageGeneratorModal
        member={aiMessageMember}
        isOpen={!!aiMessageMember}
        onClose={() => setAiMessageMember(null)}
      />
    </div>
  );
}
