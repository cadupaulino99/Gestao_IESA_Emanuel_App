import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { Loader2, Download, Plus, Trash2, Church, HandCoins, HeartHandshake, RefreshCw } from 'lucide-react';
import MemberCardView, { MemberCardData } from './MemberCardView';
import { generateMemberCardPdf } from '../../lib/pdfUtils';
import { useAuth } from '../../context/AuthContext';
import {
  Member,
  CommunionMark,
  Donation,
  Renewal,
  Tithe,
  CARD_HEADER_DEFAULT,
  MONTHS_SHORT,
  MONTHS_IDX,
} from '../../types';

interface Props {
  member: Member | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const THIS_YEAR = new Date().getFullYear();

/**
 * Cartão de membro (vista da liderança): mostra as duas faces tal como no papel
 * e permite registar comunhão, donativos voluntários e renovações, além de
 * gerar o PDF fiel às duas faces.
 */
export default function MemberCardModal({ member, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MemberCardData>({ communions: [], donations: [], tithes: [], renewals: [] });

  // registos
  const [comYear, setComYear] = useState<number>(THIS_YEAR);
  const [comMonth, setComMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [comMark, setComMark] = useState('FM');

  const [donAmount, setDonAmount] = useState('');
  const [donDate, setDonDate] = useState(new Date().toISOString().slice(0, 10));

  const [renDate, setRenDate] = useState(new Date().toISOString().slice(0, 10));
  const [renSign, setRenSign] = useState('');

  const [busy, setBusy] = useState(false);

  const load = async (memberId: string) => {
    setLoading(true);
    try {
      const [c, d, t, r] = await Promise.all([
        getDocs(query(collection(db, 'communions'), where('memberId', '==', memberId))),
        getDocs(query(collection(db, 'donations'), where('memberId', '==', memberId))),
        getDocs(query(collection(db, 'tithes'), where('memberId', '==', memberId))),
        getDocs(query(collection(db, 'renewals'), where('memberId', '==', memberId))),
      ]);
      setData({
        communions: c.docs.map((x) => ({ id: x.id, ...x.data() }) as CommunionMark),
        donations: d.docs.map((x) => ({ id: x.id, ...x.data() }) as Donation),
        tithes: t.docs.map((x) => ({ id: x.id, ...x.data() }) as Tithe),
        renewals: r.docs.map((x) => ({ id: x.id, ...x.data() }) as Renewal),
      });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar o cartão. Verifique as permissões (as coleções novas precisam das regras publicadas).');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && member) void load(member.id);
    if (!open) setData({ communions: [], donations: [], tithes: [], renewals: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id]);

  const yearsOptions = useMemo(() => {
    const ys = new Set<number>([THIS_YEAR, THIS_YEAR - 1]);
    data.communions.forEach((c) => c.year && ys.add(c.year));
    data.donations.forEach((d) => d.referenceYear && ys.add(d.referenceYear));
    data.tithes.forEach((t) => t.referenceYear && ys.add(t.referenceYear));
    return [...ys].sort((a, b) => b - a);
  }, [data]);

  if (!member) return null;

  const addCommunion = async () => {
    setBusy(true);
    try {
      // substitui a marca existente desse (ano, mês), se houver
      const existing = data.communions.find((c) => c.year === comYear && c.month === comMonth);
      if (existing) await deleteDoc(doc(db, 'communions', existing.id));
      await addDoc(collection(db, 'communions'), {
        memberId: member.id,
        year: comYear,
        month: comMonth,
        mark: comMark.trim() || 'FM',
        recordedBy: user?.email || 'unknown',
        createdAt: Date.now(),
      });
      toast.success(`Comunhão ${MONTHS_SHORT[Number(comMonth) - 1]}/${comYear} registada.`);
      await load(member.id);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao registar comunhão.');
    } finally {
      setBusy(false);
    }
  };

  const addDonation = async () => {
    const amount = Number(String(donAmount).replace(',', '.'));
    if (!amount || amount <= 0) {
      toast.error('Indique um valor válido.');
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, 'donations'), {
        memberId: member.id,
        memberName: member.name,
        amount,
        date: donDate,
        referenceMonth: donDate.slice(5, 7),
        referenceYear: Number(donDate.slice(0, 4)),
        recordedBy: user?.email || 'unknown',
        createdAt: Date.now(),
      });
      toast.success('Donativo voluntário registado.');
      setDonAmount('');
      await load(member.id);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao registar donativo.');
    } finally {
      setBusy(false);
    }
  };

  const addRenewal = async () => {
    setBusy(true);
    try {
      await addDoc(collection(db, 'renewals'), {
        memberId: member.id,
        date: renDate,
        pastorSign: renSign.trim(),
        createdAt: Date.now(),
      });
      toast.success('Renovação registada.');
      setRenSign('');
      await load(member.id);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao registar renovação.');
    } finally {
      setBusy(false);
    }
  };

  const removeCommunion = async (id: string) => {
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'communions', id));
      toast.success('Marca de comunhão removida.');
      await load(member.id);
    } finally {
      setBusy(false);
    }
  };

  const removeDonation = async (id: string) => {
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'donations', id));
      toast.success('Donativo removido.');
      await load(member.id);
    } finally {
      setBusy(false);
    }
  };

  const pdf = async () => {
    setBusy(true);
    try {
      await generateMemberCardPdf(member, data, CARD_HEADER_DEFAULT);
      toast.success('PDF do cartão gerado (2 páginas = frente e verso).');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar o PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Cartão de Membro — {member.name}</DialogTitle>
          <DialogDescription>
            Réplica digital do cartão de papel: dados pessoais, comunhão, donativos voluntários,
            dízimos e renovações. O membro vê o mesmo no Portal do Membro.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> A carregar o cartão…
          </div>
        ) : (
          <>
            <MemberCardView member={member} data={data} header={CARD_HEADER_DEFAULT} />

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={pdf} disabled={busy} className="gap-2">
                <Download className="h-4 w-4" /> Gerar PDF (frente + verso)
              </Button>
            </div>

            {/* ── registos da liderança ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t">
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Church className="h-4 w-4 text-purple-600" /> Comunhão
                </div>
                <div className="flex gap-2">
                  <Select value={String(comYear)} onValueChange={(v) => setComYear(Number(v))}>
                    <SelectTrigger className="w-[86px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {yearsOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={comMonth} onValueChange={setComMonth}>
                    <SelectTrigger className="w-[86px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS_IDX.map((mi, i) => <SelectItem key={mi} value={mi}>{MONTHS_SHORT[i]}.</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Marca (sigla usada no papel)</Label>
                  <Input value={comMark} onChange={(e) => setComMark(e.target.value)} className="h-8 text-xs" placeholder="FM" />
                </div>
                <Button size="sm" onClick={addCommunion} disabled={busy} className="w-full gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Marcar mês
                </Button>
                {data.communions.length > 0 && (
                  <div className="text-[10px] text-slate-500 space-y-0.5 max-h-16 overflow-y-auto">
                    {[...data.communions].sort((a, b) => (b.year - a.year) || b.month.localeCompare(a.month)).slice(0, 6).map((c) => (
                      <button key={c.id} onClick={() => removeCommunion(c.id)} className="flex items-center gap-1 hover:text-destructive" title="Remover">
                        <Trash2 className="h-3 w-3" /> {MONTHS_SHORT[Number(c.month) - 1]}/{c.year} → {c.mark}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <HeartHandshake className="h-4 w-4 text-rose-600" /> Donativo voluntário
                </div>
                <div>
                  <Label className="text-[11px]">Valor (AOA)</Label>
                  <Input value={donAmount} onChange={(e) => setDonAmount(e.target.value)} inputMode="decimal" className="h-8 text-xs" placeholder="Ex.: 2000" />
                </div>
                <div>
                  <Label className="text-[11px]">Data</Label>
                  <Input type="date" value={donDate} onChange={(e) => setDonDate(e.target.value)} className="h-8 text-xs" />
                </div>
                <Button size="sm" onClick={addDonation} disabled={busy} className="w-full gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Registar donativo
                </Button>
                {data.donations.length > 0 && (
                  <div className="text-[10px] text-slate-500 space-y-0.5 max-h-16 overflow-y-auto">
                    {[...data.donations].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6).map((d) => (
                      <button key={d.id} onClick={() => removeDonation(d.id)} className="flex items-center gap-1 hover:text-destructive" title="Remover">
                        <Trash2 className="h-3 w-3" /> {d.date} → {d.amount.toLocaleString('pt-AO')} AOA
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <RefreshCw className="h-4 w-4 text-emerald-600" /> Renovação anual
                </div>
                <div>
                  <Label className="text-[11px]">Renovado aos</Label>
                  <Input type="date" value={renDate} onChange={(e) => setRenDate(e.target.value)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[11px]">Rubrica do pastor</Label>
                  <Input value={renSign} onChange={(e) => setRenSign(e.target.value)} className="h-8 text-xs" placeholder="Iniciais / rubrica" />
                </div>
                <Button size="sm" onClick={addRenewal} disabled={busy} className="w-full gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Registar renovação
                </Button>
                {data.renewals.length > 0 && (
                  <div className="text-[10px] text-slate-500">
                    Última: {[...data.renewals].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.date}
                  </div>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <HandCoins className="h-3.5 w-3.5" /> Os dízimos do cartão vêm dos registos existentes em
              Financeiro → Dízimos (totais por mês); as semanas 1ª-4ª do papel foram substituídas pelo total mensal, conforme decidido.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
