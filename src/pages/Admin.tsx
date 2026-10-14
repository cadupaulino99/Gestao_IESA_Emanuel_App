import React, { useEffect, useState } from 'react';
import { prefGet,prefSet } from '../lib/prefs';
import { createAuthAccount } from '../lib/ai';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, setDoc, deleteDoc, doc, where, updateDoc, addDoc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Shield, Plus, Trash2, Download, Upload, Church, Save, Bell, CheckCircle2, XCircle, Database, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { restoreFromTrash, moveToTrash } from '../lib/trash';
import { orderBy } from 'firebase/firestore';

export default function Admin() {
  const { user, userRole } = useAuth();
  
  const [users, setUsers] = useState<any[]>([]);
  const [nonActiveMembers, setNonActiveMembers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('admin');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirmDialog = useConfirm();

  // Church Info State
  const [churchInfo, setChurchInfo] = useState({
    nome: 'IGREJA LOCAL DE EMANUEL - XANGONGO',
    denomination: 'IGREJA EVANGÉLICA SINODAL DE ANGOLA',
    synod: 'SÍNODO ECLESIÁSTICO DO CUNENE',
    nif: '5001234567',
    endereco: 'Rua Principal, Xangongo',
    telefone: '+244 923 000 000',
    email: 'contacto@iesa-emanuel.ao',
    pastorName: '',
    treasurerName: '',
    assistantName: '',
    logoUrl: '',
    tithePercentage: '0',
    offeringPercentage: '0'
  });
  const [savingChurch, setSavingChurch] = useState(false);

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [annForm, setAnnForm] = useState({ title: '', content: '' });

  const [events, setEvents] = useState<any[]>([]);
  const [eventForm, setEventForm] = useState({ title: '', description: '', date: '', time: '' });

  const loadEvents = async () => {
    try {
      const q = query(collection(db, 'events'));
      const snap = await getDocs(q);
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    } catch (e) {
      console.log(e);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title || !eventForm.date) return;
    try {
      setLoading(true);
      await addDoc(collection(db, 'events'), {
        ...eventForm,
        createdAt: Date.now()
      });
      setEventForm({ title: '', description: '', date: '', time: '' });
      toast.success("Evento adicionado.");
      loadEvents();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'events');
    } finally {
      setLoading(false);
    }
  };

  const deleteEventSafely = async (id: string) => {
    const confirmed = await confirmDialog("Deseja eliminar este evento? Esta ação é irreversível.", "APAGAR");
    if (!confirmed) return;
    try {
      setLoading(true);
      await deleteDocSafely('events', id);
      toast.success("Evento eliminado.");
      loadEvents();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadAnnouncements = async () => {
    try {
      const q = query(collection(db, 'announcements'));
      const snap = await getDocs(q);
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => b.createdAt - a.createdAt));
    } catch (error) {
      console.log(error);
    }
  };

  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!annForm.title || !annForm.content) return;
    try {
      setLoading(true);
      await addDoc(collection(db, 'announcements'), {
        ...annForm,
        active: true,
        createdAt: Date.now(),
        adminId: user?.uid
      });
      setAnnForm({ title: '', content: '' });
      toast.success("Aviso publicado.");
      loadAnnouncements();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'announcements');
    } finally {
      setLoading(false);
    }
  };

  const toggleAnnouncement = async (id: string, active: boolean) => {
    try {
      await updateDoc(doc(db, 'announcements', id), { active });
      loadAnnouncements();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `announcements/${id}`);
    }
  };

  const deleteAnnouncementSafely = async (path: string, id: string) => {
    const confirmed = await confirmDialog("Tem a certeza que deseja eliminar este aviso? Esta ação é irreversível.", "APAGAR");
    if (!confirmed) return;
    try {
      setLoading(true);
      await deleteDocSafely(path, id);
      toast.success("Registo eliminado.");
      loadAnnouncements();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao eliminar.");
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      const q = query(collection(db, 'pedidos_atualizacao'), where('status', '==', 'pendente'));
      const snap = await getDocs(q);
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const q = query(collection(db, 'audit_logs'));
      const snap = await getDocs(q);
      let logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      logs.sort((a:any, b:any) => b.createdAt - a.createdAt);
      setAuditLogs(logs);
    } catch(e) { console.error(e); }
  };

  const [trashItems, setTrashItems] = useState<any[]>([]);

  useEffect(() => {
    // Load Users
    const loadData = async () => {
      setLoading(true);
      try {
        const uSnap = await getDocs(query(collection(db, 'admins')));
        setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const mSnap = await getDocs(query(collection(db, 'members'), where('status', '!=', 'Activo')));
        setNonActiveMembers(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const trashSnap = await getDocs(query(collection(db, 'trash'), orderBy('deletedAt', 'desc')));
        setTrashItems(trashSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        await loadRequests();
        await loadAuditLogs();
        await loadAnnouncements();
        await loadEvents();
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'admins');
      } finally {
        setLoading(false);
      }
    };

    if (userRole === 'admin') {
      loadData();
    }

    // Load Church Info from Firestore
    const loadChurchInfo = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'church'));
        if (docSnap.exists()) {
           const data = docSnap.data();
           setChurchInfo(prev => ({...prev, ...data}));
           prefSet('church-settings', JSON.stringify(data));
           window.dispatchEvent(new Event('storage'));
        } else {
           // fallback to local if not in DB
           const saved = prefGet('church-settings');
           if (saved) {
             try { setChurchInfo(JSON.parse(saved)); } catch (e) {}
           }
        }
      } catch (e) {}
    };
    loadChurchInfo();
  }, [userRole]);

  // Protect the route
  if (userRole !== 'admin') {
    return <Navigate to="/" />;
  }

  const handleApproveRequest = async (req: any) => {
    const confirmed = await confirmDialog("Aprovar as alterações e atualizar o membro?");
    if (!confirmed) return;
    
    try {
      // Update Member
      const memberRef = doc(db, 'members', req.memberId);
      await updateDoc(memberRef, {
        phone: req.requestedData.telefone,
        address: req.requestedData.endereco,
        maritalStatus: req.requestedData.estadoCivil,
        updatedAt: Date.now()
      });
      
      // Update request status
      await updateDoc(doc(db, 'pedidos_atualizacao', req.id), {
        status: 'aprovado',
        updatedAt: Date.now()
      });
      
      toast.success("Dados do membro atualizados com sucesso!");
      loadRequests();
    } catch (e) {
      toast.error("Erro ao aprovar o pedido.");
      handleFirestoreError(e, OperationType.WRITE, 'members');
    }
  };

  const handleChangeMemberStatus = async (memberId: string, newStatus: string) => {
    try {
      if (newStatus === 'Activo') {
        const confirmed = await confirmDialog("Tem certeza que deseja ativar este membro? Ele será listado novamente no painel de membros ativos.");
        if (!confirmed) return;
      }
      
      await updateDoc(doc(db, 'members', memberId), {
        status: newStatus,
        updatedAt: Date.now()
      });
      
      toast.success("Estado do membro atualizado com sucesso!");
      
      setNonActiveMembers(prev => 
         newStatus === 'Activo' 
            ? prev.filter(m => m.id !== memberId) 
            : prev.map(m => m.id === memberId ? { ...m, status: newStatus } : m)
      );
    } catch (e) {
      toast.error("Erro ao atualizar estado do membro.");
      handleFirestoreError(e, OperationType.WRITE, `members/${memberId}`);
    }
  };

  const handleBackup = async () => {
    try {
      setLoading(true);
      const collections = [
        'members', 'tithes', 'offerings', 'expenses', 'budgets', 
        'admins', 'pedidos_atualizacao', 'audit_logs', 'announcements', 
        'events', 'financialMonths', 'assets', 'buildingFunds'
      ];
      const backupData: any = {};
      
      // We skip handling errors per loop iteration intentionally, to just extract what we can
      for (const col of collections) {
         try {
           const snap = await getDocs(collection(db, col));
           backupData[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
         } catch(e) {
           console.warn(`Could not backup collection: ${col}`);
         }
      }
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `backup_igreja_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Backup concluído com sucesso!");
    } catch(e) {
      toast.error("Erro ao gerar backup.");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const confirmRestore = await confirmDialog("ATENÇÃO: Tem a certeza que deseja restaurar o sistema a partir deste ficheiro de backup? Isso irá sobrescrever dados existentes com o mesmo ID.", "RESTAURAR");
    if (!confirmRestore) {
       event.target.value = '';
       return;
    }

    try {
      setLoading(true);
      const reader = new FileReader();

      reader.onload = async (e) => {
         try {
           const content = e.target?.result as string;
           const backupData = JSON.parse(content);
           let totalRestored = 0;

           for (const colName of Object.keys(backupData)) {
             const items = backupData[colName];
             if (Array.isArray(items)) {
                for (const item of items) {
                   const { id, ...data } = item;
                   if (id) {
                     await setDoc(doc(db, colName, id), data);
                     totalRestored++;
                   }
                }
             }
           }
           
           toast.success(`Sistema restaurado com sucesso! ${totalRestored} registos importados.`);
         } catch (error) {
           console.error("Error parsing backup data:", error);
           toast.error("Erro ao processar ficheiro de backup. Formato inválido.");
         } finally {
           setLoading(false);
           event.target.value = '';
         }
      };

      reader.readAsText(file);
    } catch (e) {
      console.error(e);
      toast.error("Ocorreu um erro ao ler o ficheiro.");
      setLoading(false);
      event.target.value = '';
    }
  };

  const handleRejectRequest = async (reqId: string) => {
    const confirmed = await confirmDialog("Rejeitar este pedido de alteração?");
    if (!confirmed) return;
    
    try {
      await updateDoc(doc(db, 'pedidos_atualizacao', reqId), {
        status: 'rejeitado',
        updatedAt: Date.now()
      });
      toast.info("Pedido rejeitado.");
      loadRequests();
    } catch (e) {
      toast.error("Erro ao rejeitar o pedido.");
      handleFirestoreError(e, OperationType.WRITE, 'pedidos_atualizacao');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!email || !email.includes('@')) {
      toast.error("Introduza um e-mail válido.");
      return;
    }

    setIsSubmitting(true);
    const confirmed = await confirmDialog(`Deseja adicionar o utilizador ${email} como ${role}?`);
    if (!confirmed) {
      setIsSubmitting(false);
      return;
    }

    try {
      await setDoc(doc(db, 'admins', email.toLowerCase()), {
        email: email.toLowerCase(),
        role: role,
        createdAt: Date.now()
      });
      toast.success("Utilizador adicionado com sucesso.");

      // Cria a conta de autenticação (email + palavra-passe) via Cloud Function,
      // para que o utilizador consiga entrar também sem Google.
      try {
        const r = await createAuthAccount({ email: email.toLowerCase() });
        if (r.data?.tempPassword) {
          toast.success(
            `Conta de email criada. Palavra-passe temporária: ${r.data.tempPassword} — partilhe-a com o utilizador (ele poderá repô-la por email).`,
            { duration: 20000 }
          );
        }
      } catch (authErr) {
        console.warn('createAuthAccount falhou (Cloud Functions implantadas?):', authErr);
        toast.warning(
          'Permissão guardada, mas a conta de email não foi criada automaticamente. Implante as Cloud Functions (docs/GUIA-FIREBASE.md) ou crie-a na consola Firebase.'
        );
      }

      setIsDialogOpen(false);
      setEmail('');
      setRole('admin');
      
      // Reload
      const uSnap = await getDocs(query(collection(db, 'admins')));
      setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      toast.error("Erro ao adicionar utilizador. Sem permissão.");
      handleFirestoreError(error, OperationType.WRITE, 'admins');
    }
    setIsSubmitting(false);
  };

  const handleRestoreTrash = async (trashId: string) => {
    const confirmed = await confirmDialog("Tem a certeza que deseja restaurar este registo?");
    if (!confirmed) return;
    
    setLoading(true);
    try {
      const success = await restoreFromTrash(trashId);
      if (success) {
        toast.success("Registo restaurado com sucesso!");
        // Refresh trash list
        const trashSnap = await getDocs(query(collection(db, 'trash'), orderBy('deletedAt', 'desc')));
        setTrashItems(trashSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        toast.error("Erro: Registo não encontrado na lixeira.");
      }
    } catch(e) {
      toast.error("Erro ao restaurar.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const deleteDocSafely = async (col: string, id: string) => {
    let confirmMsg = "Tem certeza de que deseja eliminar esta informação?";
    let requireText = undefined;
    
    if (col === 'admins') {
      confirmMsg = `Tem a certeza absoluta? Está prestes a remover o acesso de um administrador.`;
      requireText = "REMOVER";
    }

    const confirmed = await confirmDialog(confirmMsg, requireText);
    if(confirmed) {
      try { 
        await deleteDoc(doc(db, col, id)); 
        const uSnap = await getDocs(query(collection(db, 'admins')));
        setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        toast.success("Removido."); 
      } catch(e) { 
        toast.error("Erro de permissão ao remover."); 
        handleFirestoreError(e, OperationType.DELETE, col); 
      }
    }
  };

  const exportUsersExcel = () => {
    if (users.length === 0) {
      toast.error("Não há dados para exportar.");
      return;
    }
    
    const rows = users.map(u => ({
      'E-mail': u.email,
      'Papel': u.role,
      'Data de Registo': new Date(u.createdAt).toLocaleDateString('pt-AO')
    }));
    
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Utilizadores");
      XLSX.writeFile(wb, `utilizadores_${new Date().toISOString().substring(0, 10)}.xlsx`);
      toast.success("Ficheiro exportado com sucesso.");
    }).catch(err => {
      console.error(err);
      toast.error("Erro ao exportar ficheiro.");
    });
  };

  const handleSaveInfo = async () => {
    const confirmed = await confirmDialog("Deseja guardar esta informação?");
    if (!confirmed) return;
    
    setSavingChurch(true);
    try {
      await setDoc(doc(db, 'settings', 'church'), churchInfo);
      prefSet('church-settings', JSON.stringify(churchInfo));
      window.dispatchEvent(new Event('storage'));
      toast.success('Definições da igreja salvas com sucesso.');
    } catch (e: any) {
      toast.error('Erro ao guardar as definições.');
      console.error(e);
    }
    setSavingChurch(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 300 * 1024) {
        toast.error("A imagem não deve exceder 300KB para evitar lentidão.");
        return;
      }
      
      const toastId = toast.loading("A processar a imagem...");
      try {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setChurchInfo({...churchInfo, logoUrl: reader.result});
            toast.success("Imagem carregada com sucesso!", { id: toastId });
          }
        };
        reader.readAsDataURL(file);
      } catch (error) {
         console.error("Erro no processamento da imagem", error);
         toast.error("Erro ao carregar a imagem.", { id: toastId });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Painel do Administrador</h2>
          <p className="text-muted-foreground">Adicione utilizadores ou altere as definições da igreja.</p>
        </div>
        
        <Dialog open={isRequestsOpen} onOpenChange={setIsRequestsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="relative">
              <Bell className="w-4 h-4 mr-2" />
              Notificações
              {requests.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {requests.length}
                </span>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Pedidos de Atualização ({requests.length})</DialogTitle>
              <DialogDescription>
                Reveja os pedidos dos membros e aprove ou rejeite-os.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2">
              {requests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum pedido pendente de aprovação.</p>
              ) : (
                requests.map(req => (
                  <Card key={req.id} className="border bg-slate-50 dark:bg-card">
                    <CardHeader className="p-4 pb-2 border-b bg-white dark:bg-slate-900 rounded-t-lg">
                      <CardTitle className="text-md flex items-center justify-between">
                        {req.memberName}
                        <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <p className="font-semibold text-xs text-muted-foreground">Novos Dados Solicitados</p>
                          <p><span className="font-medium">Tlf:</span> {req.requestedData.telefone || '-'}</p>
                          <p><span className="font-medium">End:</span> {req.requestedData.endereco || '-'}</p>
                          <p><span className="font-medium">Est:</span> {req.requestedData.estadoCivil || '-'}</p>
                        </div>
                        <div className="space-y-1 text-muted-foreground">
                          <p className="font-semibold text-xs text-muted-foreground opacity-50">Dados Atuais</p>
                          <p className="opacity-80"><span className="font-medium">Tlf:</span> {req.currentData.telefone || '-'}</p>
                          <p className="opacity-80"><span className="font-medium">End:</span> {req.currentData.endereco || '-'}</p>
                          <p className="opacity-80"><span className="font-medium">Est:</span> {req.currentData.estadoCivil || '-'}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApproveRequest(req)}>
                          <CheckCircle2 className="w-4 h-4 mr-2" /> Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleRejectRequest(req.id)}>
                          <XCircle className="w-4 h-4 mr-2" /> Rejeitar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="users"><Shield className="h-4 w-4 mr-2" /> Utilizadores</TabsTrigger>
          <TabsTrigger value="members"><Shield className="h-4 w-4 mr-2" /> Membros Inativos</TabsTrigger>
          <TabsTrigger value="mural"><Bell className="h-4 w-4 mr-2" /> Mural e Agenda</TabsTrigger>
          <TabsTrigger value="church"><Church className="h-4 w-4 mr-2" /> Dados da Instituição</TabsTrigger>
          <TabsTrigger value="data"><Database className="h-4 w-4 mr-2" /> Gestão de Dados</TabsTrigger>
          <TabsTrigger value="trash"><Trash2 className="h-4 w-4 mr-2" /> Lixeira</TabsTrigger>
          <TabsTrigger value="audit" className="bg-red-50 text-red-600 dark:bg-red-900/10 dark:text-red-400">
            <Shield className="h-4 w-4 mr-2" /> Auditorias (Logs)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
              <div>
                <h3 className="text-lg font-semibold">Gestão de Permissões</h3>
                <p className="text-sm text-muted-foreground">Controle de acesso à plataforma.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={exportUsersExcel}>
                  <Download className="w-4 h-4 mr-2" /> Exportar (Excel)
                </Button>

                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                  if(!open) { setEmail(''); setRole('admin'); }
                  setIsDialogOpen(open);
                }}>
                  <DialogTrigger asChild>
                    <Button><Plus className="w-4 h-4 mr-2" /> Adicionar</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Novo Utilizador</DialogTitle>
                      <DialogDescription>Autorize utilizadores ao sistema. Defina o número de permissões necessárias.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddUser} className="space-y-4">
                        <div className="space-y-2">
                          <Label>E-mail do utilizador (Google)</Label>
                          <Input required placeholder="Exemplo: joao@gmail.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Papel</Label>
                          <Select value={role} onValueChange={setRole}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador Geral</SelectItem>
                              <SelectItem value="pastor">Pastor</SelectItem>
                              <SelectItem value="treasurer">Tesoureiro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>Guardar Utilizador</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5"/> Administradores Registados</CardTitle>
                <CardDescription>Apenas estes utilizadores terão acesso total às finanças da congregação.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead className="w-[100px]">Acções</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-8">Carregando...</TableCell></TableRow>
                    ) : users.map(u => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.email}</TableCell>
                          <TableCell className="capitalize">{u.role === 'admin' ? "Administrador Geral" : u.role === 'pastor' ? "Pastor" : "Tesoureiro"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => deleteDocSafely('admins', u.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                    ))}
                    {!loading && users.length === 0 && (
                        <TableRow><TableCell colSpan={3} className="text-center py-8">Sem utilizadores adicionais registados.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <div className="text-xs text-muted-foreground p-2 border border-blue-100 bg-blue-50/20 rounded-md">
              * Nota: O endereço de e-mail deve corresponder exactamente à conta Google com que o utilizador faz Login.
              A configuração root de Super Administrador principal está definida em código.
            </div>
          </div>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Membros Inativos</CardTitle>
              <CardDescription>Visualização de todos os membros que estão inativos, falecidos, transferidos ou sob disciplina.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead className="w-[180px]">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonActiveMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">Nenhum registo encontrado</TableCell>
                    </TableRow>
                  ) : (
                    nonActiveMembers.map(m => (
                      <TableRow key={m.id}>
                        <TableCell>{m.name}</TableCell>
                        <TableCell>
                          <Badge variant={m.status === 'Sob Disciplina' ? 'destructive' : 'secondary'}>{m.status}</Badge>
                        </TableCell>
                        <TableCell>{m.phone || '-'}</TableCell>
                        <TableCell>
                          <Select 
                            value={m.status} 
                            onValueChange={(val) => handleChangeMemberStatus(m.id, val)}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Alterar estado" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Activo">Activar Membro</SelectItem>
                              <SelectItem value="Inativo">Inativo</SelectItem>
                              <SelectItem value="Sob Disciplina">Sob Disciplina</SelectItem>
                              <SelectItem value="Transferido">Transferido</SelectItem>
                              <SelectItem value="Falecido">Falecido</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mural">
          <div className="grid md:grid-cols-2 gap-6">
             <Card>
                <CardHeader>
                   <CardTitle>Mural de Avisos</CardTitle>
                   <CardDescription>Crie e gira os anúncios da página inicial.</CardDescription>
                </CardHeader>
                <CardContent>
                   <form onSubmit={handleAddAnnouncement} className="space-y-4 mb-6 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
                      <div className="space-y-2">
                         <Label>Título do Aviso</Label>
                         <Input placeholder="Ex: Jejum Nacional..." value={annForm.title} onChange={e => setAnnForm({...annForm, title: e.target.value})} required />
                      </div>
                      <div className="space-y-2">
                         <Label>Conteúdo</Label>
                         <textarea 
                           className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                           placeholder="Detalhes do aviso..."
                           value={annForm.content}
                           onChange={e => setAnnForm({...annForm, content: e.target.value})}
                           required
                         />
                      </div>
                      <Button type="submit" disabled={loading} className="w-full">Publicar Aviso</Button>
                   </form>

                   <div className="space-y-4">
                      {announcements.map(ann => (
                         <div key={ann.id} className={`border rounded-lg p-4 flex justify-between gap-4 ${!ann.active ? 'opacity-50' : ''}`}>
                            <div className="flex-1 w-0">
                               <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-bold truncate">{ann.title}</h4>
                                  <Badge variant={ann.active ? 'default' : 'secondary'} className="text-[10px] shrink-0">{ann.active ? 'Ativo' : 'Oculto'}</Badge>
                               </div>
                               <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ann.content}</p>
                            </div>
                            <div className="flex flex-col gap-2 justify-start items-end shrink-0">
                               <Button variant="outline" size="sm" onClick={() => toggleAnnouncement(ann.id, !ann.active)}>
                                  {ann.active ? 'Ocultar' : 'Ativar'}
                               </Button>
                               <Button variant="ghost" size="icon" onClick={() => deleteAnnouncementSafely('announcements', ann.id)}>
                                  <Trash2 className="text-destructive h-4 w-4" />
                               </Button>
                            </div>
                         </div>
                      ))}
                      {announcements.length === 0 && <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">Sem avisos publicados.</div>}
                   </div>
                </CardContent>
             </Card>

             <Card>
                <CardHeader>
                   <CardTitle>Agenda e Eventos</CardTitle>
                   <CardDescription>Eventos programados para o calendário geral.</CardDescription>
                </CardHeader>
                <CardContent>
                   <form onSubmit={handleAddEvent} className="space-y-4 mb-6 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-900/10">
                      <div className="space-y-2">
                         <Label>Título do Evento</Label>
                         <Input placeholder="Ex: Conferência de Jovens" value={eventForm.title} onChange={e => setEventForm({...eventForm, title: e.target.value})} required />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <Label>Data</Label>
                           <Input type="date" value={eventForm.date} onChange={e => setEventForm({...eventForm, date: e.target.value})} required />
                         </div>
                         <div className="space-y-2">
                           <Label>Hora (opcional)</Label>
                           <Input type="time" value={eventForm.time} onChange={e => setEventForm({...eventForm, time: e.target.value})} />
                         </div>
                      </div>
                      <div className="space-y-2">
                         <Label>Descrição Mínima</Label>
                         <Input placeholder="Local ou tema do evento..." value={eventForm.description} onChange={e => setEventForm({...eventForm, description: e.target.value})} />
                      </div>
                      <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">Adicionar Evento</Button>
                   </form>

                   <div className="space-y-4">
                      {events.map((ev: any) => (
                         <div key={ev.id} className="border rounded-lg p-3 flex justify-between gap-4">
                            <div className="flex-1">
                               <div className="flex gap-2 justify-between items-start mb-1">
                                  <h4 className="font-bold text-sm">{ev.title}</h4>
                               </div>
                               {ev.description && <p className="text-xs text-muted-foreground mb-2">{ev.description}</p>}
                               <div className="text-xs font-medium text-blue-700 bg-blue-50 w-fit px-2 py-0.5 rounded">
                                  {new Date(ev.date).toLocaleDateString('pt-AO')} {ev.time ? `às ${ev.time}` : ''}
                               </div>
                            </div>
                            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => deleteEventSafely(ev.id)}>
                               <Trash2 className="text-destructive h-4 w-4" />
                            </Button>
                         </div>
                      ))}
                      {events.length === 0 && <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">Sem eventos na agenda.</div>}
                   </div>
                </CardContent>
             </Card>
          </div>
        </TabsContent>

        <TabsContent value="church">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Church className="h-5 w-5 text-muted-foreground" />
                Detalhes da Instituição
              </CardTitle>
              <CardDescription>Estes dados serão usados na geração de recibos, relatórios e extratos em PDF.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); handleSaveInfo(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="denomination">Denominação</Label>
                  <Input 
                    id="denomination" 
                    value={churchInfo.denomination} 
                    onChange={e => setChurchInfo({...churchInfo, denomination: e.target.value.toUpperCase()})} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="synod">Sínodo</Label>
                  <Input 
                    id="synod" 
                    value={churchInfo.synod} 
                    onChange={e => setChurchInfo({...churchInfo, synod: e.target.value.toUpperCase()})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nome">Igreja Local</Label>
                  <Input 
                    id="nome" 
                    value={churchInfo.nome} 
                    onChange={e => setChurchInfo({...churchInfo, nome: e.target.value.toUpperCase()})} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nif">NIF (Número de Identificação Fiscal)</Label>
                  <Input 
                    id="nif" 
                    value={churchInfo.nif} 
                    onChange={e => setChurchInfo({...churchInfo, nif: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endereco">Endereço Principal</Label>
                  <Input 
                    id="endereco" 
                    value={churchInfo.endereco} 
                    onChange={e => setChurchInfo({...churchInfo, endereco: e.target.value})} 
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone</Label>
                    <Input 
                      id="telefone" 
                      value={churchInfo.telefone} 
                      onChange={e => setChurchInfo({...churchInfo, telefone: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input 
                      id="email" 
                      type="email"
                      value={churchInfo.email} 
                      onChange={e => setChurchInfo({...churchInfo, email: e.target.value})} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pastorName">Nome do Pastor</Label>
                  <Input 
                    id="pastorName" 
                    value={churchInfo.pastorName} 
                    onChange={e => setChurchInfo({...churchInfo, pastorName: e.target.value})} 
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="treasurerName">Nome do Tesoureiro</Label>
                    <Input 
                      id="treasurerName" 
                      value={churchInfo.treasurerName} 
                      onChange={e => setChurchInfo({...churchInfo, treasurerName: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assistantName">Nome do Assist. Administrativo</Label>
                    <Input 
                      id="assistantName" 
                      value={churchInfo.assistantName} 
                      onChange={e => setChurchInfo({...churchInfo, assistantName: e.target.value})} 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2">
                  <div className="space-y-2">
                    <Label htmlFor="tithePercentage">Percentagem Dízimos (Sínodo) %</Label>
                    <Input 
                      id="tithePercentage" 
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="Ex: 10"
                      value={churchInfo.tithePercentage} 
                      onChange={e => setChurchInfo({...churchInfo, tithePercentage: e.target.value})} 
                    />
                    <p className="text-[10px] text-muted-foreground leading-tight">Valor deduzido dos dízimos e enviado como Saída para o Sínodo.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="offeringPercentage">Percentagem Oferta Geral (Sínodo) %</Label>
                    <Input 
                      id="offeringPercentage" 
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="Ex: 10"
                      value={churchInfo.offeringPercentage} 
                      onChange={e => setChurchInfo({...churchInfo, offeringPercentage: e.target.value})} 
                    />
                    <p className="text-[10px] text-muted-foreground leading-tight">Valor deduzido de Ofertas Gerais e enviado como Saída para o Sínodo.</p>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <Label htmlFor="logoUpload">Logótipo da Igreja</Label>
                  <div className="flex items-center gap-4">
                    {churchInfo.logoUrl && (
                      <div className="w-16 h-16 rounded-md overflow-hidden bg-slate-100 flex items-center justify-center border">
                        <img src={churchInfo.logoUrl} alt="Logótipo" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <div className="flex-1">
                      <Input 
                        id="logoUpload" 
                        type="file"
                        accept="image/png, image/jpeg, image/jpg"
                        onChange={handleLogoUpload} 
                      />
                      <p className="text-xs text-muted-foreground mt-1">Recomendado: Imagens até 2MB, preferencialmente fundos transparentes (.PNG)</p>
                    </div>
                    {churchInfo.logoUrl && (
                      <Button variant="ghost" size="icon" type="button" onClick={() => setChurchInfo({ ...churchInfo, logoUrl: '' })} className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <Button type="submit" className="w-full mt-2" disabled={savingChurch}>
                  {savingChurch ? 'A Guardar...' : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Informações
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="data">
          <div className="space-y-6">
             <Card className="border shadow-sm">
                <CardHeader>
                   <CardTitle className="flex items-center gap-2">
                     <Database className="h-5 w-5 text-blue-600" /> Cópia de Segurança (Backup)
                   </CardTitle>
                   <CardDescription>
                     Exporte todos os dados do sistema para um ficheiro JSON local, ou restaure o sistema usando um ficheiro existente.
                   </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4">
                   <Button onClick={handleBackup} disabled={loading} className="gap-2 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                     <Download className="h-4 w-4" /> 
                     {loading ? 'A processar...' : 'Baixar Backup do Sistema'}
                   </Button>
                   <div className="relative w-full sm:w-auto">
                     <Input
                       type="file"
                       accept=".json"
                       onChange={handleRestore}
                       disabled={loading}
                       className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-transparent file:text-transparent"
                     />
                     <Button type="button" disabled={loading} variant="outline" className="w-full gap-2 pointer-events-none">
                       <Upload className="h-4 w-4" />
                       Restaurar Backup a partir de ficheiro
                     </Button>
                   </div>
                </CardContent>
             </Card>
          </div>
        </TabsContent>

        <TabsContent value="trash">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" /> Lixeira do Sistema
              </CardTitle>
              <CardDescription>
                Registos que foram apagados no sistema. Pode restaurá-los aqui caso tenham sido apagados por engano.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead>Data Apagado</TableHead>
                      <TableHead>Apagado Por</TableHead>
                      <TableHead>Módulo</TableHead>
                      <TableHead>Dados do Registo</TableHead>
                      <TableHead className="w-[100px]">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">A lixeira está vazia.</TableCell>
                      </TableRow>
                    ) : (
                      trashItems.map((item) => (
                        <TableRow key={item.id} className="text-sm">
                          <TableCell className="whitespace-nowrap">{item.deletedAt ? new Date(item.deletedAt).toLocaleString('pt-AO') : '-'}</TableCell>
                          <TableCell className="font-medium text-xs">{item.deletedBy}</TableCell>
                          <TableCell className="text-xs uppercase">{item.collectionName}</TableCell>
                          <TableCell className="max-w-xs text-xs font-mono text-muted-foreground truncate">
                            {JSON.stringify(item.data)}
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => handleRestoreTrash(item.id)}>Restaurar</Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="border-red-100 dark:border-red-900/20 shadow-sm">
            <CardHeader className="bg-red-50/50 dark:bg-red-900/10 rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <Shield className="h-5 w-5"/> Auditorias (Logs)
              </CardTitle>
              <CardDescription className="text-red-600/80 dark:text-red-400/80">
                Registo inalterável de edições e eliminações de dados financeiros sensíveis.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Acção</TableHead>
                      <TableHead>Tesoureiro / Utilizador</TableHead>
                      <TableHead>Registo</TableHead>
                      <TableHead>Detalhes (Mudanças)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhum log de auditoria encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditLogs.map(log => (
                        <TableRow key={log.id} className="text-sm">
                          <TableCell className="whitespace-nowrap">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString('pt-AO') : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={log.action === 'DELETE' ? 'destructive' : 'default'} className="text-[10px]">
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-xs">{log.adminEmail}</TableCell>
                          <TableCell className="text-xs text-muted-foreground uppercase">{log.collectionName}</TableCell>
                          <TableCell className="max-w-xs text-xs font-mono text-muted-foreground">
                            {log.action === 'DELETE' && (
                              <div>Eliminou registo de {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(log.originalData?.amount || 0)}</div>
                            )}
                            {log.action === 'UPDATE' && (
                              <div className="space-y-1">
                                <div><span className="text-red-500 line-through mr-2">{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(log.originalData?.amount || 0)}</span>
                                <span className="text-emerald-500">{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(log.newData?.amount || 0)}</span></div>
                                <details className="cursor-pointer text-[10px] text-blue-500 hover:text-blue-600">
                                  <summary>Ver JSON</summary>
                                  <div className="mt-1 p-2 bg-slate-100 dark:bg-slate-800 rounded">
                                    <div className="mb-1"><strong>Antes:</strong> {JSON.stringify(log.originalData)}</div>
                                    <div><strong>Depois:</strong> {JSON.stringify(log.newData)}</div>
                                  </div>
                                </details>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
