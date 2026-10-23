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
} from "lucide-react";
import { collection, query, where, getDocs, addDoc } from "firebase/firestore";
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
import MemberCardView from "../components/members/MemberCardView";
import { generateMemberCardPdf } from "../lib/pdfUtils";
import {
  CommunionMark,
  Donation,
  Renewal,
  CARD_HEADER_DEFAULT,
} from "../types";

export default function MemberPortal() {
  const { memberData, signOut } = useAuth();
  const [tithes, setTithes] = useState<Tithe[]>([]);
  const [loading, setLoading] = useState(true);

  // Update request state
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    telefone: "",
    endereco: "",
    estadoCivil: "",
  });
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [cardData, setCardData] = useState<{
    communions: CommunionMark[];
    donations: Donation[];
    renewals: Renewal[];
  }>({ communions: [], donations: [], renewals: [] });
  const [cardBusy, setCardBusy] = useState(false);

  useEffect(() => {
    if (!memberData) return;
    const fetchTithes = async () => {
      try {
        const q = query(
          collection(db, "tithes"),
          where("memberId", "==", memberData.id),
        );
        const snap = await getDocs(q);
        const tData = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Tithe,
        );
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

    const fetchAnnouncements = async () => {
      try {
        const q = query(
          collection(db, "announcements"),
          where("active", "==", true),
        );
        const snap = await getDocs(q);
        setAnnouncements(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => b.createdAt - a.createdAt),
        );
      } catch (error) {
        console.log(error);
      }
    };

    const fetchCard = async () => {
      try {
        const [c, d, r] = await Promise.all([
          getDocs(query(collection(db, "communions"), where("memberId", "==", memberData.id))),
          getDocs(query(collection(db, "donations"), where("memberId", "==", memberData.id))),
          getDocs(query(collection(db, "renewals"), where("memberId", "==", memberData.id))),
        ]);
        setCardData({
          communions: c.docs.map((x) => ({ id: x.id, ...x.data() }) as CommunionMark),
          donations: d.docs.map((x) => ({ id: x.id, ...x.data() }) as Donation),
          renewals: r.docs.map((x) => ({ id: x.id, ...x.data() }) as Renewal),
        });
      } catch (error) {
        // coleções novas: se as regras ainda não forem publicadas, não trava o portal
        console.log("cartão:", error);
      }
    };

    fetchTithes();
    fetchAnnouncements();
    fetchCard();
  }, [memberData]);

  if (!memberData) return null;

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUpdate(true);
    try {
      await addDoc(collection(db, "pedidos_atualizacao"), {
        memberId: memberData.id,
        memberName: memberData.name,
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

  const handleGenerateExtract = () => {
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
    docPdf.text(`Gerado em: ${new Date().toLocaleDateString("pt-AO")}`, 14, 34);

    const tableData = tithes.map((t) => [
      `${t.month}/${t.year || "-"}`,
      t.createdAt ? new Date(t.createdAt).toLocaleDateString("pt-AO") : "-",
      new Intl.NumberFormat("pt-AO", {
        style: "currency",
        currency: "AOA",
      }).format(t.amount),
    ]);

    autoTable(docPdf, {
      startY: 40,
      head: [["Mês/Ano Ref.", "Data de Pagamento", "Valor"]],
      body: tableData,
    });

    docPdf.save(`Extrato_${memberData.name.replace(/\s+/g, "_")}.pdf`);
  };

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const chartData = [];
  for (let i = 5; i >= 0; i--) {
    let mDate = new Date(currentYear, currentMonth - i, 1);
    const mName = mDate.toLocaleString("pt-AO", { month: "short" });
    const mMonth = String(mDate.getMonth() + 1).padStart(2, "0");
    const yYear = mDate.getFullYear();

    const tithesSum = tithes
      .filter((t: any) => t.month === mMonth && t.year === yYear)
      .reduce((acc, curr) => acc + curr.amount, 0);

    chartData.push({
      name: `${mName}/${yYear.toString().substring(2)}`,
      valor: tithesSum,
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white dark:bg-card p-4 rounded-xl border shadow-sm">
          <div>
            <h1 className="text-2xl font-bold">Portal do Membro</h1>
            <p className="text-muted-foreground">
              Bem-vindo(a), {memberData.name}
            </p>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3">
            <TabsTrigger value="dados">Geral & Finanças</TabsTrigger>
            <TabsTrigger value="mural">Mural de Avisos</TabsTrigger>
            <TabsTrigger value="cartao" className="gap-1.5">
              <CreditCard className="h-4 w-4" /> O meu cartão
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-6 pt-4">
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="md:col-span-1 border shadow-sm">
                <CardHeader>
                  <CardTitle>Meus Dados</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-muted-foreground block text-sm">
                      Estado
                    </span>
                    <Badge
                      variant={
                        memberData.status === "Activo" ? "default" : "secondary"
                      }
                    >
                      {memberData.status || "Activo"}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-sm">
                      Célula / Grupo
                    </span>
                    <span className="font-medium">
                      {memberData.groupCell || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-sm">
                      Data de Baptismo
                    </span>
                    <span className="font-medium">
                      {memberData.baptismDate
                        ? new Date(memberData.baptismDate).toLocaleDateString(
                            "pt-AO",
                          )
                        : "-"}
                    </span>
                  </div>
                  <div className="pt-4 space-y-2">
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => generateMembershipCard(memberData)}
                    >
                      <CreditCard className="h-4 w-4 mr-2 text-emerald-600" />
                      Baixar Cartão
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={handleGenerateExtract}
                      disabled={tithes.length === 0}
                    >
                      <FileText className="h-4 w-4 mr-2 text-blue-600" />
                      Extrato Anual
                    </Button>

                    <Dialog
                      open={isUpdateOpen}
                      onOpenChange={(open) => {
                        if (open) {
                          setUpdateForm({
                            telefone: memberData.phone || "",
                            endereco: memberData.address || "",
                            estadoCivil: memberData.maritalStatus || "",
                          });
                        }
                        setIsUpdateOpen(open);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          className="w-full justify-start"
                          variant="outline"
                        >
                          <Settings2 className="h-4 w-4 mr-2 text-muted-foreground" />
                          Pedir Atualização de Dados
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Atualização de Dados</DialogTitle>
                          <DialogDescription>
                            Caso os seus dados tenham mudado, preencha abaixo
                            para solicitar a alteração.
                          </DialogDescription>
                        </DialogHeader>
                        <form
                          onSubmit={handleUpdateSubmit}
                          className="space-y-4"
                        >
                          <div className="space-y-2">
                            <Label>Telefone</Label>
                            <Input
                              value={updateForm.telefone}
                              onChange={(e) =>
                                setUpdateForm({
                                  ...updateForm,
                                  telefone: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Endereço</Label>
                            <Input
                              value={updateForm.endereco}
                              onChange={(e) =>
                                setUpdateForm({
                                  ...updateForm,
                                  endereco: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Estado Civil</Label>
                            <Select
                              value={updateForm.estadoCivil}
                              onValueChange={(v) =>
                                setUpdateForm({ ...updateForm, estadoCivil: v })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Solteiro(a)">
                                  Solteiro(a)
                                </SelectItem>
                                <SelectItem value="Casado(a)">
                                  Casado(a)
                                </SelectItem>
                                <SelectItem value="Viúvo(a)">
                                  Viúvo(a)
                                </SelectItem>
                                <SelectItem value="Divorciado(a)">
                                  Divorciado(a)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={submittingUpdate}
                          >
                            {submittingUpdate ? "A enviar..." : "Enviar Pedido"}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2 border shadow-sm">
                <CardHeader>
                  <CardTitle>Meu Histórico Financeiro</CardTitle>
                  <CardDescription>
                    Visualização dos dízimos registados nos últimos 6 meses
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      A carregar registos...
                    </div>
                  ) : (
                    <>
                      <div className="w-full mb-6 relative">
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={chartData}>
                            <XAxis
                              dataKey="name"
                              fontSize={12}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              fontSize={12}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => `${value / 1000}k`}
                            />
                            <Tooltip
                              formatter={(value: number) =>
                                new Intl.NumberFormat("pt-AO", {
                                  style: "currency",
                                  currency: "AOA",
                                }).format(value)
                              }
                              cursor={{ fill: "transparent" }}
                            />
                            <Bar
                              dataKey="valor"
                              fill="#2563eb"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <h4 className="font-medium mb-3">Todos os Registos</h4>
                      {tithes.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">
                          Nenhum dízimo registado no seu perfil.
                        </div>
                      ) : (
                        <div className="border rounded-md">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Mês/Ano Ref.</TableHead>
                                <TableHead>Data de Registo</TableHead>
                                <TableHead>Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tithes.slice(0, 10).map((t: any) => (
                                <TableRow key={t.id}>
                                  <TableCell>
                                    {t.month}/{t.year || "-"}
                                  </TableCell>
                                  <TableCell>
                                    {t.createdAt
                                      ? new Date(
                                          t.createdAt,
                                        ).toLocaleDateString("pt-AO")
                                      : "-"}
                                  </TableCell>
                                  <TableCell>
                                    {new Intl.NumberFormat("pt-AO", {
                                      style: "currency",
                                      currency: "AOA",
                                    }).format(t.amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="mural" className="pt-4">
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-bold">Mural de Avisos</h2>
              <p className="text-muted-foreground">
                Fique atualizado com os anúncios e informações da igreja.
              </p>
              {announcements.length === 0 && !loading && (
                <div className="text-center py-12 text-muted-foreground border rounded-lg bg-white/50 border-dashed">
                  Não há avisos no momento.
                </div>
              )}
              {announcements.map((ann) => (
                <Card key={ann.id}>
                  <CardHeader className="pb-2">
                    <CardTitle>{ann.title}</CardTitle>
                    <CardDescription>
                      {new Date(ann.createdAt).toLocaleDateString("pt-AO")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="whitespace-pre-wrap">
                    {ann.content}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="cartao" className="space-y-4 pt-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Réplica digital do seu cartão de papel: dados pessoais, comunhão,
                donativos voluntários, dízimos e renovações. Se faltar algum dado,
                use «Pedir atualização» no separador anterior.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={cardBusy}
                className="gap-2"
                onClick={async () => {
                  setCardBusy(true);
                  try {
                    await generateMemberCardPdf(memberData as any, { ...cardData, tithes }, CARD_HEADER_DEFAULT);
                    toast.success("Cartão em PDF gerado (frente + verso).");
                  } catch (e: any) {
                    toast.error(e?.message || "Erro ao gerar o PDF.");
                  } finally {
                    setCardBusy(false);
                  }
                }}
              >
                <Download className="h-4 w-4" /> Descarregar PDF
              </Button>
            </div>
            <MemberCardView
              member={memberData as any}
              data={{ ...cardData, tithes }}
              header={CARD_HEADER_DEFAULT}
              compact
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
