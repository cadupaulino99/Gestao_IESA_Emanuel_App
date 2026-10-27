import { useEffect, useRef, useState, type ReactNode } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { CalendarPlus, Pencil, Trash2, Loader2, ImagePlus, MapPin, Clock, UserRound } from 'lucide-react';
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
import {
  normalizeEvent, isEventPast, eventChangesForNotification, plainOf, boardLabels,
  publishBoardNotification, type NormalizedEvent,
} from '../../lib/board';
import { validateRichText, hasDangerousPattern } from '../../lib/richtext';
import { luandaDayKey, fmtDateTimePT, fmtDatePT, isDateIso, isTimeHHMM } from '../../lib/luanda';
import { uploadEventPoster, deleteEventPoster, posterUrl, validatePosterFile } from '../../lib/posters';

const EMPTY = {
  title: '', html: '', date: '', time: '', dateEnd: '', timeEnd: '',
  location: '', responsible: '', status: 'marcado', reminder1d: false, alsoSms: false,
};

const STATUS_LABEL: Record<string, string> = { marcado: 'Marcado', adiado: 'Adiado', cancelado: 'Cancelado', realizado: 'Realizado' };
const STATUS_CLASS: Record<string, string> = {
  marcado: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  adiado: 'bg-amber-100 text-amber-800 border-amber-300',
  cancelado: 'bg-red-100 text-red-700 border-red-300',
  realizado: 'bg-slate-200 text-slate-600 border-slate-300',
};

/** Miniatura do cartaz (carrega o URL do Storage em fundo; exige sessão). */
function PosterThumb({ path, className = 'h-14 w-10' }: { path?: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (path) posterUrl(path).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
  }, [path]);
  if (!path || !url) return null;
  return <img src={url} alt="Cartaz do evento" className={`${className} rounded border object-cover`} />;
}

/**
 * Administração de EVENTOS (colecção `events` — a mesma do Dashboard e do
 * Portal do Membro; fonte única). Cartazes como FICHEIROS no Storage
 * (caminho no documento, nunca base64). Datas/horas são strings locais de
 * Luanda ('AAAA-MM-DD'/'HH:MM') — não deslocam entre aparelhos.
 */
export default function EventsAdmin() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const [list, setList] = useState<NormalizedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<NormalizedEvent | null>(null);
  const [form, setForm] = useState<any>({ ...EMPTY });
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [removePoster, setRemovePoster] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const snap = await getDocs(collection(db, 'events'));
      setList(snap.docs.map((d) => normalizeEvent({ id: d.id, ...d.data() })));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'events');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const reset = () => {
    setEditing(null); setForm({ ...EMPTY });
    if (posterPreview) URL.revokeObjectURL(posterPreview);
    setPosterFile(null); setPosterPreview(null); setRemovePoster(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const startEdit = (e: NormalizedEvent) => {
    setEditing(e);
    setForm({
      title: e.title, html: e.descriptionHtml || e.html, date: e.date || '', time: e.time || '',
      dateEnd: e.dateEnd || '', timeEnd: e.timeEnd || '', location: e.location, responsible: e.responsible,
      status: e.status, reminder1d: e.reminder1d === true, alsoSms: false,
      publishStatus: e.publishStatus,
    });
    setRemovePoster(false); setPosterFile(null); setPosterPreview(null);
  };

  const pickPoster = (f: File | null) => {
    if (!f) return;
    const err = validatePosterFile(f);
    if (err) { toast.error(err); return; }
    if (posterPreview) URL.revokeObjectURL(posterPreview);
    setPosterFile(f);
    setPosterPreview(URL.createObjectURL(f));
    setRemovePoster(false);
  };

  /** Grava (rascunho ou publicado). Notifica quando há publicação/alteração relevante. */
  const save = async (publishStatus: 'rascunho' | 'publicado') => {
    if (!form.title.trim()) { toast.error('O título é obrigatório.'); return; }
    if (!isDateIso(form.date)) { toast.error('Data de início obrigatória (AAAA-MM-DD).'); return; }
    if (form.time && !isTimeHHMM(form.time)) { toast.error('Hora de início inválida (HH:MM).'); return; }
    if (form.dateEnd && !isDateIso(form.dateEnd)) { toast.error('Data de fim inválida.'); return; }
    if (form.timeEnd && !isTimeHHMM(form.timeEnd)) { toast.error('Hora de fim inválida (HH:MM).'); return; }
    if (form.html) {
      const err = validateRichText(form.html);
      if (err || hasDangerousPattern(form.html)) { toast.error(err || 'Conteúdo recusado por segurança.'); return; }
    }
    const email = user?.email || 'unknown';
    const now = Date.now();
    setSaving(true);
    try {
      let id = editing?.id || '';
      const data: any = {
        title: form.title.trim(),
        descriptionHtml: form.html || '',
        description: plainOf(form.html || '', 200),   // espelho legado (Dashboard)
        date: form.date, time: form.time || '',
        dateEnd: form.dateEnd || null, timeEnd: form.timeEnd || null,
        location: form.location.trim(), responsible: form.responsible.trim(),
        status: form.status, publishStatus,
        reminder1d: form.reminder1d === true,
        updatedBy: email, updatedAt: now,
      };
      if (editing) {
        await updateDoc(doc(db, 'events', editing.id), data);
      } else {
        const ref = await addDoc(collection(db, 'events'), { ...data, createdAt: now, createdBy: email });
        id = ref.id;
      }

      // cartaz: enviar ficheiro novo / remover o antigo (Storage; caminho no doc)
      if (posterFile) {
        const up = await uploadEventPoster(id, posterFile);
        const old = editing ? [editing.posterPath, editing.posterThumbPath] : [];
        await updateDoc(doc(db, 'events', id), { ...up });
        await deleteEventPoster(old);
      } else if (removePoster && editing?.posterPath) {
        await updateDoc(doc(db, 'events', id), { posterPath: null, posterThumbPath: null });
        await deleteEventPoster([editing.posterPath, editing.posterThumbPath]);
      }

      // notificações (só do que está publicado)
      if (publishStatus === 'publicado') {
        const after = normalizeEvent({ ...data, id });
        if (!editing) {
          const r = await publishBoardNotification({
            kind: 'evento', label: boardLabels.newEvent(after), refId: id,
            alsoSms: form.alsoSms, byEmail: email,
          });
          toast.success(`Evento publicado — ${r.notified} membro(s) notificado(s)${r.smsQueued ? ` · ${r.smsQueued} na fila SMS/WhatsApp` : ''}.`);
          void logAudit('event.published', `events/${id}`, email, form.title.trim());
        } else {
          const what = eventChangesForNotification(editing, { ...data, id });
          if (what) {
            const r = await publishBoardNotification({
              kind: 'evento_change', label: boardLabels.eventChanged(after, what), refId: id,
              alsoSms: form.alsoSms, byEmail: email,
            });
            toast.success(`Evento actualizado — ${r.notified} membro(s) notificado(s) da alteração.`);
            void logAudit('event.changed', `events/${id}`, email, what || '');
          } else if (editing.publishStatus === 'rascunho') {
            const r = await publishBoardNotification({
              kind: 'evento', label: boardLabels.newEvent(after), refId: id, alsoSms: form.alsoSms, byEmail: email,
            });
            toast.success(`Evento publicado — ${r.notified} membro(s) notificado(s).`);
            void logAudit('event.published', `events/${id}`, email, form.title.trim());
          } else {
            toast.success('Evento actualizado.');
            void logAudit('event.updated', `events/${id}`, email, form.title.trim());
          }
        }
      } else {
        toast.success('Rascunho gravado (os membros não o vêem).');
      }
      reset();
      await load();
    } catch (e: any) {
      toast.error(e?.message ? String(e.message) : '');
      handleFirestoreError(e, OperationType.WRITE, 'events');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: NormalizedEvent, permanent: boolean) => {
    const ok = await confirmDialog(
      permanent
        ? `APAGAR DEFINITIVAMENTE «${e.title}»? Não vai para a Lixeira — não pode ser recuperado.`
        : `Apagar «${e.title}»? Vai para a Lixeira (recuperável).`,
      'APAGAR');
    if (!ok) return;
    try {
      if (permanent) {
        await deleteEventPoster([e.posterPath, e.posterThumbPath]);
        await deleteDoc(doc(db, 'events', e.id));
        toast.success('Evento apagado definitivamente.');
        void logAudit('event.deleted-permanent', `events/${e.id}`, user?.email || '', e.title);
      } else {
        await moveToTrash('events', e.id, user?.email || 'unknown');
        toast.success('Evento movido para a Lixeira.');
        void logAudit('event.trashed', `events/${e.id}`, user?.email || '', e.title);
      }
      if (editing?.id === e.id) reset();
      await load();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `events/${e.id}`);
    }
  };

  const dayKey = luandaDayKey();
  const upcoming = list.filter((e) => e.publishStatus === 'publicado' && !isEventPast(e, dayKey));
  const drafts = list.filter((e) => e.publishStatus === 'rascunho');
  const past = list.filter((e) => e.publishStatus === 'publicado' && isEventPast(e, dayKey));
  const byDate = (l: NormalizedEvent[]) => [...l].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || '')));

  const Item = ({ e, section }: { e: NormalizedEvent; section: 'up' | 'draft' | 'past'; key?: string | number }) => (
    <div className={`rounded-lg border p-3 flex gap-3 ${e.status === 'cancelado' ? 'border-red-300 bg-red-50/40 dark:bg-red-950/20' : ''}`}>
      <PosterThumb path={e.posterThumbPath || e.posterPath} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h4 className="text-sm font-bold truncate">{e.title}</h4>
          <Badge variant="outline" className={`text-[9px] ${STATUS_CLASS[e.status] || ''}`}>{STATUS_LABEL[e.status] || e.status}</Badge>
          {section === 'draft' && <Badge variant="secondary" className="text-[9px]">Rascunho</Badge>}
          {e.reminder1d && <Badge variant="outline" className="text-[9px]">Lembrete 1 dia antes</Badge>}
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> {fmtDateTimePT(e.date, e.time)}{e.dateEnd ? ` → ${fmtDateTimePT(e.dateEnd, e.timeEnd)}` : ''}</p>
        {e.location && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {e.location}</p>}
        {e.responsible && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><UserRound className="h-3 w-3" /> {e.responsible}</p>}
        {(e.createdBy || e.updatedBy) && (
          <p className="text-[10px] text-slate-400 mt-0.5">
            {e.createdBy ? `Criado por ${e.createdBy}` : ''}{e.updatedBy ? ` · editado por ${e.updatedBy}` : ''}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => startEdit(e)}><Pencil className="h-3 w-3" /> Editar</Button>
        {section === 'past' ? (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive" onClick={() => remove(e, true)}><Trash2 className="h-3 w-3" /> Apagar (definitivo)</Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive" onClick={() => remove(e, false)}><Trash2 className="h-3 w-3" /> Apagar</Button>
        )}
      </div>
    </div>
  );

  const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="space-y-1"><Label className="text-[11px]">{label}</Label>{children}</div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarPlus className="h-4 w-4" /> Eventos</CardTitle>
        <CardDescription>
          Atividades com data própria. Estados: marcado, adiado, cancelado, realizado.
          Cartaz opcional (JPG/PNG/WEBP até 10 MB — comprimido a 1600 px e guardado como ficheiro).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── formulário ── */}
        <div className="space-y-3 rounded-lg border bg-blue-50/40 dark:bg-blue-950/20 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wide">{editing ? 'Editar evento' : 'Novo evento'}</Label>
            {editing && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={reset}>Cancelar edição</Button>}
          </div>
          <Field label="Título">
            <Input className="h-8 text-xs" value={form.title} onChange={(ev) => setForm({ ...form, title: ev.target.value })} placeholder="Ex.: Conferência de Jovens" maxLength={200} />
          </Field>
          <Field label="Descrição (texto formatado)">
            <RichTextEditor value={form.html} onChange={(html) => setForm({ ...form, html })} placeholder="Programa, oradores, o que levar…" minHeight={90} />
          </Field>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Data de início *">
              <Input type="date" className="h-8 text-xs" value={form.date} onChange={(ev) => setForm({ ...form, date: ev.target.value })} />
            </Field>
            <Field label="Hora de início">
              <Input type="time" className="h-8 text-xs" value={form.time} onChange={(ev) => setForm({ ...form, time: ev.target.value })} />
            </Field>
            <Field label="Data de fim (opcional)">
              <Input type="date" className="h-8 text-xs" value={form.dateEnd} onChange={(ev) => setForm({ ...form, dateEnd: ev.target.value })} />
            </Field>
            <Field label="Hora de fim (opcional)">
              <Input type="time" className="h-8 text-xs" value={form.timeEnd} onChange={(ev) => setForm({ ...form, timeEnd: ev.target.value })} />
            </Field>
            <Field label="Local">
              <Input className="h-8 text-xs" value={form.location} onChange={(ev) => setForm({ ...form, location: ev.target.value })} placeholder="Ex.: Templo de Xangongo" maxLength={140} />
            </Field>
            <Field label="Responsável (opcional)">
              <Input className="h-8 text-xs" value={form.responsible} onChange={(ev) => setForm({ ...form, responsible: ev.target.value })} maxLength={140} />
            </Field>
            <Field label="Estado">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="marcado">Marcado</SelectItem>
                  <SelectItem value="adiado">Adiado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                  <SelectItem value="realizado">Realizado</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end gap-2 pb-1.5">
              <Switch id="ev-reminder" checked={form.reminder1d} onCheckedChange={(v) => setForm({ ...form, reminder1d: v })} />
              <Label htmlFor="ev-reminder" className="text-[11px]">Lembrete 1 dia antes (no sistema)</Label>
            </div>
          </div>
          {/* cartaz */}
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(ev) => pickPoster(ev.target.files?.[0] || null)} />
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5" /> {posterPreview || editing?.posterPath ? 'Substituir cartaz' : 'Carregar cartaz (opcional)'}
            </Button>
            {posterPreview && <img src={posterPreview} alt="Pré-visualização do cartaz" className="h-16 w-12 rounded border object-cover" />}
            {!posterPreview && editing?.posterPath && !removePoster && <PosterThumb path={editing.posterThumbPath || editing.posterPath} className="h-16 w-12" />}
            {(posterPreview || (editing?.posterPath && !removePoster)) && (
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-destructive"
                onClick={() => { setRemovePoster(true); setPosterFile(null); if (posterPreview) URL.revokeObjectURL(posterPreview); setPosterPreview(null); if (fileRef.current) fileRef.current.value = ''; }}>
                Remover cartaz
              </Button>
            )}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={form.alsoSms} onChange={(ev) => setForm({ ...form, alsoSms: ev.target.checked })} className="h-3.5 w-3.5" />
            Enviar também por SMS/WhatsApp (fila existente; máx. 1/dia por membro)
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={saving} onClick={() => save('rascunho')} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />} Gravar rascunho
            </Button>
            <Button size="sm" disabled={saving} onClick={() => save('publicado')} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
              {editing?.publishStatus === 'publicado' ? 'Guardar e notificar alterações' : 'Publicar e notificar'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
        ) : (
          <>
            <section className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Próximos ({upcoming.length})</h5>
              {byDate(upcoming).map((e) => <Item key={e.id} e={e} section="up" />)}
              {upcoming.length === 0 && <p className="text-xs text-muted-foreground border rounded-md p-2 text-center">Sem eventos próximos publicados.</p>}
            </section>
            <section className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Rascunhos ({drafts.length})</h5>
              {byDate(drafts).map((e) => <Item key={e.id} e={e} section="draft" />)}
            </section>
            <section className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Histórico ({past.length})</h5>
              {byDate(past).reverse().map((e) => <Item key={e.id} e={e} section="past" />)}
              {past.length === 0 && <p className="text-xs text-muted-foreground border rounded-md p-2 text-center">Sem eventos passados.</p>}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
