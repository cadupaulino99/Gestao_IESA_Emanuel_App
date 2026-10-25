import { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, UserPlus, UserX, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { nextInternalCode } from '../../lib/members';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { MemberSignup } from '../../types';
import { SIGNUP_MEMBER_FIELDS } from '../../lib/memberSchema';
import { fmtDatePT, luandaDayKey } from '../../lib/luanda';

/** Epoch → «dd/mm/aaaa às HH:MM» de Luanda (UTC+1, critério do resto da app). */
const fmtCreated = (ms: number) => {
  const iso = new Date(Number(ms || 0) + 3600000).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} às ${iso.slice(11, 16)}`;
};

/* ═══════════════════════════════════════════════════════════════════════
   v1.14.0 — «CADASTROS PENDENTES» (Admin)
   Lista os auto-cadastros (member_signups) com todos os dados enviados e
   as ações APROVAR / REJEITAR (motivo opcional).
   Permissões: o ecrã só aparece ao perfil 'admin' (Admin.tsx) e o
   SERVIDOR confirma — firestore.rules: update de member_signups só
   isAdmin(); create de members só liderança. Esconder o botão não chega.
   ═══════════════════════════════════════════════════════════════════════ */

const LABELS: Record<string, string> = {
  documentNumber: 'B.I.', phone: 'Telefone', birthDate: 'Nascimento', baptismDate: 'Baptismo',
  gender: 'Género', maritalStatus: 'Estado civil', spouseName: 'Cônjuge', fatherName: 'Pai',
  motherName: 'Mãe', placeOfBirth: 'Naturalidade', address: 'Morada', education: 'Formação',
  profession: 'Profissão', groupCell: 'Célula/Grupo', memberNumber: 'Nº cartão',
};

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
      /* v1.14.2: erro VISÍVEL — antes o handleFirestoreError só relançava um
         JSON para a consola e a lista ficava vazia sem explicação
         («não apareceu nada»). */
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
  useEffect(() => { void load(); }, []);

  if (userRole !== 'admin') {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Ecrã reservado ao perfil de administrador.
        </CardContent>
      </Card>
    );
  }

  const approve = async (s: MemberSignup) => {
    const ok = await confirmDialog(
      `Aprovar o cadastro de «${s.name}» (${s.email})?\n\nEntrará na lista oficial de membros como Activo e, no primeiro login, terá de definir a palavra-passe definitiva.`,
    );
    if (!ok) return;
    setBusyId(s.id);
    try {
      const now = Date.now();
      const internalCode = await nextInternalCode();
      const member: Record<string, unknown> = {
        name: s.name,
        email: s.email,
        memberEmail: s.email,          // regras isOwnMemberDoc (leitura do próprio)
        status: 'Activo',
        internalCode,
        mustChangePassword: true,      // 1.º login → troca obrigatória
        acceptsMessages: s.acceptsMessages !== false,
        signupId: s.id,
        createdAt: now,
        updatedAt: now,
      };
      for (const k of SIGNUP_MEMBER_FIELDS) {
        const v = (s as any)[k];
        if (v !== undefined && v !== null && v !== '') member[k] = v;
      }
      const ref = await addDoc(collection(db, 'members'), member);
      await updateDoc(doc(db, 'member_signups', s.id), {
        statusSignup: 'aprovado', approvedBy: user?.email || '', approvedAt: now, memberId: ref.id,
      });
      await addDoc(collection(db, 'notifications'), {
        userEmail: s.email, kind: 'signup_approved',
        title: 'Cadastro aprovado — bem-vindo(a)!',
        body: `Paz, ${s.name}. O seu cadastro foi aprovado. Inicie sessão com o seu email; antes de entrar, defina a sua palavra-passe definitiva. Mal. 3:10`,
        read: false, createdAt: now, refId: ref.id,
      }).catch(() => {});
      toast.success(`«${s.name}» aprovado — entrou na lista oficial de membros.`);
      await load();
    } catch (e) {
      toast.error('Falha ao aprovar: ' + (e?.message || 'erro desconhecido'));
      console.error('approve signup:', e);
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
        userEmail: s.email, kind: 'signup_rejected',
        title: 'Cadastro não aprovado',
        body: `O seu cadastro na app da igreja não foi aprovado${reason.trim() ? `: ${reason.trim()}` : ''}. Contacte a secretaria para mais informações.`,
        read: false, createdAt: now, refId: s.id,
      }).catch(() => {});
      toast.success(`Cadastro de «${s.name}» rejeitado.`);
      setRejecting(null); setReason('');
      await load();
    } catch (e) {
      toast.error('Falha ao rejeitar: ' + (e?.message || 'erro desconhecido'));
      console.error('reject signup:', e);
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
          Auto-cadastros recebidos pelo ecrã «Criar conta / Cadastrar-me». Aprovar cria o membro
          Activo (lista oficial) com troca obrigatória de palavra-passe no 1.º login; rejeitar
          regista o motivo (opcional) que o membro vê ao tentar entrar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
          {(['pendente', 'rejeitado', 'aprovado'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-md py-1.5 font-semibold capitalize transition-colors ${filter === f ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              {f === 'pendente' ? 'Pendentes' : f === 'rejeitado' ? 'Rejeitados' : 'Aprovados'} ({counts[f]})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
        ) : loadError ? (
          <div className="space-y-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-200">
            <p><b>Não foi possível carregar os cadastros.</b></p>
            <p className="text-xs break-all">{loadError}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>Tentar novamente</Button>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border border-dashed rounded-xl py-8 text-center">
            <Inbox className="h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-muted-foreground">
              {filter === 'pendente' ? 'Nenhum cadastro pendente.' : `Nenhum cadastro ${filter}.`}
            </p>
            {filter === 'pendente' && (
              <p className="max-w-md text-[11px] text-slate-400 leading-relaxed">
                Os cadastros feitos na app («Criar conta / Cadastrar-me») aparecem aqui
                imediatamente. Se um membro diz que se cadastrou e aqui não aparece:
                confirme a versão da app nos dois aparelhos (Definições → Versão; a dos
                cadastros é a 1.14.0 ou superior) e o servidor em
                iesa-ai.cadupaulino99.workers.dev/__health (versão 2.8.0 ou superior).
              </p>
            )}
          </div>
        ) : (
          shown.map((s) => (
            <div key={s.id} className={`rounded-lg border p-3 space-y-2 ${s.statusSignup === 'pendente' ? 'border-amber-300/70 bg-amber-50/40 dark:bg-amber-950/20' : ''}`}>
              <div className="flex items-start gap-3">
                {s.photoBase64 ? (
                  <img src={`data:image/jpeg;base64,${s.photoBase64}`} alt="" className="h-14 w-14 rounded border object-cover shrink-0" />
                ) : (
                  <div className="h-14 w-14 rounded border bg-muted flex items-center justify-center shrink-0 text-muted-foreground text-[9px]">sem foto</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                  <p className="text-[10px] text-slate-400">
                    Recebido em {fmtCreated(s.createdAt)}
                    {s.phone ? ` · ${s.phone}` : ''}{s.documentNumber ? ` · BI ${s.documentNumber}` : ''}
                  </p>
                  {s.statusSignup === 'rejeitado' && s.reason && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400"><b>Motivo:</b> {s.reason}</p>
                  )}
                  {s.statusSignup === 'aprovado' && (
                    <p className="mt-1 text-[11px] text-emerald-600">Aprovado por {s.approvedBy} {s.approvedAt ? `em ${fmtDatePT(luandaDayKey(s.approvedAt))}` : ''}</p>
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
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busyId === s.id} onClick={() => approve(s)}>
                    {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Aprovar
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40" disabled={busyId === s.id}
                    onClick={() => { setRejecting(s); setReason(s.statusSignup === 'rejeitado' ? (s.reason || '') : ''); }}>
                    <UserX className="h-3.5 w-3.5" /> Rejeitar
                  </Button>
                </div>
              )}
            </div>
          ))
        )}

        {/* motivo da rejeição (opcional) */}
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
              <Button size="sm" variant="destructive" disabled={busyId === rejecting.id} onClick={doReject}>
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
