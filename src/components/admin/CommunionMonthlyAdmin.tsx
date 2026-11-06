import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Check, X, Loader2, Church, Search } from 'lucide-react';
import { toast } from 'sonner';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { fetchCommunionsForMonth, setCommunionMark, computeCommunionMonthStats, normalizeGender } from '../../lib/communion';
import { CommunionMark, Member, MONTHS_IDX, MONTHS_SHORT } from '../../types';
import { luandaYear, luandaMonthStr } from '../../lib/luanda';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';

const Y = luandaYear();
const M = luandaMonthStr();

export default function CommunionMonthlyAdmin() {
  const { user, userRole } = useAuth();
  const [year, setYear] = useState(Y);
  const [month, setMonth] = useState(M);
  const [members, setMembers] = useState<Member[]>([]);
  const [marks, setMarks] = useState<CommunionMark[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ms, mm] = await Promise.all([getDocs(collection(db, 'members')), fetchCommunionsForMonth(year, month)]);
      setMembers(ms.docs.map((d) => ({ id: d.id, ...d.data() }) as Member));
      setMarks(mm);
    } catch (e) { handleFirestoreError(e, OperationType.LIST, 'communions'); }
    finally { setLoading(false); }
  }, [year, month]);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => { const m = new Map<string, CommunionMark>(); marks.forEach((c) => m.set(c.memberId, c)); return m; }, [marks]);
  const active = useMemo(() => members.filter((m) => {
    const st = String(m.status || 'Activo').toLowerCase();
    return !['falecido', 'inactivo', 'inativo', 'transferido'].includes(st);
  }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt')), [members]);
  const stats = useMemo(() => computeCommunionMonthStats(active, marks), [active, marks]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? active.filter((m) => (m.name || '').toLowerCase().includes(t)) : active;
  }, [active, q]);

  if (userRole !== 'admin') {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Apenas administradores.</CardContent></Card>;
  }

  const apply = async (m: Member, mark: 'present' | 'absent' | null) => {
    setBusyId(m.id);
    try {
      await setCommunionMark({ memberId: m.id, year, month, mark, existing: byId.get(m.id), email: user?.email || 'unknown', memberEmail: m.email || null });
      await load();
      toast.success(mark === 'present' ? `${m.name}: presente` : mark === 'absent' ? `${m.name}: nao participou` : `${m.name}: limpo`);
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'communions'); }
    finally { setBusyId(null); }
  };

  const years = Array.from({ length: 6 }, (_, i) => Y - i);
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="bg-gradient-to-br from-violet-700 to-indigo-800 px-4 py-4 text-white">
          <div className="flex gap-3 items-start">
            <Church className="h-6 w-6 mt-1" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-100">Somente administradores</p>
              <h2 className="text-xl font-bold">Presenca na Comunhao</h2>
              <p className="text-sm text-violet-100">Santa Ceia mensal · cartao do membro</p>
            </div>
          </div>
        </div>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-3">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS_IDX.map((mi, i) => <SelectItem key={mi} value={mi}>{MONTHS_SHORT[i]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 dark:bg-emerald-950/30">
                  <p className="text-[11px] font-semibold uppercase">Participaram</p>
                  <p className="text-2xl font-bold">{stats.present.total}</p>
                  <p className="text-[11px]">M {stats.present.M} · F {stats.present.F}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 dark:bg-rose-950/30">
                  <p className="text-[11px] font-semibold uppercase">Nao participaram</p>
                  <p className="text-2xl font-bold">{stats.notPresent.total}</p>
                  <p className="text-[11px]">M {stats.notPresent.M} · F {stats.notPresent.F}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:bg-amber-950/30">
                  <p className="text-[11px] font-semibold uppercase">Ausentes marcados</p>
                  <p className="text-2xl font-bold">{stats.absent.total}</p>
                  <p className="text-[11px]">M {stats.absent.M} · F {stats.absent.F}</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-[11px] font-semibold uppercase">Membros activos</p>
                  <p className="text-2xl font-bold">{stats.totalMembers}</p>
                  <p className="text-[11px]">Sem registo: {stats.unmarked.total}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Nao participaram = ausentes + sem registo. Marcas gravam em communions (cartao).</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Pesquisar membro..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <ul className="divide-y rounded-xl border">
                {list.map((m) => {
                  const mark = byId.get(m.id)?.mark;
                  const g = normalizeGender(m.gender);
                  const busy = busyId === m.id;
                  return (
                    <li key={m.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {g === 'M' ? 'Masculino' : g === 'F' ? 'Feminino' : (m.gender || 'n/d')}
                          {mark === 'present' && <Badge className="ml-2 bg-emerald-600 text-[10px]">Presente</Badge>}
                          {mark === 'absent' && <Badge className="ml-2 bg-rose-600 text-[10px]">Nao participou</Badge>}
                          {!mark && <Badge variant="secondary" className="ml-2 text-[10px]">Sem registo</Badge>}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" disabled={busy} variant={mark === 'present' ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => void apply(m, 'present')}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Presente
                        </Button>
                        <Button size="sm" disabled={busy} variant={mark === 'absent' ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => void apply(m, 'absent')}>
                          <X className="h-3.5 w-3.5" /> Nao
                        </Button>
                        {mark && <Button size="sm" disabled={busy} variant="ghost" className="h-8 text-xs" onClick={() => void apply(m, null)}>Limpar</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
