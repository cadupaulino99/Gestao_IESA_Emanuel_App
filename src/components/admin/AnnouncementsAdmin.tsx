import { useEffect, useState, type ReactNode } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Bell, BellOff, Pencil, Trash2, Pin, ArchiveRestore, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { logAudit } from '../../lib/audit';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { moveToTrash } from '../../lib/trash';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import RichTextEditor from '../richtext/RichTextEditor';
import RichTextView from '../richtext/RichTextView';
import {
  normalizeAnnouncement, isAnnouncementExpired, plainOf, boardLabels,
  publishBoardNotification, type NormalizedAnnouncement,
} from '../../lib/board';
import { validateRichText, hasDangerousPattern } from '../../lib/richtext';
import { luandaDayKey, fmtDatePT } from '../../lib/luanda';

const EMPTY = { title: '', html: '', level: 'normal' as 'normal' | 'urgente', pinned: false, visibleUntil: '', alsoSms: false };

/**
 * Administração dos AVISOS (colecção `announcements` — a mesma que o Portal
 * do Membro lê; fonte única, sem cópias). Rascunhos só aqui; «visível até»
 * passado ⇒ arquivo com republicação. Nada é apagado automaticamente.
 */
export default function AnnouncementsAdmin() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const [list, setList] = useState<NormalizedAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<NormalizedAnnouncement | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const load = async () => {
    try {
      const snap = await getDocs(collection(db, 'announcements'));
      setList(snap.docs.map((d) => normalizeAnnouncement({ id: d.id, ...d.data() })));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'announcements');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const dayKey = luandaDayKey();
  const startEdit = (a: NormalizedAnnouncement) => {
    setEditing(a);
    setForm({
      title: a.title, html: a.contentHtml || a.html, level: a.level,
      pinned: a.pinned, visibleUntil: a.visibleUntil || '', alsoSms: false,
    });
  };
  const reset = () => { setEditing(null); setForm({ ...EMPTY }); };

  const save = async (status: 'rascunho' | 'publicado') => {
    if (!form.title.trim()) { toast.error('O título é obrigatório.'); return; }
    const err = validateRichText(form.html);
    if (err || !plainOf(form.html)) { toast.error(err || 'O texto do aviso está vazio.'); return; }
    if (hasDangerousPattern(form.html)) { toast.error('Conteúdo recusado por segurança (script/estilo/handler).'); return; }
    const email = user?.email || 'unknown';
    const now = Date.now();
    const data = {
      title: form.title.trim(),
      content: plainOf(form.html, 1000),          // espelho legado (texto simples)
      contentHtml: form.html,
      level: form.level,
      pinned: form.pinned,
      visibleUntil: form.visibleUntil || null,
      status,
      active: status === 'publicado',              // espelho legado
      updatedBy: email,
      updatedAt: now,
    };
    setSaving(true);
    try {
      let id = editing?.id || '';
      const wasPublished = editing?.status === 'publicado';
      if (editing) {
        await updateDoc(doc(db, 'announcements', editing.id), data);
      } else {
        const ref = await addDoc(collection(db, 'announcements'), { ...data, createdAt: now, createdBy: email, adminId: user?.uid || '' });
        id = ref.id;
      }
      if (status === 'publicado' && !wasPublished) {
        const a = normalizeAnnouncement({ ...data, id });
        const r = await publishBoardNotification({
          kind: 'aviso', label: boardLabels.newAnnouncement(a), refId: id,
          alsoSms: form.alsoSms, byEmail: email,
        });
        toast.success(`Aviso publicado — ${r.notified} membro(s) notificado(s)${r.smsQueued ? ` · ${r.smsQueued} na fila SMS/WhatsApp` : ''}.`);
        void logAudit('announcement.published', `announcements/${id}`, email, form.title.trim());
      } else {
        toast.success(status === 'rascunho' ? 'Rascunho gravado (os membros não o vêem).' : 'Aviso actualizado.');
        void logAudit(status === 'rascunho' ? 'announcement.draft' : 'announcement.updated', `announcements/${editing!.id}`, email, form.title.trim());
      }
      reset();
      await load();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'announcements');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (a: NormalizedAnnouncement, status: 'publicado' | 'arquivado') => {
    try {
      await updateDoc(doc(db, 'announcements', a.id), {
        status, active: status === 'publicado',
        updatedBy: user?.email || '', updatedAt: Date.now(),
      });
      if (status === 'publicado' && a.status !== 'publicado') {
        const r = await publishBoardNotification({
          kind: 'aviso', label: boardLabels.newAnnouncement(a), refId: a.id, alsoSms: false, byEmail: user?.email || '',
        });
        toast.success(`Republicado — ${r.notified} membro(s) notificado(s).`);
        void logAudit('announcement.republished', `announcements/${a.id}`, user?.email || '', a.title);
      } else {
        toast.success(status === 'publicado' ? 'Aviso republicado.' : 'Aviso arquivado (deixa de aparecer aos membros).');
        void logAudit(status === 'publicado' ? 'announcement.republished' : 'announcement.archived', `announcements/${a.id}`, user?.email || '', a.title);
      }
      await load();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `announcements/${a.id}`);
    }
  };

  const republishExpired = async (a: NormalizedAnnouncement) => {
    try {
      await updateDoc(doc(db, 'announcements', a.id), {
        visibleUntil: null, status: 'publicado', active: true,
        updatedBy: user?.email || '', updatedAt: Date.now(),
      });
      const r = await publishBoardNotification({
        kind: 'aviso', label: boardLabels.newAnnouncement(a), refId: a.id, alsoSms: false, byEmail: user?.email || '',
      });
      toast.success(`Republicado sem prazo — ${r.notified} membro(s) notificado(s).`);
      void logAudit('announcement.republished', `announcements/${a.id}`, user?.email || '', `${a.title} (sem prazo)`);
      await load();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `announcements/${a.id}`);
    }
  };

  const remove = async (a: NormalizedAnnouncement) => {
    const ok = await confirmDialog(`Apagar o aviso «${a.title}»? Vai para a Lixeira (recuperável).`, 'APAGAR');
    if (!ok) return;
    try {
      await moveToTrash('announcements', a.id, user?.email || 'unknown');
      toast.success('Aviso movido para a Lixeira.');
      void logAudit('announcement.trashed', `announcements/${a.id}`, user?.email || '', a.title);
      if (editing?.id === a.id) reset();
      await load();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `announcements/${a.id}`);
    }
  };

  const published = list.filter((a) => a.status === 'publicado' && !isAnnouncementExpired(a, dayKey));
  const drafts = list.filter((a) => a.status === 'rascunho');
  const archive = list.filter((a) => a.status === 'arquivado' || isAnnouncementExpired(a, dayKey));
  const byNew = (l: NormalizedAnnouncement[]) => [...l].sort((x, y) => (y.updatedAt || y.createdAt || 0) - (x.updatedAt || x.createdAt || 0));

  const audit = (a: NormalizedAnnouncement) => (
    <p className="mt-1 text-[10px] text-slate-400">
      Criado por {a.createdBy || a.adminId || '—'}{(a.updatedBy && a.updatedAt) ? ` · editado por ${a.updatedBy} em ${fmtDatePT(new Date(a.updatedAt).toISOString().slice(0, 10))}` : ''}
    </p>
  );

  const Item = ({ a, extra }: { a: NormalizedAnnouncement; extra?: ReactNode }) => (
    <div className="rounded-lg border p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="text-sm font-bold truncate">{a.title}</h4>
            {a.pinned && <Badge variant="secondary" className="text-[9px] gap-0.5"><Pin className="h-2.5 w-2.5" /> Fixado</Badge>}
            {a.level === 'urgente' && <Badge className="bg-red-600 text-[9px]">URGENTE</Badge>}
            {isAnnouncementExpired(a, dayKey) && <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-400">Expirado (visível até {fmtDatePT(a.visibleUntil)})</Badge>}
          </div>
          <RichTextView html={a.html} className="text-xs text-muted-foreground line-clamp-3 mt-0.5" />
          {audit(a)}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => startEdit(a)}><Pencil className="h-3 w-3" /> Editar</Button>
          {extra}
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive" onClick={() => remove(a)}><Trash2 className="h-3 w-3" /> Apagar</Button>
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> Avisos</CardTitle>
        <CardDescription>
          Fonte única: o que publicar aqui aparece no Portal do Membro → «Avisos, Agenda e Eventos».
          Rascunhos e expirados só a liderança vê.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── formulário ── */}
        <div className="space-y-3 rounded-lg border bg-slate-50 dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wide">{editing ? 'Editar aviso' : 'Novo aviso'}</Label>
            {editing && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={reset}>Cancelar edição</Button>}
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Título</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Jejum nacional de oração" maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Texto (formatação permitida; sem scripts nem estilos)</Label>
            <RichTextEditor value={form.html} onChange={(html) => setForm({ ...form, html })} placeholder="Detalhes do aviso…" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Nível</Label>
              <Select value={form.level} onValueChange={(v: any) => setForm({ ...form, level: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgente">Urgente (destaque)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Visível até (opcional)</Label>
              <Input type="date" className="h-8 text-xs" value={form.visibleUntil} onChange={(e) => setForm({ ...form, visibleUntil: e.target.value })} />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch id="ann-pin" checked={form.pinned} onCheckedChange={(v) => setForm({ ...form, pinned: v })} />
              <Label htmlFor="ann-pin" className="text-[11px]">Fixar no topo</Label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={form.alsoSms} onChange={(e) => setForm({ ...form, alsoSms: e.target.checked })} className="h-3.5 w-3.5" />
            Enviar também por SMS/WhatsApp (fila existente: janela de 10 min, máx. 1/dia por membro, modo manual)
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={saving} onClick={() => save('rascunho')} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />} Gravar rascunho
            </Button>
            <Button size="sm" disabled={saving} onClick={() => save('publicado')} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
              {editing?.status === 'publicado' ? 'Guardar alterações' : 'Publicar e notificar'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
        ) : (
          <>
            <section className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Publicados ({published.length})</h5>
              {byNew(published).map((a) => (
                <Item key={a.id} a={a} extra={
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setStatus(a, 'arquivado')}><ArchiveRestore className="h-3 w-3" /> Arquivar</Button>
                } />
              ))}
              {published.length === 0 && <p className="text-xs text-muted-foreground border rounded-md p-2 text-center">Nenhum aviso publicado.</p>}
            </section>
            <section className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Rascunhos ({drafts.length})</h5>
              {byNew(drafts).map((a) => <Item key={a.id} a={a} />)}
            </section>
            <section className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wide text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Arquivo — expirados e ocultados ({archive.length})</h5>
              {byNew(archive).map((a) => (
                <Item key={a.id} a={a} extra={
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => isAnnouncementExpired(a, dayKey) ? republishExpired(a) : setStatus(a, 'publicado')}>
                    <ArchiveRestore className="h-3 w-3" /> Republicar
                  </Button>
                } />
              ))}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
