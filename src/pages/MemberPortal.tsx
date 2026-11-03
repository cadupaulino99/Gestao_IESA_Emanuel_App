import React, { useEffect, useState } from "react";
import { prefGet } from '../lib/prefs';
import { useAuth } from "../context/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  LogOut,
  CreditCard,
  Download,
  FileText,
  Settings2,
  Pencil,
  UserRound,
  HeartHandshake,
} from "lucide-react";
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Tithe } from "../types";
import { generateMembershipCard } from "../lib/pdfUtils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { toast } from "sonner";
import MemberBoard from "../components/portal/MemberBoard";
import MemberSupport from "../components/portal/MemberSupport";
import RadioPage from "./Radio";
import MemberCardView, { type MemberCardData } from "../components/members/MemberCardView";
import UpdateBanner from "../components/UpdateBanner";
import { generateMemberCardPdf, savePdf } from "../lib/pdfUtils";
import {
  CommunionMark,
  Donation,
  Renewal,
  CARD_HEADER_DEFAULT,
} from "../types";
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
        const q = query(collection(db, "tithes"), where("memberId", "==", memberData.id));
        const snap = await getDocs(q);
        const tData = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Tithe);
        tData.sort((a, b) => {
          if (a.year !== b.year) return (b.year || 0) - (a.year || 0);
          return b.month.localeCompare(a.month);
        });
        setTithes(tData);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "tithes");
      } finally {
        setLoading(false);
      }
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
      } catch (error) {
        console.log("cartão:", error);
      }
    };
    fetchTithes();
    fetchCard();
  }, [memberData]);

  if (!memberData) return null;

  const openEdit = () => {
    setEditForm({
      phone: memberData.phone || "",
      address: memberData.address || "",
      maritalStatus: memberData.maritalStatus || "",
      education: memberData.education || "",
      profession: memberData.profession || "",
      spouseName: memberData.spouseName || "",
    });
    setEditOpen(true);
  };

  const saveMyData = async () => {
    setEditSaving(true);
    try {
      await updateDoc(doc(db, "members", memberData.id), {
        phone: editForm.phone,
        address: editForm.address,
        maritalStatus: editForm.maritalStatus,
        education: editForm.education,
        profession: editForm.profession,
        spouseName: editForm.spouseName,
        updatedAt: Date.now(),
      });
      toast.success("Dados atualizados.");
      setEditOpen(false);
      setTimeout(() => window.location.reload(), 900);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao atualizar os seus dados.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUpdate(true);
    try {
      await addDoc(collection(db, "pedidos_atualizacao"), {
        memberId: memberData.id,
        memberName: memberData.name,
        memberEmail: String(memberData.email || '').trim().toLowerCase() || null,
        currentData: {
          telefone: memberData.phone || "",
          endereco: memberData.address || "",
          estadoCivil: memberData.maritalStatus || "",
        },
        requestedData: updateForm,
        status: "pendente",
        createdAt: Date.now(),
      });
      toast.success("Pedido de atualização enviado com sucesso!");
      setIsUpdateOpen(false);
    } catch (error) {
      toast.error("Erro ao enviar o pedido.");
      handleFirestoreError(error, OperationType.WRITE, "pedidos_atualizacao");
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const handleGenerateExtract = async () => {
    if (!tithes.length) return;
    const docPdf = new jsPDF();
    let churchName = "A SUA IGREJA";
    const saved = prefGet('church-settings');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.nome) churchName = p.nome;
      } catch (e) {}
    }
    docPdf.setFontSize(14);
    docPdf.text(churchName, 14, 20);
    docPdf.setFontSize(12);
    docPdf.text(`Extrato de Dízimos: ${memberData.name}`, 14, 28);
    docPdf.setFontSize(10);
    docPdf.text(`Gerado em: ${fmtTodayTimePT()}`, 14, 34);
    const tableData = tithes.map((t) => [
      `${t.month}/${t.year || "-"}`,
      t.createdAt ? new Date(t.createdAt).toLocaleDateString("pt-AO") : "-",
      formatKz(t.amount),
    ]);
    autoTable(docPdf, {
      startY: 40,
      head: [["Mês/Ano Ref.", "Data de Pagamento", "Valor"]],
      body: tableData,
    });
    await savePdf(docPdf, `Extrato_${memberData.name.replace(/\s+/g, "_")}.pdf`);
  };

  const chartData = lastMonthsLuanda(6).map((s) => ({
    name: s.label,
    valor: tithes
      .filter((t: any) => t.month === s.monthStr && t.year === s.year)
      .reduce((acc: number, curr: any) => acc + curr.amount, 0),
  }));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background p-3 sm:p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <UpdateBanner />
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-700 via-blue-700 to-indigo-800 p-4 text-white shadow-md sm:p-5">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <HeartHandshake className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100/90">Área do membro</p>
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Portal do Membro</h1>
                <p className="mt-0.5 text-sm text-sky-100/90">
                  Bem-vindo(a), <span className="font-semibold text-white">{memberData.name}</span>
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={signOut}
              className="w-full gap-2 rounded-xl border-0 bg-white/15 text-white hover:bg-white/25 sm:w-auto"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </header>

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-xl border bg-white p-1 shadow-sm dark:bg-card">
            <TabsTrigger value="dados" className="rounded-lg text-xs sm:text-sm">Geral & Finanças</TabsTrigger>
            <TabsTrigger value="mural" className="rounded-lg text-xs sm:text-sm">Avisos & Eventos</TabsTrigger>
            <TabsTrigger value="radio" className="rounded-lg text-xs sm:text-sm">Rádio</TabsTrigger>
            <TabsTrigger value="suporte" className="rounded-lg text-xs sm:text-sm">Suporte</TabsTrigger>
            <TabsTrigger value="cartao" className="gap-1.5 rounded-lg text-xs sm:text-sm">
              <CreditCard className="h-3.5 w-3.5" /> Cartão
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-6 pt-4">
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="rounded-2xl border-border/70 shadow-sm md:col-span-1">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base font-semibold tracking-tight">Meus Dados</CardTitle>
                  <Button variant="ghost" size="sm" onClick={openEdit} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-muted-foreground block text-sm">Estado</span>
                    <Badge variant={memberData.status === "Activo" ? "default" : "secondary"}>
                      {memberData.status || "Activo"}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-sm">Célula / Grupo</span>
                    <span className="font-medium">{memberData.groupCell || "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-sm">Data de Baptismo</span>
                    <span className="font-medium">
                      {memberData.baptismDate
                        ? new Date(memberData.baptismDate).toLocaleDateString("pt-AO")
                        : "-"}
                    </span>
                  </div>
                  <div className="pt-4 space-y-2">
                    <Button className="w-full justify-start" variant="outline" onClick={() => generateMembershipCard(memberData)}>
                      <CreditCard className="h-4 w-4 mr-2 text-emerald-600" /> Baixar Cartão
                    </Button>
                    <Button className="w-full justify-start" variant="outline" onClick={handleGenerateExtract} disabled={tithes.length === 0}>
                      <FileText className="h-4 w-4 mr-2 text-blue-600" /> Extrato Anual
                    </Button>
                    <Dialog open={isUpdateOpen} onOpenChange={(open) => {
                      if (open) {
                        setUpdateForm({
                          telefone: memberData.phone || "",
                          endereco: memberData.address || "",
                          estadoCivil: memberData.maritalStatus || "",
                        });
                        void loadMyRequests();
                      }
                      setIsUpdateOpen(open);
                    }}>
                      <DialogTrigger asChild>
                        <Button className="w-full justify-start" variant="outline">
                          <Settings2 className="h-4 w-4 mr-2 text-muted-foreground" /> Pedir Atualização de Dados
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Atualização de Dados</DialogTitle>
                          <DialogDescription>Caso os seus dados tenham mudado, preencha abaixo para solicitar a alteração.</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleUpdateSubmit} className="space-y-4">
                          <div className="space-y-2">
                            <Label>Telefone</Label>
                            <Input value={updateForm.telefone} onChange={(e) => setUpdateForm({ ...updateForm, telefone: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Endereço</Label>
                            <Input value={updateForm.endereco} onChange={(e) => setUpdateForm({ ...updateForm, endereco: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>Estado Civil</Label>
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
                          <Button type="submit" className="w-full" disabled={submittingUpdate}>
                            {submittingUpdate ? "A enviar..." : "Enviar Pedido"}
                          </Button>
                        </form>
                        <div className="mt-4 space-y-2 border-t pt-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Os meus pedidos</p>
                          {myRequests.length === 0 && (
                            <p className="text-xs text-muted-foreground">Ainda não fez pedidos de atualização.</p>
                          )}
                          {myRequests.slice(0, 8).map((r: any) => (
                            <div key={r.id} className="rounded-md border p-2 text-xs space-y-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-AO') : '—'}</span>
                                {r.status === 'aprovado' ? (
                                  <Badge className="bg-emerald-600 text-[9px]">Aprovado</Badge>
                                ) : r.status === 'rejeitado' ? (
                                  <Badge variant="destructive" className="text-[9px]">Rejeitado</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[9px]">Pendente</Badge>
                                )}
                              </div>
                              {r.reason && <p className="text-red-600 dark:text-red-400"><b>Motivo:</b> {r.reason}</p>}
                            </div>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border/70 shadow-sm md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base font-semibold tracking-tight">Meu Histórico Financeiro</CardTitle>
                  <CardDescription>Dízimos registados nos últimos meses</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">A carregar…</div>
                  ) : (
                    <>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                            <XAxis dataKey="name" fontSize={11} />
                            <YAxis fontSize={11} />
                            <Tooltip formatter={(v: any) => formatKz(Number(v) || 0)} />
                            <Bar dataKey="valor" fill="#2563eb" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="overflow-x-auto rounded-xl border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Mês/Ano</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tithes.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground">Sem registos.</TableCell>
                              </TableRow>
                            ) : tithes.slice(0, 12).map((t) => (
                              <TableRow key={t.id}>
                                <TableCell>{t.month}/{t.year || '—'}</TableCell>
                                <TableCell>{t.createdAt ? new Date(t.createdAt).toLocaleDateString('pt-AO') : '—'}</TableCell>
                                <TableCell className="text-right font-medium">{formatKz(t.amount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="mural" className="pt-4">
            <MemberBoard />
          </TabsContent>
          <TabsContent value="radio" className="pt-4">
            <RadioPage />
          </TabsContent>
          <TabsContent value="suporte" className="pt-4">
            <MemberSupport />
          </TabsContent>
          <TabsContent value="cartao" className="pt-4">
            <MemberCardView
              member={memberData}
              tithes={tithes}
              {...cardData}
              busy={cardBusy}
              onDownload={async () => {
                setCardBusy(true);
                try {
                  const pdf = await generateMemberCardPdf({ member: memberData, tithes, ...cardData, header: CARD_HEADER_DEFAULT });
                  await savePdf(pdf, `Cartao_${memberData.name.replace(/\s+/g, '_')}.pdf`);
                } finally {
                  setCardBusy(false);
                }
              }}
            />
          </TabsContent>
        </Tabs>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar os meus dados</DialogTitle>
              <DialogDescription>Actualize apenas os campos permitidos.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Telefone</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Endereço</Label>
                <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estado Civil</Label>
                <Input value={editForm.maritalStatus} onChange={(e) => setEditForm({ ...editForm, maritalStatus: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Formação</Label>
                <Input value={editForm.education} onChange={(e) => setEditForm({ ...editForm, education: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Profissão</Label>
                <Input value={editForm.profession} onChange={(e) => setEditForm({ ...editForm, profession: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nome do Cônjuge</Label>
                <Input value={editForm.spouseName} onChange={(e) => setEditForm({ ...editForm, spouseName: e.target.value })} />
              </div>
              <Button className="w-full" onClick={saveMyData} disabled={editSaving}>
                {editSaving ? 'A guardar…' : 'Guardar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
