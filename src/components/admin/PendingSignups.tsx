import { useEffect, useState } from 'react';
import { collection, getDocs, getDoc, addDoc, updateDoc, doc, query, where } from 'firebase/firestore';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, UserPlus, UserX, Inbox, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../../lib/firebase';
import { logAudit } from '../../lib/audit';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { nextInternalCode } from '../../lib/members';
import { deleteSignupAccount } from '../../lib/ai';
import { uploadMemberPhoto } from '../../lib/memberPhotos';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { MemberSignup } from '../../types';
import { SIGNUP_MEMBER_FIELDS } from '../../lib/memberSchema';
import { fmtDatePT, luandaDayKey } from '../../lib/luanda';

/** Epoch → «dd/mm/aaaa às HH:MM» de Luanda (UTC+1). */
const fmtCreated = (ms: number) => {
  const iso = new Date(Number(ms || 0) + 3600000).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} às ${iso.slice(11, 16)}`;
};

const LABELS: Record<string, string> = {
  documentNumber: 'B.I.', phone: 'Telefone', birthDate: 'Nascimento', baptismDate: 'Baptismo',
  gender: 'Género', maritalStatus: 'Estado civil', spouseName: 'Cônjuge', fatherName: 'Pai',
  motherName: 'Mãe', placeOfBirth: 'Naturalidade', address: 'Morada', education: 'Formação',
  profession: 'Profissão', groupCell: 'Célula/Grupo', memberNumber: 'Nº cartão',
};

/** Constrói o documento members a partir do signup (email sempre em minúsculas). */
async function buildMemberPayload(s: MemberSignup): Promise<Record<string, unknown>> {
  const now = Date.now();
  const internalCode = await nextInternalCode();
  const emailNorm = String(s.email || '').trim().toLowerCase();
  const member: Record<string, unknown> = {
    name: s.name,
    email: emailNorm,
    memberEmail: emailNorm,
    status: 'Activo',
    internalCode,
    mustChangePassword: true,
    acceptsMessages: s.acceptsMessages !== false,
    signupId: s.id,
    createdAt: now,
    updatedAt: now,
  };
  for (const k of SIGNUP_MEMBER_FIELDS) {
    const v = (s as any)[k];
    if (v !== undefined && v !== null && v !== '') member[k] = v;
  }
  member.email = emailNorm;
  member.memberEmail = emailNorm;
  return member;
}

async function attachPhotoIfAny(memberId: string, photoBase64?: string | null) {
  if (typeof photoBase64 !== 'string' || !photoBase64) return;
  try {
    const path = await uploadMemberPhoto(memberId, photoBase64);
    await updateDoc(doc(db, 'members', memberId), { photoPath: path, photoBase64: null });
  } catch {
    /* Storage por activar */
  }
}

async function findMemberIdByEmail(emailNorm: string): Promise<string | null> {
  const q1 = query(collection(db, 'members'), where('email', '==', emailNorm));
  const s1 = await getDocs(q1);
  if (!s1.empty) return s1.docs[0].id;
  const q2 = query(collection(db, 'members'), where('memberEmail', '==', emailNorm));
  const s2 = await getDocs(q2);
  if (!s2.empty) return s2.docs[0].id;
  return null;
}

export default function PendingSignups() {
  const { user, userRole } = useAuth();
  const confirmDialog = useConfirm();
  const [list, setList] = useState<MemberSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pendente' | 'rejeitado' | 'aprovado'>('pendente');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<MemberSignup | null>(null);
  const [reason, setReason] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await getDocs(collection(db, 'member_signups'));
      setList(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MemberSignup)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    } catch (e: any) {
      const msg = String(e?.message || 'Erro ao carregar.');
      const denied = /permission-denied|Missing or insufficient/i.test(String(e?.code || '') + msg);
      setLoadError(denied
        ? 'PERMISSION_DENIED ao ler member_signups — as regras do Firestore da v1.14+ não estão publicadas neste projecto. Corra o workflow «Deploy Firebase» (GitHub → Actions) e toque em «Tentar novamente».'
        : msg);
      console.error('PendingSignups load:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (userRole === 'admin') void load(); }, [userRole]);

  if (userRole !== 'admin') {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Ecrã reservado ao perfil de administrador.
        </CardContent>
      </Card>
    );
  }

  /**
   * Aprovação: 1) criar members  2) só depois marcar signup como aprovado.
   * Se (1) falhar, o signup permanece pendente.
   */
  const approve = async (s: MemberSignup) => {
    const ok = await confirmDialog(
      `Aprovar o cadastro de «${s.name}» (${s.email})?\n\nEntrará na lista oficial de membros como Activo e, no primeiro login, terá de definir a palavra-passe definitiva.`,
    );
    if (!ok) return;
    setBusyId(s.id);
    let memberId: string | null = null;
    try {
      const now = Date.now();
      const member = await buildMemberPayload(s);
      const ref = await addDoc(collection(db, 'members'), member);
      memberId = ref.id;
      await attachPhotoIfAny(ref.id, (s as any).photoBase64);

      try {
        await updateDoc(doc(db, 'member_signups', s.id), {
          statusSignup: 'aprovado',
          approvedBy: user?.email || '',
          approvedAt: now,
          memberId: ref.id,
        });
      } catch (updErr: any) {
        console.error('approve: member created but signup update failed', updErr);
        toast.error(
          `A ficha de membro foi criada (${ref.id}), mas não foi possível marcar o pedido como aprovado. ` +
          String(updErr?.message || ''),
        );
        void logAudit('signup.approve_partial', `member_signups/${s.id}`, user?.email || '', `memberId=${ref.id}`);
        await load();
        return;
      }

      await addDoc(collection(db, 'notifications'), {
        userEmail: String(s.email || '').trim().toLowerCase(),
        kind: 'signup_approved',
        title: 'Cadastro aprovado — bem-vindo(a)!',
        body: `Paz, ${s.name}. O seu cadastro foi aprovado. Inicie sessão com o seu email; antes de entrar, defina a sua palavra-passe definitiva. Mal. 3:10`,
        read: false,
        createdAt: now,
        refId: ref.id,
      }).catch(() => {});

      toast.success(`«${s.name}» aprovado — entrou na lista oficial de membros.`);
      void logAudit('signup.approved', `member_signups/${s.id}`, user?.email || '', `name=${s.name}; memberId=${ref.id}`);
      await load();
    } catch (e: any) {
      if (!memberId) {
        toast.error('Falha ao aprovar (ficha de membro não criada — o pedido continua pendente): ' + (e?.message || 'erro desconhecido'));
      } else {
        toast.error('Falha após criar ficha: ' + (e?.message || 'erro desconhecido'));
      }
      console.error('approve signup:', e);
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Signup «aprovado» sem ficha members válida: religa se já existir email,
   * senão cria ficha nova. Não altera membros que já funcionam.
   */
  const recreateMember = async (s: MemberSignup) => {
    const existingId = String((s as any).memberId || '').trim();
    if (existingId) {
      try {
        const snap = await getDoc(doc(db, 'members', existingId));
        if (snap.exists()) {
          toast.message('A ficha de membro já existe.', {
            description: `ID ${existingId}. Peça ao membro para terminar sessão e entrar de novo (${String(s.email || '').toLowerCase()}).`,
          });
          return;
        }
      } catch {
        /* tenta recriar */
      }
    }

    const ok = await confirmDialog(
      `Recriar ficha de membro para «${s.name}» (${s.email})?\n\nUse só se o cadastro está aprovado mas a pessoa não consegue entrar (ficha em falta).`,
    );
    if (!ok) return;

    setBusyId(s.id);
    try {
      const now = Date.now();
      const emailNorm = String(s.email || '').trim().toLowerCase();

      const linkedId = await findMemberIdByEmail(emailNorm);
      if (linkedId) {
        await updateDoc(doc(db, 'member_signups', s.id), {
          statusSignup: 'aprovado',
          memberId: linkedId,
          approvedBy: (s as any).approvedBy || user?.email || '',
          approvedAt: (s as any).approvedAt || now,
        });
        toast.success(`Já existia ficha com este email — pedido ligado ao membro ${linkedId}.`);
        void logAudit('signup.relink_member', `member_signups/${s.id}`, user?.email || '', `memberId=${linkedId}`);
        await load();
        return;
      }

      const member = await buildMemberPayload(s);
      const ref = await addDoc(collection(db, 'members'), member);
      await attachPhotoIfAny(ref.id, (s as any).photoBase64);
      await updateDoc(doc(db, 'member_signups', s.id), {
        statusSignup: 'aprovado',
        memberId: ref.id,
        approvedBy: (s as any).approvedBy || user?.email || '',
        approvedAt: (s as any).approvedAt || now,
        recreatedAt: now,
      });
      toast.success(`Ficha recriada para «${s.name}». Peça ao membro para entrar de novo.`);
      void logAudit('signup.recreate_member', `member_signups/${s.id}`, user?.email || '', `memberId=${ref.id}`);
      await load();
    } catch (e: any) {
      toast.error('Falha ao recriar ficha: ' + (e?.message || 'erro desconhecido'));
      console.error('recreateMember:', e);
    } finally {
      setBusyId(null);
    }
  };

  const doReject = async () => {
    if (!rejecting) return;
    const s = rejecting;
    setBusyId(s.id);
    try {
      const now = Date.now();
      await updateDoc(doc(db, 'member_signups', s.id), {
        statusSignup: 'rejeitado', reason: reason.trim() || null,
        rejectedBy: user?.email || '', rejectedAt: now,
      });
      await addDoc(collection(db, 'notifications'), {
        userEmail: String(s.email || '').trim().toLowerCase(), kind: 'signup_rejected',
        title: 'Cadastro não aprovado',
        body: `O seu cadastro na app da igreja não foi aprovado${reason.trim() ? `: ${reason.trim()}` : ''}. Contacte a secretaria para mais informações.`,
        read: false, createdAt: now, refId: s.id,
      }).catch(() => {});
      toast.success(`Cadastro de «${s.name}» rejeitado.`);
      void logAudit('signup.rejected', `member_signups/${s.id}`, user?.email || '', reason.trim() || undefined);
      setRejecting(null); setReason('');
      await load();
    } catch (e) {
      toast.error('Falha ao rejeitar: ' + (e?.message || 'erro desconhecido'));
      console.error('reject signup:', e);
    } finally {
      setBusyId(null);
    }
  };

  const deleteSignup = async (s: MemberSignup) => {
    const ok = await confirmDialog(
      `APAGAR DEFINITIVAMENTE a conta e o pedido de «${s.name}» (${s.email})?\n\nA conta de autenticação é removida (o email fica livre para um novo cadastro) e o pedido sai da lista. Não há recuperação.`,
      'APAGAR');
    if (!ok) return;
    setBusyId(s.id);
    try {
      await deleteSignupAccount(s.id);
      void logAudit('signup.deleted', `member_signups/${s.id}`, user?.email || '', `name=${s.name}`);
      toast.success('Conta e pedido apagados — o email ficou livre.');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao apagar a conta.');
    } finally {
      setBusyId(null);
    }
  };

  const shown = list.filter((s) => s.statusSignup === filter);
  const counts = {
    pendente: list.filter((s) => s.statusSignup === 'pendente').length,
    rejeitado: list.filter((s) => s.statusSignup === 'rejeitado').length,
    aprovado: list.filter((s) => s.statusSignup === 'aprovado').length,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><UserPlus className="h-4 w-4" /> Cadastros pendentes</CardTitle>
        <CardDescription>
          Aprove pedidos de auto-cadastro. Só após criar a ficha de membro o pedido fica «aprovado».
          Se alguém estiver aprovado e não conseguir entrar, use «Recriar ficha».
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-1">
          {(['pendente', 'aprovado', 'rejeitado'] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
              {f === 'pendente' ? 'Pendentes' : f === 'aprovado' ? 'Aprovados' : 'Rejeitados'}
              <Badge variant="secondary" className="ml-1.5">{counts[f]}</Badge>
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {loadError}
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void load()}>Tentar novamente</Button>
          </div>
        )}
        {loading && !list.length ? (
          <p className="text-center text-muted-foreground py-8 text-sm">A carregar…</p>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-40" />
            <p className="text-sm">Nenhum registo neste filtro.</p>
          </div>
        ) : (
          shown.map((s) => (
            <div key={s.id} className={`rounded-lg border p-3 space-y-2 ${s.statusSignup === 'pendente' ? 'border-amber-300/70 bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                  <p className="text-[11px] text-muted-foreground">Pedido em {fmtCreated(s.createdAt || 0)}</p>
                  {s.statusSignup === 'rejeitado' && s.reason && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400"><b>Motivo:</b> {s.reason}</p>
                  )}
                  {s.statusSignup === 'aprovado' && (
                    <p className="mt-1 text-[11px] text-emerald-600">
                      Aprovado por {(s as any).approvedBy}{' '}
                      {(s as any).approvedAt ? `em ${fmtDatePT(luandaDayKey((s as any).approvedAt))}` : ''}
                      {(s as any).memberId ? ` · ficha ${(s as any).memberId}` : ' · sem memberId'}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setExpanded(expanded === s.id ? null : s.id)} title="Ver todos os dados">
                  {expanded === s.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              {expanded === s.id && (
                <div className="rounded-md border bg-background p-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                  {SIGNUP_MEMBER_FIELDS.filter((k) => k !== 'photoBase64' && (s as any)[k] !== undefined && (s as any)[k] !== null && (s as any)[k] !== '').map((k) => (
                    <p key={k}><span className="font-semibold">{LABELS[k] || k}:</span> {String((s as any)[k])}</p>
                  ))}
                  <p><span className="font-semibold">Aceita SMS/WA:</span> {s.acceptsMessages !== false ? 'sim' : 'não'}</p>
                </div>
              )}

              {s.statusSignup !== 'aprovado' && (
                <div className="flex flex-wrap gap-2 border-t pt-2">
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busyId === s.id} onClick={() => void approve(s)}>
                    {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Aprovar
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40" disabled={busyId === s.id}
                    onClick={() => { setRejecting(s); setReason(s.statusSignup === 'rejeitado' ? (s.reason || '') : ''); }}>
                    <UserX className="h-3.5 w-3.5" /> Rejeitar
                  </Button>
                  {s.statusSignup === 'rejeitado' && (
                    <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" disabled={busyId === s.id} onClick={() => void deleteSignup(s)}>
                      <Trash2 className="h-3.5 w-3.5" /> Apagar conta e pedido
                    </Button>
                  )}
                </div>
              )}

              {s.statusSignup === 'aprovado' && (
                <div className="flex flex-wrap gap-2 border-t pt-2">
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={busyId === s.id} onClick={() => void recreateMember(s)}>
                    {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Recriar ficha de membro
                  </Button>
                </div>
              )}
            </div>
          ))
        )}

        {rejecting && (
          <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-2">
            <Label className="text-xs font-bold text-red-700 dark:text-red-300">Rejeitar «{rejecting.name}»</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo (opcional — o membro vê esta mensagem ao tentar entrar)"
              maxLength={280}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={busyId === rejecting.id} onClick={() => void doReject()}>
                {busyId === rejecting.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Confirmar rejeição
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setRejecting(null); setReason(''); }}>Cancelar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
