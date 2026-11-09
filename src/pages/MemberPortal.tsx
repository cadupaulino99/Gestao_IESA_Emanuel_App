import React, { useEffect, useState } from "react";
import { prefGet } from '../lib/prefs';
import { useAuth } from "../context/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { LogOut, CreditCard, FileText, Pencil, UserRound, Home, CalendarDays, Radio as RadioIcon, Handshake, ChevronRight, Users, CheckCircle2, TrendingUp, RefreshCw } from "lucide-react";
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Tithe, CommunionMark, Donation, Renewal, CARD_HEADER_DEFAULT } from "../types";
import { generateMembershipCard, generateMemberCardPdf, savePdf } from "../lib/pdfUtils";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import MemberBoard from "../components/portal/MemberBoard";
import MemberSupport from "../components/portal/MemberSupport";
import RadioPage from "./Radio";
import MemberCardView, { type MemberCardData } from "../components/members/MemberCardView";
import UpdateBanner from "../components/UpdateBanner";
import { computeStatus } from "../lib/contrib";
import { formatKz } from '../lib/money';
import { fmtTodayTimePT, lastMonthsLuanda } from '../lib/luanda';

export default function MemberPortal() {
  const { memberData, signOut } = useAuth();
  const [tithes, setTithes] = useState<Tithe[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [updateForm, setUpdateForm] = useState({ telefone: "", endereco: "", estadoCivil: "" });
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const loadMyRequests = async () => {
    const em = String(memberData?.email || '').trim().toLowerCase();
    if (!em) { setMyRequests([]); return; }
    try {
      const snap = await getDocs(query(collection(db, 'pedidos_atualizacao'), where('memberEmail', '==', em)));
      setMyRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)));
    } catch { setMyRequests([]); }
  };
  const [cardData, setCardData] = useState<Omit<MemberCardData, 'tithes'>>({ communions: [], donations: [], renewals: [] });
  const [cardBusy, setCardBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({ phone: "", address: "", maritalStatus: "", education: "", profession: "", spouseName: "" });

  useEffect(() => {
    if (!memberData) return;
    const fetchTithes = async () => {
      try {
        const snap = await getDocs(query(collection(db, "tithes"), where("memberId", "==", memberData.id)));
        const tData = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Tithe);
        tData.sort((a, b) => (a.year !== b.year ? (b.year || 0) - (a.year || 0) : b.month.localeCompare(a.month)));
        setTithes(tData);
      } catch (error) { handleFirestoreError(error, OperationType.GET, "tithes"); }
      finally { setLoading(false); }
    };
    const fetchCard = async () => {
      try {
        const [c, d, r, b, co, pa] = await Promise.all([
          getDocs(query(collection(db, "communions"), where("memberId", "==", memberData.id))),
          getDocs(query(collection(db, "donations"), where("memberId", "==", memberData.id))),
          getDocs(query(collection(db, "renewals"), where("memberId", "==", memberData.id))),
          getDocs(query(collection(db, "member_budgets"), where("memberId", "==", memberData.id))),
          getDocs(query(collection(db, "contributions"), where("memberId", "==", memberData.id))),
          getDocs(query(collection(db, "contribution_payments"), where("memberId", "==", memberData.id))),
        ]);
        const pays = pa.docs.map((x) => ({ id: x.id, ...x.data() }) as any);
        const budgets = b.docs.map((x) => x.data() as any).sort((x, y) => (y.year || 0) - (x.year || 0));
        setCardData({
          communions: c.docs.map((x) => ({ id: x.id, ...x.data() }) as CommunionMark),
          donations: d.docs.map((x) => ({ id: x.id, ...x.data() }) as Donation),
          renewals: r.docs.map((x) => ({ id: x.id, ...x.data() }) as Renewal),
          budget: budgets[0] ? { year: budgets[0].year, amount: budgets[0].amount } : null,
          contributions: co.docs.map((x) => {
            const cc = x.data() as any;
            const paid = pays.filter((pp) => pp.contributionId === x.id).reduce((a, bb) => a + (Number(bb.amount) || 0), 0);
            return { ...cc, paid, status: computeStatus(cc, paid, cc.amount) };
          }),
        });
      } catch (error) { console.log("cartão:", error); }
    };
    fetchTithes(); fetchCard();
  }, [memberData]);

  if (!memberData) return null;

  const openEdit = () => {
    setEditForm({ phone: memberData.phone || "", address: memberData.address || "", maritalStatus: memberData.maritalStatus || "", education: memberData.education || "", profession: memberData.profession || "", spouseName: memberData.spouseName || "" });
    setEditOpen(true);
  };

  const saveMyData = async () => {
    setEditSaving(true);
    try {
      await updateDoc(doc(db, "members", memberData.id), { ...editForm, updatedAt: Date.now() });
      toast.success("Dados atualizados.");
      setEditOpen(false);
      setTimeout(() => window.location.reload(), 900);
    } catch (e: any) { toast.error(e?.message || "Erro ao atualizar."); }
    finally { setEditSaving(false); }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUpdate(true);
    try {
      await addDoc(collection(db, "pedidos_atualizacao"), {
        memberId: memberData.id, memberName: memberData.name,
        memberEmail: String(memberData.email || '').trim().toLowerCase() || null,
        currentData: { telefone: memberData.phone || "", endereco: memberData.address || "", estadoCivil: memberData.maritalStatus || "" },
        requestedData: updateForm, status: "pendente", createdAt: Date.now(),
      });
      toast.success("Pedido enviado!");
      setIsUpdateOpen(false);
    } catch (error) { toast.error("Erro ao enviar."); handleFirestoreError(error, OperationType.WRITE, "pedidos_atualizacao"); }
    finally { setSubmittingUpdate(false); }
  };

  const handleGenerateExtract = async () => {
    if (!tithes.length) return;
    const docPdf = new jsPDF();
    let churchName = "A SUA IGREJA";
    const saved = prefGet('church-settings');
    if (saved) { try { const p = JSON.parse(saved); if (p.nome) churchName = p.nome; } catch {} }
    docPdf.setFontSize(14); docPdf.text(churchName, 14, 20);
    docPdf.setFontSize(12); docPdf.text(`Extrato de Dízimos: ${memberData.name}`, 14, 28);
    docPdf.setFontSize(10); docPdf.text(`Gerado em: ${fmtTodayTimePT()}`, 14, 34);
    autoTable(docPdf, { startY: 40, head: [["Mês/Ano", "Data", "Valor"]], body: tithes.map((t) => [`${t.month}/${t.year || "-"}`, t.createdAt ? new Date(t.createdAt).toLocaleDateString("pt-AO") : "-", formatKz(t.amount)]) });
    await savePdf(docPdf, `Extrato_${memberData.name.replace(/\s+/g, "_")}.pdf`);
  };

  const chartData = lastMonthsLuanda(6).map((s) => ({
    name: s.label,
    valor: tithes.filter((t: any) => t.month === s.monthStr && t.year === s.year).reduce((a: number, c: any) => a + c.amount, 0),
  }));
  const latest = tithes[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-white dark:from-slate-950 dark:to-background">
      <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-5">
        <UpdateBanner />
        <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0b3d91] via-[#1557c0] to-[#1a6fe0] p-4 text-white shadow-lg sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 bg-white/10 text-center leading-tight">
                <div><span className="block text-[10px] font-black text-amber-300">IESA</span><span className="block text-[8px] font-semibold">EMANUEL</span><span className="block text-[7px] text-white/70">XANGONGO</span></div>
              </div>
              <div>
                <p className="text-sm font-bold text-amber-300">Área do Membro</p>
                <h1 className="text-2xl font-black">Portal do Membro</h1>
                <p className="text-sm text-blue-100">Bem-vindo(a), <span className="font-semibold text-white">{memberData.name}</span></p>
              </div>
            </div>
            <Button onClick={signOut} className="gap-2 rounded-xl border border-white/30 bg-white/15 text-white hover:bg-white/25"><LogOut className="h-4 w-4" /> Sair</Button>
          </div>
        </header>

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="mx-auto flex h-auto w-full max-w-3xl flex-wrap justify-center gap-1 rounded-2xl border bg-white p-1.5 shadow-sm dark:bg-card">
            <TabsTrigger value="dados" className="gap-1.5 rounded-xl data-[state=active]:bg-[#1557c0] data-[state=active]:text-white"><Home className="h-3.5 w-3.5" /> Geral & Finanças</TabsTrigger>
            <TabsTrigger value="mural" className="gap-1.5 rounded-xl"><CalendarDays className="h-3.5 w-3.5" /> Avisos & Eventos</TabsTrigger>
            <TabsTrigger value="radio" className="gap-1.5 rounded-xl"><RadioIcon className="h-3.5 w-3.5" /> Rádio</TabsTrigger>
            <TabsTrigger value="suporte" className="gap-1.5 rounded-xl"><Handshake className="h-3.5 w-3.5" /> Suporte</TabsTrigger>
            <TabsTrigger value="cartao" className="gap-1.5 rounded-xl"><CreditCard className="h-3.5 w-3.5" /> Cartão</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="overflow-hidden border-0 shadow-md lg:col-span-2">
                <div className="flex items-center justify-between bg-gradient-to-r from-[#0b3d91] to-[#1557c0] px-4 py-3 text-white">
                  <div className="flex items-center gap-2"><UserRound className="h-5 w-5" /><h2 className="font-bold">Meus Dados</h2></div>
                  <Button size="sm" onClick={openEdit} className="h-8 rounded-full border-0 bg-white/20 text-white hover:bg-white/30"><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>
                </div>
                <CardContent className="space-y-4 p-4">
                  <div className="flex gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-[#1557c0] ring-2 ring-blue-100"><UserRound className="h-8 w-8" /></div>
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Estado:</span><Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" />{memberData.status || "Activo"}</Badge></div>
                      <div className="flex gap-2"><Users className="mt-0.5 h-4 w-4 text-[#1557c0]" /><div><p className="text-xs text-muted-foreground">Célula / Grupo</p><p className="font-semibold">{memberData.groupCell || "—"}</p></div></div>
                      <div className="flex gap-2"><CalendarDays className="mt-0.5 h-4 w-4 text-[#1557c0]" /><div><p className="text-xs text-muted-foreground">Data de Baptismo</p><p className="font-semibold">{memberData.baptismDate ? new Date(memberData.baptismDate).toLocaleDateString("pt-AO") : "—"}</p></div></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-between rounded-xl border-blue-100 bg-blue-50/80" onClick={() => generateMembershipCard(memberData)}>
                      <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Baixar Cartão</span><ChevronRight className="h-4 w-4 opacity-50" />
                    </Button>
                    <Button variant="outline" className="w-full justify-between rounded-xl border-violet-100 bg-violet-50/80" onClick={handleGenerateExtract} disabled={!tithes.length}>
                      <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Extrato Anual</span><ChevronRight className="h-4 w-4 opacity-50" />
                    </Button>
                    <Dialog open={isUpdateOpen} onOpenChange={(open) => { if (open) { setUpdateForm({ telefone: memberData.phone || "", endereco: memberData.address || "", estadoCivil: memberData.maritalStatus || "" }); void loadMyRequests(); } setIsUpdateOpen(open); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full justify-between rounded-xl border-emerald-100 bg-emerald-50/80">
                          <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Pedir Actualização de Dados</span><ChevronRight className="h-4 w-4 opacity-50" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Actualização de Dados</DialogTitle><DialogDescription>Solicite alteração dos seus dados.</DialogDescription></DialogHeader>
                        <form onSubmit={handleUpdateSubmit} className="space-y-3">
                          <div className="space-y-1"><Label>Telefone</Label><Input value={updateForm.telefone} onChange={(e) => setUpdateForm({ ...updateForm, telefone: e.target.value })} /></div>
                          <div className="space-y-1"><Label>Endereço</Label><Input value={updateForm.endereco} onChange={(e) => setUpdateForm({ ...updateForm, endereco: e.target.value })} /></div>
                          <div className="space-y-1"><Label>Estado Civil</Label>
                            <Select value={updateForm.estadoCivil} onValueChange={(v) => setUpdateForm({ ...updateForm, estadoCivil: v })}>
                              <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Solteiro(a)">Solteiro(a)</SelectItem>
                                <SelectItem value="Casado(a)">Casado(a)</SelectItem>
                                <SelectItem value="Viúvo(a)">Viúvo(a)</SelectItem>
                                <SelectItem value="Divorciado(a)">Divorciado(a)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button type="submit" className="w-full" disabled={submittingUpdate}>{submittingUpdate ? "A enviar..." : "Enviar Pedido"}</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <p className="border-t pt-3 text-center text-xs italic text-[#0b3d91]">Juntos na fé, servindo a Deus!</p>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-0 shadow-md lg:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-[#0b3d91] to-[#1557c0] px-4 py-3 text-white">
                  <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /><div><h2 className="font-bold leading-tight">Meu Histórico Financeiro</h2><p className="text-[11px] text-blue-100">Dízimos registados nos últimos meses</p></div></div>
                  <span className="rounded-full bg-white/15 px-3 py-1 text-[11px]">Últimos 6 Meses</span>
                </div>
                <CardContent className="space-y-4 p-4">
                  {loading ? <p className="py-8 text-center text-sm text-muted-foreground">A carregar…</p> : (
                    <>
                      <div className="h-52 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs><linearGradient id="titheFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1557c0" stopOpacity={0.35} /><stop offset="100%" stopColor="#1557c0" stopOpacity={0.02} /></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                            <Tooltip formatter={(v: any) => [formatKz(Number(v) || 0), "Dízimo"]} />
                            <Area type="monotone" dataKey="valor" stroke="#1557c0" strokeWidth={2.5} fill="url(#titheFill)" dot={{ r: 4, fill: "#1557c0" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      {latest && (
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className="rounded-xl border bg-slate-50 p-3 text-sm"><p className="text-[10px] uppercase text-muted-foreground">Mês/Ano</p><p className="font-bold">{latest.month}/{latest.year || "—"}</p></div>
                          <div className="rounded-xl border bg-slate-50 p-3 text-sm"><p className="text-[10px] uppercase text-muted-foreground">Data</p><p className="font-bold">{latest.createdAt ? new Date(latest.createdAt).toLocaleDateString("pt-AO") : "—"}</p></div>
                          <div className="rounded-xl border bg-slate-50 p-3 text-sm"><p className="text-[10px] uppercase text-muted-foreground">Valor</p><p className="font-bold text-[#1557c0]">{formatKz(latest.amount)}</p></div>
                        </div>
                      )}
                      {tithes.length <= 1 ? (
                        <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{tithes.length === 0 ? "Sem registos de dízimos." : "Sem registos adicionais."}</div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border">
                          <Table>
                            <TableHeader><TableRow><TableHead>Mês/Ano</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                            <TableBody>{tithes.slice(0, 12).map((t) => (<TableRow key={t.id}><TableCell>{t.month}/{t.year || "—"}</TableCell><TableCell>{t.createdAt ? new Date(t.createdAt).toLocaleDateString("pt-AO") : "—"}</TableCell><TableCell className="text-right font-medium">{formatKz(t.amount)}</TableCell></TableRow>))}</TableBody>
                          </Table>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="mural" className="pt-4"><MemberBoard /></TabsContent>
          <TabsContent value="radio" className="pt-4"><RadioPage /></TabsContent>
          <TabsContent value="suporte" className="pt-4"><MemberSupport /></TabsContent>
          <TabsContent value="cartao" className="pt-4">
            <MemberCardView member={memberData} tithes={tithes} {...cardData} busy={cardBusy} onDownload={async () => {
              setCardBusy(true);
              try { const pdf = await generateMemberCardPdf({ member: memberData, tithes, ...cardData, header: CARD_HEADER_DEFAULT }); await savePdf(pdf, `Cartao_${memberData.name.replace(/\s+/g, "_")}.pdf`); }
              finally { setCardBusy(false); }
            }} />
          </TabsContent>
        </Tabs>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar os meus dados</DialogTitle><DialogDescription>Actualize apenas os campos permitidos.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-xs">Telefone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Endereço</Label><Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Estado Civil</Label><Input value={editForm.maritalStatus} onChange={(e) => setEditForm({ ...editForm, maritalStatus: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Formação</Label><Input value={editForm.education} onChange={(e) => setEditForm({ ...editForm, education: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Profissão</Label><Input value={editForm.profession} onChange={(e) => setEditForm({ ...editForm, profession: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Nome do Cônjuge</Label><Input value={editForm.spouseName} onChange={(e) => setEditForm({ ...editForm, spouseName: e.target.value })} /></div>
              <Button className="w-full" onClick={saveMyData} disabled={editSaving}>{editSaving ? "A guardar…" : "Guardar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
