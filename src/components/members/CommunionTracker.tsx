import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { Church, Search, Loader2 } from 'lucide-react';
import CommunionGrid from './CommunionGrid';
import { fetchCommunion, cycleCommunionMark } from '../../lib/communion';
import { useAuth } from '../../context/AuthContext';
import { CommunionMark, Member } from '../../types';

const THIS_YEAR = new Date().getFullYear();

/**
 * Aba «Comunhão» dos Membros: a liderança localiza o membro pelo nome e
 * assinala os meses em que participou — como se preenchesse o papel, mas com
 * um toque por mês.
 */
export default function CommunionTracker() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Member | null>(null);
  const [year, setYear] = useState<number>(THIS_YEAR);
  const [marks, setMarks] = useState<CommunionMark[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ['members_for_communion'],
    queryFn: async () => {
      try {
        const snap = await getDocs(query(collection(db, 'members'), where('status', '==', 'Activo')));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Member);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'members');
        return [] as Member[];
      }
    },
  });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    const list = t
      ? members.filter((m) => m.name.toLowerCase().includes(t) || (m.phone || '').includes(t))
      : members;
    return list.slice(0, 8);
  }, [members, search]);

  const pick = async (m: Member) => {
    setSelected(m);
    setBusy(true);
    try {
      setMarks(await fetchCommunion(m.id));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar a comunhão.');
    } finally {
      setBusy(false);
    }
  };

  const cycle = async (mi: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      await cycleCommunionMark(selected.id, year, mi, marks.find((c) => c.year === year && c.month === mi), user?.email || '');
      setMarks(await fetchCommunion(selected.id));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao registar. Verifique se as regras do Firestore foram publicadas.');
    } finally {
      setBusy(false);
    }
  };

  const yearStats = (y: number) => {
    const pres = marks.filter((m) => m.year === y && m.mark === 'present').length;
    const abs = marks.filter((m) => m.year === y && m.mark === 'absent').length;
    return { pres, abs };
  };

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-lg flex items-center gap-2">
          <Church className="h-5 w-5 text-purple-600" /> Participação na Comunhão
        </CardTitle>
        <CardDescription>
          Localize o membro e assinale os meses: um clique = ✓, dois cliques = ✗, três cliques = limpa.
          No papel estas casas levavam a assinatura do pastor; aqui fica registado quem marcou.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar membro pelo nome ou telefone…"
              className="pl-9"
            />
          </div>
          {!selected && filtered.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {filtered.map((m) => (
                <Button key={m.id} variant="outline" size="sm" onClick={() => pick(m)}>
                  {m.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div className="space-y-3 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold text-sm">{selected.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {selected.groupCell ? `Célula: ${selected.groupCell} · ` : ''}
                  {yearStats(year).pres}✓ · {yearStats(year).abs}✗ em {year}
                </div>
              </div>
              <div className="flex gap-2">
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[THIS_YEAR + 1, THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2, THIS_YEAR - 3].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Trocar membro</Button>
              </div>
            </div>
            {busy ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> A guardar…
              </div>
            ) : (
              <CommunionGrid year={year} marks={marks} onCycle={cycle} disabled={busy} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
