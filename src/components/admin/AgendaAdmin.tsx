import { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { CalendarDays, Pencil, Trash2, Loader2, Ban, X } from 'lucide-react';
import { toast } from 'sonner';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
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
import { normalizeAgendaItem, } from '../../lib/board';
import { toggleCancelledDate } from '../../lib/agenda';
import { weekdayName, fmtDatePT, isDateIso, isTimeHHMM, luandaDayKey } from '../../lib/luanda';
import { AgendaItem } from '../../types';

const EMPTY = {
  title: '', weekday: '1', startTime: '', endTime: '',
  location: '', responsible: '', notes: '', ativo: true,
};

/**
 * Administração da AGENDA semanal (colecção `agenda_items`). Suspender uma
 * ocorrência = acrescentar a data a `cancelledDates`; a programação continua
 * lá (os membros vêem-na riscada com «Cancelado»).
 */
export default function AgendaAdmin() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const [list, setList] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const load = async () => {
    try {
      const snap = await getDocs(collection(db, 'agenda_items'));
      setList(snap.docs.map((d) => normalizeAgendaItem({ id: d.id, ...d.data() })));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'agenda_items');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const reset = () => { setEditing(null); setForm({ ...EMPTY }); };
  const startEdit = (i: AgendaItem) => {
    setEditing(i);
    setForm({
      title: i.title, weekday: String(i.weekday), startTime: i.startTime || '', endTime: i.endTime || '',
      location: i.location || '', responsible: i.responsible || '', notes: i.notes || '', ativo: i.ativo !== false,
    });
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('O título é obrigatório.'); return; }
    if (!isTimeHHMM(form.startTime)) { toast.error('Hora de início inválida (HH:MM).'); return; }
    if (form.endTime && !isTimeHHMM(form.endTime)) { toast.error('Hora de fim inválida (HH:MM).'); return; }
    const email = user?.email || 'unknown';
    const now = Date.now();
    const data = {
      title: form.title.trim(), weekday: Number(form.weekday),
      startTime: form.startTime, endTime: form.endTime || null,
      location: form.location.trim(), responsible: form.responsible.trim(), notes: form.notes.trim(),
      ativo: form.ativo, updatedBy: email, updatedAt: now,
      ...(editing ? {} : { cancelledDates: [], createdBy: email, createdAt: now }),
    };
    setSaving(true);
    try {
      if (editing) await updateDoc(doc(db, 'agenda_items', editing.id), data);
      else await addDoc(collection(db, 'agenda_items'), data);
      toast.success(editing ? 'Atividade actualizada.' : 'Atividade acrescentada à agenda semanal.');
      reset();
      await load();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'agenda_items');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (i: AgendaItem) => {
    const ok = await confirmDialog(`Apagar «${i.title}» da agenda? Vai para a Lixeira (recuperável).`, 'APAGAR');
    if (!ok) return;
    try {
      await moveToTrash('agenda_items', i.id, user?.email || 'unknown');
      toast.success('Atividade movida para a Lixeira.');
      if (editing?.id === i.id) reset();
      await load();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `agenda_items/${i.id}`);
    }
  };

  /** Suspender/reativar uma ocorrência concreta (sem apagar a programação). */
  const toggleCancel = async (i: AgendaItem, dateIso: string) => {
    if (!isDateIso(dateIso)) { toast.error('Data inválida.'); return; }
    try {
      const cancelledDates = toggleCancelledDate(i, dateIso);
      await updateDoc(doc(db, 'agenda_items', i.id), {
        cancelledDates, updatedBy: user?.email || '', updatedAt: Date.now(),
      });
      toast.success(cancelledDates.includes(dateIso)
        ? `Ocorrência de ${fmtDatePT(dateIso)} cancelada (os membros vêem-na riscada).`
        : `Ocorrência de ${fmtDatePT(dateIso)} reactivada.`);
      await load();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `agenda_items/${i.id}`);
    }
  };

  const grouped = Array.from({ length: 7 }, (_, idx) => ({
    weekday: idx + 1,
    items: list.filter((i) => Number(i.weekday) === idx + 1).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))),
  })).filter((g) => g.items.length > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" /> Agenda semanal</CardTitle>
        <CardDescription>
          Programação regular (cultos, ensaios, reuniões). Para suspender um dia, use «Suspender ocorrência» —
          a programação mantém-se e os membros vêem a data riscada com «Cancelado».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border bg-slate-50 dark:bg-slate-900 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wide">{editing ? 'Editar atividade' : 'Nova atividade regular'}</Label>
            {editing && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={reset}>Cancelar edição</Button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px]">Título</Label>
              <Input className="h-8 text-xs" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Culto de doutrina" maxLength={140} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Dia da semana</Label>
              <Select value={form.weekday} onValueChange={(v) => setForm({ ...form, weekday: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => <SelectItem key={d} value={String(d)}>{weekdayName(d)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Início (HH:MM)</Label>
              <Input type="time" className="h-8 text-xs" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Fim (opcional)</Label>
              <Input type="time" className="h-8 text-xs" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Local</Label>
              <Input className="h-8 text-xs" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex.: Templo" maxLength={140} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px]">Responsável (opcional)</Label>
              <Input className="h-8 text-xs" value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} maxLength={140} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Observações</Label>
            <Input className="h-8 text-xs" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={280} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Switch id="ag-ativo" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label htmlFor="ag-ativo" className="text-[11px]">Ativa (visível aos membros)</Label>
            </div>
            <Button size="sm" disabled={saving} onClick={save} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
              {editing ? 'Guardar alterações' : 'Acrescentar à agenda'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
        ) : grouped.length === 0 ? (
          <p className="text-xs text-muted-foreground border rounded-md p-3 text-center">A agenda semanal está vazia.</p>
        ) : (
          grouped.map((g) => (
            <section key={g.weekday} className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">{weekdayName(g.weekday)}</h5>
              {g.items.map((i) => (
                <div key={i.id} className={`rounded-lg border p-3 space-y-2 ${i.ativo === false ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {i.startTime}{i.endTime ? `–${i.endTime}` : ''} · {i.title}
                        {i.ativo === false && <Badge variant="secondary" className="ml-2 text-[9px]">Inativa</Badge>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {[i.location && `Local: ${i.location}`, i.responsible && `Resp.: ${i.responsible}`, i.notes].filter(Boolean).join(' · ')}
                      </p>
                      {(i.updatedBy || i.createdBy) && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {i.createdBy ? `Criado por ${i.createdBy}` : ''}{i.updatedBy ? ` · editado por ${i.updatedBy}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="Editar" onClick={() => startEdit(i)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" title="Apagar (Lixeira)" onClick={() => remove(i)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  <SuspendWidget
                    dates={i.cancelledDates || []}
                    onToggle={(d) => toggleCancel(i, d)}
                  />
                </div>
              ))}
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Suspender/reativar ocorrências: data + botão explícito (mobile-friendly). */
function SuspendWidget({ dates, onToggle }: { dates: string[]; onToggle: (dateIso: string) => void }) {
  const [date, setDate] = useState(luandaDayKey());
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
      <Ban className="h-3 w-3 text-amber-600" />
      <span className="text-[10px] text-muted-foreground">Suspender:</span>
      <input
        type="date"
        className="h-6 rounded border px-1 text-[10px] bg-background"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Data da ocorrência a suspender"
      />
      <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => date && onToggle(date)}>
        {dates.includes(date) ? 'Reactivar' : 'Cancelar ocorrência'}
      </Button>
      {dates.map((d) => (
        <Badge key={d} variant="outline" className="gap-1 text-[9px] text-amber-700 border-amber-400">
          {fmtDatePT(d)}
          <button type="button" aria-label={`Reactivar ${d}`} onClick={() => onToggle(d)}><X className="h-2.5 w-2.5" /></button>
        </Badge>
      ))}
    </div>
  );
}
