import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Search, HandCoins, PiggyBank, Send, Sparkles, Trash2, RefreshCw, MessageCircle, Smartphone, Ban, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { Member, BudgetEntry, Contribution, ContributionPayment, OutboxMessage, Campaign } from '../types';
import { computeStatus, paidSumOf, fillTemplate, smsSegments, placeholdersIn } from '../lib/contrib';
import { notifyMember, cancelOutbox, CANCEL_WINDOW_MS } from '../lib/notify';
import { normalizePhoneAO, duplicatePhones } from '../lib/phone';
import { openExternal } from '../lib/download';
import { aiBulkTemplates } from '../lib/ai';
import { idxToName } from '../lib/months';

const THIS_YEAR = new Date().getFullYear();
const fmtKz = (n: number) => `${(n || 0).toLocaleString('pt-AO')} Kz`;
const fmtDate = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export default function Contributions() {
  const { user, userRole, isAdmin } = useAuth();
  const confirmDialog = useConfirm();
  const qc = useQueryClient();
  const canWrite = !!isAdmin; // só administradores (super incluído); servidor também impõe

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todos' | 'sem_valor' | 'com_valor'>('todos');
  const [year, setYear] = useState<number>(THIS_YEAR);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkValue, setBulkValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'manter' | 'substituir'>('manter');
  const [busy, setBusy] = useState(false);

  const [memberPick, setMemberPick] = useState<Member | null>(null);
  const [contribDialog, setContribDialog] = useState(false);
  const [cForm, setCForm] = useState({ description: '', amount: '', dueDate: new Date().toISOString().slice(0, 10) });
  const [payDialog, setPayDialog] = useState<Contribution | null>(null);
  const [pForm, setPForm] = useState({ amount: '', deliveryDate: new Date().toISOString().slice(0, 10) });
  const [reasonDialog, setReasonDialog] = useState<{ c: Contribution; action: 'close' | 'reopen' } | null>(null);
  const [reason, setReason] = useState('');

  // IA / campanhas
  const [audience, setAudience] = useState('contrib_em_curso');
  const [goal, setGoal] = useState('');
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<{ id: string; label: string; members: Member[]; contribs?: Contribution[] }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ['members_contrib'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'members'), where('status', '==', 'Activo')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Member);
    },
  });
  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', year],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'member_budgets'), where('year', '==', year)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BudgetEntry);
    },
  });
  const { data: contributions = [] } = useQuery({
    queryKey: ['contributions'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'contributions'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contribution);
    },
  });
  const { data: payments = [] } = useQuery({
    queryKey: ['contrib_payments'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'contribution_payments'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ContributionPayment);
    },
  });
  const { data: outbox = [] } = useQuery({
    queryKey: ['outbox'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'message_outbox'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as OutboxMessage);
    },
  });


  const budgetOf = (memberId: string) => budgets.find((b) => b.memberId === memberId);
  const contribsOf = (memberId: string) =>
    contributions
      .filter((c) => c.memberId === memberId)
      .map((c) => ({ ...c, paid: paidSumOf(payments, c.id), status: computeStatus(c, paidSumOf(payments, c.id), c.amount) }));

  const filteredMembers = useMemo(() => {
    const t = search.trim().toLowerCase();
    return members.filter((m) => {
      if (t && !m.name.toLowerCase().includes(t) && !(m.phone || '').includes(t)) return false;
      const b = budgetOf(m.id);
      if (filter === 'sem_valor') return !b || !b.amount;
      if (filter === 'com_valor') return !!b && !!b.amount;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, budgets, search, filter]);

  const allSelected = filteredMembers.length > 0 && filteredMembers.every((m) => selected[m.id]);
  const selectedMembers = filteredMembers.filter((m) => selected[m.id]);

  /* ────────────────────────── ORÇAMENTO ÚNICO ────────────────────────── */
  const setBudgetOne = async (m: Member, amount: number) => {
    const prev = budgetOf(m.id);
    await writeBatch(db).commit(); // no-op p/ manter tipo (batch real abaixo)
    const b = writeBatch(db);
    const id = `${m.id}_${year}`;
    b.set(doc(db, 'member_budgets', id), {
      memberId: m.id, memberEmail: m.email || null, year, amount,
      setBy: user?.email || 'unknown', setAt: Date.now(),
      history: [...(prev?.history || []), { from: prev?.amount ?? null, to: amount, by: user?.email || 'unknown', at: Date.now() }],
    });
    await b.commit();
    await notifyMember({
      member: m, kind: 'budget_set', refId: id, byEmail: user?.email || '',
      title: 'Orçamento único definido',
      body: `Paz, ${m.name}. O seu orçamento único para ${year} foi definido em ${fmtKz(amount)}. Sem prazo fixo — cada oferta conta. Obrigado!`,
    });
    qc.invalidateQueries({ queryKey: ['budgets'] });
  };

  const bulkConfirmInfo = useMemo(() => {
    const val = parseInt(bulkValue, 10);
    const differing = selectedMembers
      .map((m) => ({ m, current: budgetOf(m.id)?.amount ?? null }))
      .filter((x) => x.current !== null && x.current !== val);
    return { val, differing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMembers, bulkValue, budgets]);

  const applyBulk = async () => {
    const { val, differing } = bulkConfirmInfo;
    if (!val || val <= 0) { toast.error('Valor inválido.'); return; }
    setBusy(true);
    try {
      const targets = bulkMode === 'manter' ? selectedMembers.filter((m) => !budgetOf(m.id)?.amount) : selectedMembers;
      // tudo-ou-nada: um único batch atómico
      const b = writeBatch(db);
      for (const m of targets) {
        const prev = budgetOf(m.id);
        b.set(doc(db, 'member_budgets', `${m.id}_${year}`), {
          memberId: m.id, memberEmail: m.email || null, year, amount: val,
          setBy: user?.email || 'unknown', setAt: Date.now(),
          history: [...(prev?.history || []), { from: prev?.amount ?? null, to: val, by: user?.email || 'unknown', at: Date.now() }],
        });
      }
      await b.commit();
      for (const m of targets) {
        await notifyMember({
          member: m, kind: 'budget_set', refId: `${m.id}_${year}`, byEmail: user?.email || '',
          title: 'Orçamento único definido',
          body: `Paz, ${m.name}. O seu orçamento único para ${year} foi definido em ${fmtKz(val)}. Obrigado!`,
        }).catch(() => {});
      }
      toast.success(`Orçamento ${fmtKz(val)} definido para ${targets.length} membro(s). Mensagens na fila com janela de 10 min.`);
      void differing;
      setConfirmOpen(false); setSelected({}); setBulkValue('');
      qc.invalidateQueries({ queryKey: ['budgets'] });
    } catch (e: any) {
      toast.error(`Falha ao gravar: ${e?.message || e}. Nenhum membro foi alterado.`);
    } finally {
      setBusy(false);
    }
  };

  /* ────────────────────────── CONTRIBUIÇÕES ────────────────────────── */
  const createContribution = async () => {
    if (!memberPick) return;
    const amount = parseInt(cForm.amount, 10);
    if (!amount || amount <= 0 || !Number.isInteger(amount)) { toast.error('Valor inteiro positivo, em kwanzas.'); return; }
    if (!cForm.description.trim()) { toast.error('Descrição obrigatória.'); return; }
    setBusy(true);
    try {
      const ref = await addDoc(collection(db, 'contributions'), {
        memberId: memberPick.id, memberEmail: memberPick.email || null, memberName: memberPick.name,
        phone: normalizePhoneAO(memberPick.phone), acceptsMessages: memberPick.acceptsMessages !== false,
        description: cForm.description.trim(), amount, dueDate: cForm.dueDate,
        status: 'em_curso', paidAmount: 0, completedAt: null, closeReason: null, reopenReason: null,
        setBy: user?.email || 'unknown', setAt: Date.now(), history: [],
      });
      await notifyMember({
        member: memberPick, kind: 'contribution_set', refId: ref.id, byEmail: user?.email || '',
        title: 'Nova contribuição',
        body: `Paz, ${memberPick.name}. Foi registada a contribuição «${cForm.description}» no valor de ${fmtKz(amount)}, com prazo ${fmtDate(cForm.dueDate)}. Obrigado!`,
      });
      toast.success('Contribuição criada e membro notificado (fila com janela de 10 min).');
      setContribDialog(false); setCForm({ description: '', amount: '', dueDate: new Date().toISOString().slice(0, 10) });
      qc.invalidateQueries({ queryKey: ['contributions'] });
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar.'); } finally { setBusy(false); }
  };

  const addPayment = async () => {
    if (!payDialog) return;
    const amount = parseFloat(pForm.amount);
    if (!amount || amount <= 0) { toast.error('Valor inválido.'); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, 'contribution_payments'), {
        contributionId: payDialog.id, memberId: payDialog.memberId, amount,
        deliveryDate: pForm.deliveryDate, recordedBy: user?.email || 'unknown', createdAt: Date.now(),
      });
      const newPaid = paidSumOf(payments, payDialog.id) + amount;
      if (newPaid + 0.005 >= payDialog.amount && payDialog.status !== 'concluida') {
        await updateDoc(doc(db, 'contributions', payDialog.id), { status: 'concluida', completedAt: Date.now(), paidAmount: newPaid });
        const m = members.find((x) => x.id === payDialog.memberId);
        if (m) await notifyMember({ member: m, kind: 'contribution_completed', refId: payDialog.id, byEmail: user?.email || '',
          title: 'Contribuição concluída', body: `«${payDialog.description}» foi concluída em ${fmtDate(pForm.deliveryDate)}. Obrigado pela sua fidelidade!` }).catch(() => {});
        toast.success('Pagamento registado: contribuição CONCLUÍDA.');
      } else {
        await updateDoc(doc(db, 'contributions', payDialog.id), { paidAmount: newPaid });
        toast.success(`Pagamento registado (${fmtKz(newPaid)} de ${fmtKz(payDialog.amount)}).`);
      }
      setPayDialog(null); setPForm({ amount: '', deliveryDate: new Date().toISOString().slice(0, 10) });
      qc.invalidateQueries({ queryKey: ['contrib_payments'] }); qc.invalidateQueries({ queryKey: ['contributions'] });
    } catch (e: any) { toast.error(e?.message || 'Erro ao registar.'); } finally { setBusy(false); }
  };

  const closeOrReopen = async () => {
    if (!reasonDialog) return;
    const { c, action } = reasonDialog;
    if (reason.trim().length < 5) { toast.error('Motivo obrigatório (mín. 5 caracteres).'); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'contributions', c.id), {
        status: action === 'close' ? 'concluida' : 'em_curso',
        completedAt: action === 'close' ? Date.now() : null,
        closeReason: action === 'close' ? reason.trim() : c.closeReason,
        reopenReason: action === 'reopen' ? reason.trim() : c.reopenReason,
        history: [...(c.history || []), { field: 'status', from: c.status, to: action === 'close' ? 'concluida' : 'em_curso', by: user?.email || 'unknown', at: Date.now() }],
      });
      toast.success(action === 'close' ? 'Concluída manualmente.' : 'Reaberta.');
      setReasonDialog(null); setReason('');
      qc.invalidateQueries({ queryKey: ['contributions'] });
    } catch (e: any) { toast.error(e?.message || 'Erro.'); } finally { setBusy(false); }
  };

  /* ────────────────────────── MENSAGENS / IA ────────────────────────── */
  const buildGroups = () => {
    const g: { id: string; label: string; members: Member[]; contribs?: Contribution[] }[] = [];
    const withContribs = members.map((m) => ({ m, cs: contribsOf(m.id) }));
    if (audience === 'todos') g.push({ id: 'todos', label: 'Todos os membros activos', members });
    else if (audience === 'sem_orcamento') g.push({ id: 'sem_orcamento', label: 'Sem orçamento definido', members: members.filter((m) => !budgetOf(m.id)?.amount) });
    else {
      const st = audience.replace('contrib_', '') as Contribution['status'];
      const hits = withContribs.flatMap(({ m, cs }) => cs.filter((c) => c.status === st).map((c) => ({ m, c })));
      g.push({ id: st, label: `Contribuição ${st.replace('_', ' ')}`, members: hits.map((h) => h.m), contribs: hits.map((h) => h.c) });
    }
    return g;
  };

  const generateTemplates = async () => {
    const g = buildGroups();
    setGroups(g);
    setAiBusy(true);
    try {
      const r = await aiBulkTemplates(goal, g.map((x) => ({ id: x.id, label: x.label, count: x.members.length })));
      setTemplates(r.templates || {});
      toast.success('Modelos gerados. Reveja, edite e confirme antes de enviar.');
    } catch (e: any) {
      toast.error(e?.message || 'IA indisponível — escreva os modelos à mão.');
      setTemplates(Object.fromEntries(g.map((x) => [x.id, ''])));
    } finally { setAiBusy(false); }
  };

  const varsFor = (m: Member, c?: Contribution) => {
    const paid = c ? paidSumOf(payments, c.id) : 0;
    return {
      nome: m.name,
      descricao: c?.description || 'orçamento único',
      valor: fmtKz(c?.amount || budgetOf(m.id)?.amount || 0),
      prazo: c?.dueDate ? fmtDate(c.dueDate) : 'sem prazo fixo',
      valor_em_falta: c ? fmtKz(Math.max(0, c.amount - paid)) : fmtKz(budgetOf(m.id)?.amount || 0),
    };
  };

  const sendCampaign = async () => {
    const g = groups.filter((x) => (templates[x.id] || '').trim());
    if (!g.length) { toast.error('Nenhum modelo preenchido.'); return; }
    // valida marcadores por destinatário ANTES de enviar
    const blocked: string[] = [];
    const plan: { m: Member; c?: Contribution; text: string }[] = [];
    for (const grp of g) {
      const cs = grp.contribs || [];
      grp.members.forEach((m, i) => {
        const c = cs[i];
        const { text, missing } = fillTemplate(templates[grp.id], varsFor(m, c));
        if (missing.length) blocked.push(`${m.name}: ${missing.join(', ')}`);
        else plan.push({ m, c, text });
      });
    }
    if (blocked.length) {
      toast.error(`Envio bloqueado — marcadores sem valor: ${blocked.slice(0, 5).join(' | ')}${blocked.length > 5 ? '…' : ''}`);
      return;
    }
    const ok = await confirmDialog(`Enviar para ${plan.length} destinatário(s) em ${g.length} grupo(s)? Cada um recebe notificação no sistema e entra na fila SMS/WhatsApp com janela de 10 min.`, 'ENVIAR');
    if (!ok) return;
    setBusy(true);
    try {
      const dup = duplicatePhones(plan.map((p) => p.m));
      if (dup.length) {
        const list = dup.map(([num, arr]) => `${num}: ${arr.map((a) => a.name).join(' + ')}`).join('; ');
        const yes = await confirmDialog(`Atenção: o mesmo número em vários membros — ${list}. O valor de um pode ir para o telemóvel de outro. Continuar mesmo assim?`, 'CONTINUAR');
        if (!yes) { setBusy(false); return; }
      }
      const campRef = await addDoc(collection(db, 'campaigns'), {
        name: `${audience} — ${new Date().toLocaleString('pt-AO')}`,
        audience, templates, groupCounts: Object.fromEntries(g.map((x) => [x.id, x.members.length])),
        createdBy: user?.email || 'unknown', createdAt: Date.now(), status: 'sent', recipientCount: plan.length,
      });
      for (const { m, c, text } of plan) {
        await notifyMember({ member: m, kind: 'campaign', refId: campRef.id, byEmail: user?.email || '', title: 'Mensagem da igreja', body: text }).catch(() => {});
        void c;
      }
      setCampaign({ id: campRef.id, name: audience, audience, templates, groupCounts: Object.fromEntries(g.map((x) => [x.id, x.members.length])), createdBy: user?.email || '', createdAt: Date.now(), status: 'sent', recipientCount: plan.length });
      toast.success(`Campanha registada: ${plan.length} destinatários na fila.`);
      qc.invalidateQueries({ queryKey: ['outbox'] });
    } catch (e: any) { toast.error(e?.message || 'Erro na campanha.'); } finally { setBusy(false); }
  };

  /* ────────────────────────── FILA ────────────────────────── */
  const markSent = async (o: OutboxMessage, ch: 'sms' | 'whatsapp') => {
    await updateDoc(doc(db, 'message_outbox', o.id), {
      [ch === 'sms' ? 'smsState' : 'waState']: 'sent',
      status: 'done', updatedAt: Date.now(),
    });
    qc.invalidateQueries({ queryKey: ['outbox'] });
  };
  const retryFailed = async () => {
    const b = writeBatch(db);
    let n = 0;
    outbox.filter((o) => o.smsState === 'failed' || o.waState === 'failed').forEach((o) => {
      b.update(doc(db, 'message_outbox', o.id), {
        smsState: o.smsState === 'failed' ? 'manual_hold' : o.smsState,
        waState: o.waState === 'failed' ? 'manual_hold' : o.waState,
        status: 'held', updatedAt: Date.now(),
      });
      n++;
    });
    if (!n) { toast.info('Nada falhado para repetir.'); return; }
    await b.commit();
    toast.success(`${n} mensagem(ns) de volta à fila.`);
    qc.invalidateQueries({ queryKey: ['outbox'] });
  };

  if (!canWrite) {
    return (
      <Card className="max-w-xl mx-auto mt-10">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Acesso negado: orçamento único, contribuições e mensagens são geridos apenas por administradores.
          (Restrição aplicada também no servidor.)
        </CardContent>
      </Card>
    );
  }

  const pending = outbox.filter((o) => o.status !== 'done');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Orçamento & Contribuições</h2>
        <p className="text-muted-foreground">Orçamento único por membro/ano, contribuições com pagamentos parciais, fila de mensagens e modelos por IA.</p>
      </div>

      <Tabs defaultValue="orcamento">
        <TabsList className="flex-wrap">
          <TabsTrigger value="orcamento" className="gap-1.5"><PiggyBank className="h-4 w-4" /> Orçamento único</TabsTrigger>
          <TabsTrigger value="contrib" className="gap-1.5"><HandCoins className="h-4 w-4" /> Contribuições</TabsTrigger>
          <TabsTrigger value="msg" className="gap-1.5"><Send className="h-4 w-4" /> Mensagens & fila</TabsTrigger>
        </TabsList>

        {/* ═══════════ ORÇAMENTO ═══════════ */}
        <TabsContent value="orcamento" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar membro…" className="pl-9" />
            </div>
            <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sem_valor">Sem valor definido</SelectItem>
                <SelectItem value="com_valor">Com valor definido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2 items-center rounded-lg border p-2 bg-slate-50 dark:bg-slate-900/50">
            <Checkbox checked={allSelected} onCheckedChange={(c) => setSelected(c ? Object.fromEntries(filteredMembers.map((m) => [m.id, true])) : {})} />
            <span className="text-xs text-muted-foreground">Selecionar todos ({filteredMembers.length})</span>
            <span className="text-xs">{selectedMembers.length} selecionado(s)</span>
            <div className="flex-1" />
            <Input value={bulkValue} onChange={(e) => setBulkValue(e.target.value.replace(/\D/g, ''))} placeholder="Valor único (Kz, inteiros)" className="w-[170px]" inputMode="numeric" />
            <Button disabled={!selectedMembers.length || !bulkValue} onClick={() => setConfirmOpen(true)}>Definir para selecionados</Button>
          </div>

          <div className="rounded-lg border">
            {filteredMembers.slice(0, 100).map((m) => {
              const b = budgetOf(m.id);
              return (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2 border-b last:border-0">
                  <Checkbox checked={!!selected[m.id]} onCheckedChange={(c) => setSelected((s) => ({ ...s, [m.id]: !!c }))} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.phone || 'sem telefone'}{m.email ? ` · ${m.email}` : ''}</div>
                  </div>
                  <div className="text-sm font-semibold">{b?.amount ? fmtKz(b.amount) : <span className="text-muted-foreground">Não definido</span>}</div>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    const v = window.prompt(`Orçamento único ${year} para ${m.name} (Kz, inteiros):`, String(b?.amount ?? ''));
                    if (v === null) return;
                    const n = parseInt(v, 10);
                    if (!n || n <= 0) { toast.error('Valor inteiro positivo.'); return; }
                    await setBudgetOne(m, n);
                    toast.success('Definido e notificado (fila com janela de 10 min).');
                  }}>Definir</Button>
                </div>
              );
            })}
            {filteredMembers.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhum membro com estes filtros.</div>}
          </div>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Confirmar definição em massa</DialogTitle>
                <DialogDescription>
                  {selectedMembers.length} membro(s) · valor {fmtKz(bulkConfirmInfo.val)} · ano {year}.
                </DialogDescription>
              </DialogHeader>
              {bulkConfirmInfo.differing.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold">Já tinham valor diferente ({bulkConfirmInfo.differing.length}):</p>
                  <div className="max-h-40 overflow-y-auto rounded border p-2 text-xs space-y-1 bg-slate-50 dark:bg-slate-900/60">
                    {bulkConfirmInfo.differing.map(({ m, current }) => (
                      <div key={m.id}>{m.name}: <b>{fmtKz(current!)}</b> → {fmtKz(bulkConfirmInfo.val)}</div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant={bulkMode === 'manter' ? 'default' : 'outline'} onClick={() => setBulkMode('manter')}>Manter os valores já definidos</Button>
                    <Button size="sm" variant={bulkMode === 'substituir' ? 'default' : 'outline'} onClick={() => setBulkMode('substituir')}>Substituir</Button>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Gravação tudo-ou-nada: se um falhar, nenhum é gravado. Cada membro recebe notificação no sistema + fila SMS/WhatsApp com janela de 10 min para cancelar.</p>
              <Button className="w-full" disabled={busy} onClick={applyBulk}>Confirmar e gravar</Button>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ═══════════ CONTRIBUIÇÕES ═══════════ */}
        <TabsContent value="contrib" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar membro…" className="pl-9" />
            </div>
            <Button onClick={() => { setMemberPick(null); setContribDialog(true); }} disabled={!memberPick && search.trim().length === 0 && false}>
              <HandCoins className="h-4 w-4 mr-2" /> Nova contribuição
            </Button>
          </div>

          {!memberPick && (
            <div className="flex flex-wrap gap-1.5">
              {filteredMembers.slice(0, 12).map((m) => (
                <Button key={m.id} variant="outline" size="sm" onClick={() => setMemberPick(m)}>{m.name}</Button>
              ))}
            </div>
          )}

          {memberPick && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{memberPick.name}</CardTitle>
                  <CardDescription>{memberPick.phone || 'sem telefone'} · {budgetOf(memberPick.id)?.amount ? `Orçamento ${year}: ${fmtKz(budgetOf(memberPick.id)!.amount)}` : `Sem orçamento ${year}`}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setMemberPick(memberPick); setContribDialog(true); }}>Nova</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMemberPick(null)}>Trocar</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {contribsOf(memberPick.id).length === 0 && <p className="text-sm text-muted-foreground">Sem contribuições.</p>}
                {contribsOf(memberPick.id).map((c) => (
                  <div key={c.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{c.description}</span>
                      <Badge variant={c.status === 'concluida' ? 'default' : c.status === 'em_atraso' ? 'destructive' : 'secondary'} className="text-[10px]">
                        {c.status === 'concluida' ? `Concluída${c.completedAt ? ` em ${new Date(c.completedAt).toLocaleDateString('pt-AO')}` : ''}` : c.status === 'em_atraso' ? 'Em atraso' : 'Em curso'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">prazo {fmtDate(c.dueDate)}</span>
                      <div className="flex-1" />
                      <span className="text-sm font-semibold">{fmtKz(c.paid)} / {fmtKz(c.amount)}</span>
                    </div>
                    {c.closeReason && <p className="text-[11px] text-muted-foreground">Fecho manual: {c.closeReason}</p>}
                    {c.reopenReason && <p className="text-[11px] text-muted-foreground">Reaberta: {c.reopenReason}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setPayDialog(c); setPForm({ amount: '', deliveryDate: new Date().toISOString().slice(0, 10) }); }}>Registar pagamento</Button>
                      {c.status !== 'concluida' && (
                        <Button size="sm" variant="ghost" onClick={() => { setReasonDialog({ c, action: 'close' }); setReason(''); }}>Concluir c/ motivo</Button>
                      )}
                      {c.status === 'concluida' && (
                        <Button size="sm" variant="ghost" onClick={() => { setReasonDialog({ c, action: 'reopen' }); setReason(''); }}>Reabrir c/ motivo</Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Dialog open={contribDialog} onOpenChange={setContribDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nova contribuição{memberPick ? ` — ${memberPick.name}` : ''}</DialogTitle>
                <DialogDescription>Se ainda não escolheu o membro, feche e escolha na lista primeiro.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {!memberPick && (
                  <div className="space-y-1">
                    <Label className="text-xs">Membro (pesquisar)</Label>
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome…" />
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {filteredMembers.slice(0, 6).map((m) => (
                        <Button key={m.id} type="button" size="sm" variant="outline" onClick={() => setMemberPick(m)}>{m.name}</Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-1"><Label className="text-xs">Descrição</Label><Input value={cForm.description} onChange={(e) => setCForm({ ...cForm, description: e.target.value })} placeholder="Ex.: Construção do templo" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Valor (Kz, inteiros)</Label><Input value={cForm.amount} onChange={(e) => setCForm({ ...cForm, amount: e.target.value.replace(/\D/g, '') })} inputMode="numeric" /></div>
                  <div className="space-y-1"><Label className="text-xs">Prazo</Label><Input type="date" value={cForm.dueDate} onChange={(e) => setCForm({ ...cForm, dueDate: e.target.value })} /></div>
                </div>
                <Button className="w-full" disabled={busy || !memberPick} onClick={createContribution}>Criar e notificar</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Registar pagamento</DialogTitle><DialogDescription>{payDialog?.description} — em falta {payDialog ? fmtKz(payDialog.amount - paidSumOf(payments, payDialog.id)) : ''}</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1"><Label className="text-xs">Valor entregue (Kz)</Label><Input value={pForm.amount} onChange={(e) => setPForm({ ...pForm, amount: e.target.value })} inputMode="decimal" /></div>
                <div className="space-y-1"><Label className="text-xs">Data de entrega (contabilidade)</Label><Input type="date" value={pForm.deliveryDate} onChange={(e) => setPForm({ ...pForm, deliveryDate: e.target.value })} /></div>
                <Button className="w-full" disabled={busy} onClick={addPayment}>Registar</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!reasonDialog} onOpenChange={(o) => !o && setReasonDialog(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{reasonDialog?.action === 'close' ? 'Concluir manualmente' : 'Reabrir contribuição'}</DialogTitle>
                <DialogDescription>Motivo obrigatório — fica no histórico e no cartão.</DialogDescription>
              </DialogHeader>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: entregue em géneros avaliados pela liderança" />
              <Button className="w-full" disabled={busy} onClick={closeOrReopen}>Confirmar</Button>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ═══════════ MENSAGENS & FILA ═══════════ */}
        <TabsContent value="msg" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-500" /> Modelos por IA (só marcadores)</CardTitle>
              <CardDescription>
                A IA recebe apenas o objectivo e as contagens por grupo — nunca nomes, telefones ou valores.
                Os marcadores {'{nome} {descricao} {valor} {prazo} {valor_em_falta}'} são substituídos pelo sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contrib_em_curso">Contribuição em curso</SelectItem>
                    <SelectItem value="contrib_em_atraso">Contribuição em atraso</SelectItem>
                    <SelectItem value="contrib_concluida">Contribuição concluída</SelectItem>
                    <SelectItem value="sem_orcamento">Sem orçamento definido</SelectItem>
                    <SelectItem value="todos">Todos os membros activos</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Objectivo (ex.: agradecer e lembrar com carinho)" className="flex-1 min-w-[200px]" />
                <Button onClick={generateTemplates} disabled={aiBusy}><Sparkles className="h-4 w-4 mr-2" /> Gerar modelos</Button>
              </div>

              {groups.map((g) => (
                <div key={g.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {g.label} <Badge variant="outline">{g.members.length} destinatário(s)</Badge>
                    <span className="text-[10px] text-muted-foreground">marcadores: {placeholdersIn(templates[g.id] || '').join(' ') || '—'}</span>
                  </div>
                  <Textarea value={templates[g.id] || ''} onChange={(e) => setTemplates({ ...templates, [g.id]: e.target.value })} rows={3} />
                  {templates[g.id] && smsSegments(fillTemplate(templates[g.id], { nome: 'X', descricao: 'X', valor: 'X', prazo: 'X', valor_em_falta: 'X' }).text) > 1 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">⚠ Texto longo: ocupará {smsSegments(templates[g.id])} partes de SMS.</p>
                  )}
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground">PRÉ-VISUALIZAÇÃO (3 exemplos com dados reais):</p>
                    {g.members.slice(0, 3).map((m, i) => (
                      <p key={m.id} className="text-[11px] rounded bg-slate-50 dark:bg-slate-900/60 border p-1.5 whitespace-pre-wrap">
                        {fillTemplate(templates[g.id] || '(modelo vazio)', varsFor(m, g.contribs?.[i])).text}
                      </p>
                    ))}
                  </div>
                </div>
              ))}

              {groups.length > 0 && (
                <Button onClick={sendCampaign} disabled={busy}><Send className="h-4 w-4 mr-2" /> Pré-visualizar e enviar…</Button>
              )}
              {campaign && <p className="text-xs text-emerald-700 dark:text-emerald-400">Última campanha: {campaign.recipientCount} destinatários em {new Date(campaign.createdAt).toLocaleString('pt-AO')}.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Fila de mensagens externas</CardTitle>
                <CardDescription>Modo manual: use os botões wa.me / sms: e marque como enviada. Janela de cancelamento de 10 min.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={retryFailed} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Repetir falhadas</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.length === 0 && <p className="text-sm text-muted-foreground">Fila vazia.</p>}
              {pending.slice(0, 30).map((o) => {
                const inWindow = o.cancelUntil > Date.now();
                return (
                  <div key={o.id} className="rounded-lg border p-2.5 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>{o.memberName || o.memberId}</b>
                      <Badge variant="outline" className="text-[10px]">{o.kind}</Badge>
                      {inWindow && <Badge variant="secondary" className="text-[10px]">cancelável {Math.ceil((o.cancelUntil - Date.now()) / 60000)} min</Badge>}
                      <span className="text-[10px] text-muted-foreground">sms: {o.smsState} · wa: {o.waState}</span>
                      <div className="flex-1" />
                      {inWindow && (
                        <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={async () => { await cancelOutbox(o.id); qc.invalidateQueries({ queryKey: ['outbox'] }); toast.success('Envio cancelado.'); }}>
                          <Ban className="h-3.5 w-3.5 mr-1" /> Cancelar
                        </Button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{o.body}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {o.phone ? (
                        <>
                          <Button size="sm" variant="outline" className="h-7" onClick={() => openExternal(`https://wa.me/${o.phone.replace(/\D/g, '')}?text=${encodeURIComponent(o.body)}`)}><MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp</Button>
                          <Button size="sm" variant="outline" className="h-7" onClick={() => openExternal(`sms:${o.phone}?body=${encodeURIComponent(o.body)}`)}><Smartphone className="h-3.5 w-3.5 mr-1" /> SMS</Button>
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => markSent(o, 'whatsapp')}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar WA enviada</Button>
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => markSent(o, 'sms')}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar SMS enviada</Button>
                        </>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">{o.acceptsMessages === false ? 'não aceita mensagens' : 'sem número'}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
