import { useState } from 'react';
import { deliveryOf, referenceOf } from '../lib/tithes';
import { idxToName } from '../lib/months';
import { prefGet } from '../lib/prefs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Download, FileText, User, Sparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import { savePdf } from '../lib/pdfUtils';
import { saveXlsx, formatMoneyCells } from '../lib/download';
import autoTable from 'jspdf-autotable';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { AIExecutiveAnalysis } from '../components/finances/AIExecutiveAnalysis';
import { formatKz } from '../lib/money';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function Reports() {
  const d = new Date();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[d.getMonth()]);
  const [selectedYear, setSelectedYear] = useState(d.getFullYear().toString());
  
  const [filterType, setFilterType] = useState<'month' | 'period'>('month');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingXlsx, setLoadingXlsx] = useState(false);

  const ptAOA = (v: number) => formatKz(v);

  const generatePDF = async () => {
    setLoadingPdf(true);
    try {
      let tithesSnap, offeringsSnap, expensesSnap;

      if (filterType === 'month') {
        const year = parseInt(selectedYear);
        tithesSnap = await getDocs(query(collection(db, 'tithes'), where('month', '==', selectedMonth), where('year', '==', year)));
        offeringsSnap = await getDocs(query(collection(db, 'offerings'), where('month', '==', selectedMonth), where('year', '==', year)));
        expensesSnap = await getDocs(query(collection(db, 'expenses'), where('month', '==', selectedMonth), where('year', '==', year)));
      } else {
        const startTs = new Date(startDate + 'T00:00:00').getTime();
        const endTs = new Date(endDate + 'T23:59:59').getTime();
        tithesSnap = await getDocs(query(collection(db, 'tithes'), where('createdAt', '>=', startTs), where('createdAt', '<=', endTs)));
        offeringsSnap = await getDocs(query(collection(db, 'offerings'), where('createdAt', '>=', startTs), where('createdAt', '<=', endTs)));
        expensesSnap = await getDocs(query(collection(db, 'expenses'), where('createdAt', '>=', startTs), where('createdAt', '<=', endTs)));
      }
      
      let totalTithes = 0;
      tithesSnap.forEach(doc => totalTithes += doc.data().amount);
      
      let totalOfferings = 0;
      offeringsSnap.forEach(doc => totalOfferings += doc.data().amount);
      
      let totalExpenses = 0;
      const expensesList: string[][] = [];
      expensesSnap.forEach(doc => {
        const data = doc.data();
        totalExpenses += data.amount;
        expensesList.push([data.date ? new Date(data.date).toLocaleDateString('pt-AO') : '-', data.description, data.category, data.responsible, ptAOA(data.amount)]);
      });

      const quotaTithes = totalTithes * 0.37;
      const quotaOfferings = totalOfferings * 0.37;
      const totalRemittance = quotaTithes + quotaOfferings;

      const churchInfoString = prefGet('church-settings');
      let churchName = 'IGREJA LOCAL DE EMANUEL - XANGONGO';
      let denomination = 'IGREJA EVANGÉLICA SINODAL DE ANGOLA';
      let synod = 'SÍNODO ECLESIÁSTICO DO CUNENE';
      let pastorName = '';
      let treasurerName = '';
      let assistantName = '';

      if (churchInfoString) {
        try {
          const info = JSON.parse(churchInfoString);
          if (info.nome) churchName = info.nome;
          if (info.denomination) denomination = info.denomination;
          if (info.synod) synod = info.synod;
          if (info.pastorName) pastorName = info.pastorName;
          if (info.treasurerName) treasurerName = info.treasurerName;
          if (info.assistantName) assistantName = info.assistantName;
        } catch (e) {}
      }

      const docPdf = new jsPDF();
      
      let logoUrl = '';
      if (churchInfoString) {
        try {
          const info = JSON.parse(churchInfoString);
          if (info.logoUrl) logoUrl = info.logoUrl;
        } catch(e) {}
      }

      if (logoUrl) {
        try {
          docPdf.addImage(logoUrl, 'PNG', 15, 15, 22, 22);
        } catch(e) {}
      }

      docPdf.setFontSize(11);
      docPdf.setFont("helvetica", "bold");
      docPdf.text(denomination, 105, 20, { align: 'center' });
      docPdf.text(synod, 105, 26, { align: 'center' });
      docPdf.text(churchName, 105, 32, { align: 'center' });
      docPdf.text('Assistência Administrativa, Social e Finanças', 105, 38, { align: 'center' });
      
      docPdf.setFontSize(12);
      const title = filterType === 'month' 
        ? `Balancete Financeiro do Mês de ${selectedMonth}/${selectedYear}`
        : `Balancete Financeiro do Período de ${new Date(startDate).toLocaleDateString('pt-AO')} a ${new Date(endDate).toLocaleDateString('pt-AO')}`;
      docPdf.text(title, 105, 46, { align: 'center' });

      // Visto box right
      docPdf.setDrawColor(200);
      docPdf.rect(130, 52, 65, 30);
      docPdf.setFontSize(10);
      docPdf.setFont("helvetica", "bold");
      docPdf.text('VISTO', 162.5, 57, { align: 'center' });
      docPdf.text('O PASTOR DA IGREJA', 162.5, 62, { align: 'center' });
      docPdf.setFont("helvetica", "normal");
      docPdf.text(pastorName || '______________________', 162.5, 72, { align: 'center' });
      docPdf.text('_____/______/_______', 162.5, 79, { align: 'center' });

      docPdf.setFontSize(12);
      docPdf.setFont("helvetica", "bold");
      docPdf.text('Saldo Anterior', 14, 90);
      docPdf.setFont("helvetica", "normal");
      
      autoTable(docPdf, {
        startY: 95,
        head: [['Categoria', 'Valor (Kz)']],
        body: [
          ['Total de Dízimos', ptAOA(totalTithes)],
          ['Total de Ofertas', ptAOA(totalOfferings)],
          ['Total Bruto de Entradas', ptAOA(totalTithes + totalOfferings)],
          ['Envio ao Sínodo (37% dos Dízimos)', ptAOA(quotaTithes)],
          ['Envio ao Sínodo (37% das Ofertas)', ptAOA(quotaOfferings)],
          ['Total de Valores Enviados (Saídas)', ptAOA(totalRemittance)],
          ['Total de Despesas Locais (Saídas)', ptAOA(totalExpenses)],
          ['Saldo Líquido', ptAOA((totalTithes + totalOfferings) - (totalExpenses + totalRemittance))],
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });

      const finalY = (docPdf as any).lastAutoTable.finalY || 60;
      
      docPdf.setFontSize(14);
      docPdf.setFont("helvetica", "bold");
      docPdf.text('Detalhe das Despesas', 14, finalY + 15);
      docPdf.setFont("helvetica", "normal");
      
      autoTable(docPdf, {
        startY: finalY + 20,
        head: [['Data', 'Descrição', 'Categoria', 'Responsável', 'Valor']],
        body: expensesList.length > 0 ? expensesList : [['-', 'Sem registo de despesas', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [239, 68, 68] }
      });

      const footerY = (docPdf as any).lastAutoTable.finalY + 20;

      docPdf.setFontSize(11);
      docPdf.text(`Igreja Local de Emanuel em Xangongo, ${new Date().toLocaleDateString('pt-AO')}`, 105, footerY, { align: 'center' });
      
      docPdf.setFont("helvetica", "bold");
      docPdf.text('O Tesoureiro', 40, footerY + 15, { align: 'center' });
      docPdf.text('O Assistente', 170, footerY + 15, { align: 'center' });
      
      docPdf.setFont("helvetica", "normal");
      docPdf.text(treasurerName || '__________________________', 40, footerY + 25, { align: 'center' });
      docPdf.text(assistantName || '__________________________', 170, footerY + 25, { align: 'center' });

      const fileName = filterType === 'month' 
        ? `Relatorio_Pastoral_${selectedMonth}_${selectedYear}.pdf`
        : `Relatorio_Pastoral_${startDate}_a_${endDate}.pdf`;
      await savePdf(docPdf, fileName);
      toast.success("Relatório gerado com sucesso!");

    } catch(err) {
      toast.error("Erro ao gerar relatório");
      handleFirestoreError(err, OperationType.GET, 'multiple-collections');
    } finally {
      setLoadingPdf(false);
    }
  };

  const generateExcel = async () => {
    setLoadingXlsx(true);
    try {
      const year = parseInt(selectedYear);
      
      // Load members
      const membersSnap = await getDocs(collection(db, 'members'));
      const membersMap: Record<string, string> = {};
      membersSnap.forEach(doc => { membersMap[doc.id] = doc.data().name; });

      // Load tithes for the year
      const tithesSnap = await getDocs(query(collection(db, 'tithes'), where('year', '==', year)));
      
      const rows: any[] = [];
      tithesSnap.forEach(doc => {
        const data = doc.data();
        rows.push({
          'Nome do Membro': membersMap[data.memberId] || 'Desconhecido',
          'Tipo de Contribuição': data.contributionType || 'Dízimo',
          'Detalhes': data.contributionDetail || '-',
          'Mês': idxToName(deliveryOf(data as any).month),
          'Ano': data.year,
          'Valor (Kz)': data.amount / 100,
          'Recibo': data.receiptNumber || '-'
        });
      });

      // Load offerings
      const offeringsSnap = await getDocs(query(collection(db, 'offerings'), where('year', '==', year)));
      const oRows: any[] = [];
      offeringsSnap.forEach(doc => {
        const data = doc.data();
        oRows.push({
          'Descrição': data.description,
          'Tipo': data.type,
          'Mês': idxToName(deliveryOf(data as any).month),
          'Ano': data.year,
          'Valor (Kz)': data.amount / 100,
        });
      });
      
      const XLSX = await import('xlsx');
      
      const ws = XLSX.utils.json_to_sheet(rows);
      formatMoneyCells(ws, XLSX);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contribuições Membros");

      const wsOfferings = XLSX.utils.json_to_sheet(oRows);
      formatMoneyCells(wsOfferings, XLSX);
      XLSX.utils.book_append_sheet(wb, wsOfferings, "Ofertas");

      await saveXlsx(XLSX, wb, `Declaracao_Entradas_${selectedYear}.xlsx`);
      toast.success("Planilha gerada com sucesso!");

    } catch(err) {
      toast.error("Erro ao exportar planilha.");
      handleFirestoreError(err, OperationType.GET, 'multiple-collections');
    } finally {
      setLoadingXlsx(false);
    }
  };

  const generateAnnualPDF = async () => {
    setLoadingXlsx(true);
    try {
      const year = selectedYear;

      // Calculate totals for the year
      const tithesSnap = await getDocs(query(collection(db, 'tithes'), where('year', '==', parseInt(year))));
      let totalTithes = 0;
      tithesSnap.forEach(d => totalTithes += Number(d.data().amount));

      const offeringsSnap = await getDocs(query(collection(db, 'offerings'), where('year', '==', parseInt(year))));
      let totalOfferings = 0;
      offeringsSnap.forEach(d => totalOfferings += Number(d.data().amount));

      const expensesSnap = await getDocs(query(collection(db, 'expenses'), where('year', '==', parseInt(year))));
      let totalExpenses = 0;
      const expensesList: any[] = [];
      expensesSnap.forEach(d => {
        const data = d.data();
        totalExpenses += Number(data.amount) || 0;
        expensesList.push([
          data.date ? new Date(data.date).toLocaleDateString('pt-AO') : (idxToName(deliveryOf(data as any).month) + '/' + (deliveryOf(data as any).year || data.year)),
          data.description,
          data.category,
          data.responsible || '-',
          ptAOA(data.amount)
        ]);
      });

      const quotaTithes = totalTithes * 0.37;
      const quotaOfferings = totalOfferings * 0.37;
      const totalRemittance = quotaTithes + quotaOfferings;

      const churchInfoString = prefGet('church-settings');
      let churchName = 'IGREJA LOCAL DE EMANUEL - XANGONGO';
      let denomination = 'IGREJA EVANGÉLICA SINODAL DE ANGOLA';
      let synod = 'SÍNODO ECLESIÁSTICO DO CUNENE';
      let pastorName = '';
      let treasurerName = '';
      let assistantName = '';

      if (churchInfoString) {
        try {
          const info = JSON.parse(churchInfoString);
          if (info.nome) churchName = info.nome;
          if (info.denomination) denomination = info.denomination;
          if (info.synod) synod = info.synod;
          if (info.pastorName) pastorName = info.pastorName;
          if (info.treasurerName) treasurerName = info.treasurerName;
          if (info.assistantName) assistantName = info.assistantName;
        } catch (e) {}
      }

      const docPdf = new jsPDF();
      
      let logoUrl = '';
      if (churchInfoString) {
        try {
          const info = JSON.parse(churchInfoString);
          if (info.logoUrl) logoUrl = info.logoUrl;
        } catch(e) {}
      }

      if (logoUrl) {
        try {
          docPdf.addImage(logoUrl, 'PNG', 15, 15, 22, 22);
        } catch(e) {}
      }

      docPdf.setFontSize(11);
      docPdf.setFont("helvetica", "bold");
      docPdf.text(denomination, 105, 20, { align: 'center' });
      docPdf.text(synod, 105, 26, { align: 'center' });
      docPdf.text(churchName, 105, 32, { align: 'center' });
      docPdf.text('Assistência Administrativa, Social e Finanças', 105, 38, { align: 'center' });

      docPdf.setFontSize(12);
      docPdf.text('Balancete Financeiro do Ano de ' + year, 105, 46, { align: 'center' });

      // Visto box right
      docPdf.setDrawColor(200);
      docPdf.rect(130, 52, 65, 30);
      docPdf.setFontSize(10);
      docPdf.setFont("helvetica", "bold");
      docPdf.text('VISTO', 162.5, 57, { align: 'center' });
      docPdf.text('O PASTOR DA IGREJA', 162.5, 62, { align: 'center' });
      docPdf.setFont("helvetica", "normal");
      docPdf.text(pastorName || '______________________', 162.5, 72, { align: 'center' });
      docPdf.text('_____/______/_______', 162.5, 79, { align: 'center' });

      docPdf.setFontSize(12);
      docPdf.setFont("helvetica", "bold");
      docPdf.text('Saldo Anterior', 14, 90);
      docPdf.setFont("helvetica", "normal");
      
      autoTable(docPdf, {
        startY: 95,
        head: [['Categoria', 'Valor (Kz)']],
        body: [
          ['Total de Dízimos', ptAOA(totalTithes)],
          ['Total de Ofertas', ptAOA(totalOfferings)],
          ['Total Geral Anual de Entradas (Bruto)', ptAOA(totalTithes + totalOfferings)],
          ['Total Envio ao Sínodo (37% dos Dízimos)', ptAOA(quotaTithes)],
          ['Total Envio ao Sínodo (37% das Ofertas)', ptAOA(quotaOfferings)],
          ['Total de Valores Enviados (Saídas)', ptAOA(totalRemittance)],
          ['Total de Despesas Locais (Saídas)', ptAOA(totalExpenses)],
          ['Saldo Líquido Anual', ptAOA((totalTithes + totalOfferings) - (totalExpenses + totalRemittance))]
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });

      const finalY = (docPdf as any).lastAutoTable.finalY || 135;
      
      docPdf.setFontSize(14);
      docPdf.setFont("helvetica", "bold");
      docPdf.text('Métrica das Despesas Anuais', 14, finalY + 15);
      docPdf.setFont("helvetica", "normal");
      
      autoTable(docPdf, {
        startY: finalY + 20,
        head: [['Período', 'Descrição', 'Categoria', 'Responsável', 'Valor']],
        body: expensesList.length > 0 ? expensesList : [['-', 'Sem registo de despesas', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [239, 68, 68] }
      });

      const footerY = (docPdf as any).lastAutoTable.finalY + 20;

      docPdf.setFontSize(11);
      docPdf.text(`Igreja Local de Emanuel em Xangongo, ${new Date().toLocaleDateString('pt-AO')}`, 105, footerY, { align: 'center' });
      
      docPdf.setFont("helvetica", "bold");
      docPdf.text('O Tesoureiro', 40, footerY + 15, { align: 'center' });
      docPdf.text('O Assistente', 170, footerY + 15, { align: 'center' });
      
      docPdf.setFont("helvetica", "normal");
      docPdf.text(treasurerName || '__________________________', 40, footerY + 25, { align: 'center' });
      docPdf.text(assistantName || '__________________________', 170, footerY + 25, { align: 'center' });

      await savePdf(docPdf, `Relatorio_Pastoral_Anual_${selectedYear}.pdf`);
      toast.success("Relatório anual gerado com sucesso!");

    } catch(err) {
      toast.error("Erro ao gerar relatório anual.");
      handleFirestoreError(err, OperationType.GET, 'multiple-collections');
    } finally {
      setLoadingXlsx(false);
    }
  };

  const generateIndividualPDF = async () => {
    // Generate simple PDF logic for an individual's tithes.
    if (!selectedMemberReport) {
      toast.error('Seleccione um membro primeiro.');
      return;
    }
    setLoadingPdf(true);
    try {
      const yearInt = parseInt(selectedYear);
      const tithesSnap = await getDocs(query(collection(db, 'tithes'), where('memberId', '==', selectedMemberReport), where('year', '==', yearInt)));
      const memberDoc = await getDocs(query(collection(db, 'members'), where('__name__', '==', selectedMemberReport)));
      const memberName = memberDoc.docs[0]?.data().name || 'Membro';

      let totalTithes = 0;
      const historyList: any[] = [];
      tithesSnap.forEach(doc => {
         const d = doc.data();
         totalTithes += d.amount;
         const _r = referenceOf(d as any); const refDate = _r.month ? `${_r.month}/${_r.year}` : '-';
         historyList.push([d.contributionType || 'Dízimo', d.month, refDate, d.receiptNumber || '-', ptAOA(d.amount)]);
      });

      const churchInfoString = prefGet('church-settings');
      let churchName = 'Igreja Evangélica Sinodal de Angola - Emanuel, Xangongo';
      if (churchInfoString) {
        try {
          const info = JSON.parse(churchInfoString);
          if (info.nome) churchName = info.nome;
        } catch (e) {}
      }

      const docPdf = new jsPDF();
      docPdf.setFontSize(20);
      docPdf.text(`Extrato de Contribuições - ${selectedYear}`, 14, 22);
      docPdf.setFontSize(12);
      docPdf.text(churchName, 14, 30);
      docPdf.text(`Membro: ${memberName}`, 14, 36);

      autoTable(docPdf, {
        startY: 45,
        head: [['Tipo', 'Mês Registo', 'Ref.', 'Recibo', 'Valor (Kz)']],
        body: historyList.length > 0 ? historyList : [['-', '-', '-', '-', 'Sem contribuições']],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });

      docPdf.text(`Total no Ano: ${ptAOA(totalTithes)}`, 14, (docPdf as any).lastAutoTable.finalY + 10);
      await savePdf(docPdf, `Extrato_${memberName.replace(/\s+/g,'_')}_${selectedYear}.pdf`);
      toast.success("Extrato gerado com sucesso!");
    } catch(e) {
      toast.error("Erro ao gerar extrato.");
      handleFirestoreError(e, OperationType.GET, 'tithes');
    } finally {
      setLoadingPdf(false);
    }
  };

  const [members, setMembers] = useState<{id: string, name: string}[]>([]);
  const [selectedMemberReport, setSelectedMemberReport] = useState<string>('');

  // Load members on mount
  useState(() => {
    getDocs(collection(db, 'members')).then(snap => {
       setMembers(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Relatórios e Recibos</h2>
          <p className="text-muted-foreground">Emissão de documentos oficiais e relatórios pastorais.</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[100px]"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>
              {['2024', '2025', '2026', '2027'].map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="gerais" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="gerais"><FileText className="w-4 h-4 mr-2" /> Relatórios Gerais</TabsTrigger>
          <TabsTrigger value="individuais"><User className="w-4 h-4 mr-2" /> Extratos Individuais</TabsTrigger>
          <TabsTrigger value="ia-insights"><Sparkles className="w-4 h-4 mr-2 text-purple-600" /> Parecer Executivo IA</TabsTrigger>
        </TabsList>
        
        <TabsContent value="ia-insights" className="m-0 space-y-6">
          <AIExecutiveAnalysis
            financialStats={{
              totalTithes: 0,
              totalOfferings: 0,
              totalExpenses: 0,
              balance: 0,
              totalMembers: members.length,
              activeMembers: members.length,
              year: parseInt(selectedYear),
            }}
          />
        </TabsContent>
        
        <TabsContent value="gerais" className="m-0 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Relatório Financeiro</CardTitle>
                <CardDescription>Gera o PDF com todos os movimentos e saldos do período seleccionado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="flex bg-muted p-1 rounded-md">
                   <button 
                     className={`flex-1 text-sm py-1.5 rounded-md ${filterType === 'month' ? 'bg-background shadow-sm' : ''}`}
                     onClick={() => setFilterType('month')}
                   >Por Mês</button>
                   <button 
                     className={`flex-1 text-sm py-1.5 rounded-md ${filterType === 'period' ? 'bg-background shadow-sm' : ''}`}
                     onClick={() => setFilterType('period')}
                   >Período (Datas)</button>
                 </div>
                 
                 {filterType === 'period' && (
                   <div className="flex gap-2 items-center">
                     <div className="flex-1 space-y-1">
                       <Label className="text-xs">Data Início</Label>
                       <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                     </div>
                     <div className="flex-1 space-y-1">
                       <Label className="text-xs">Data Fim</Label>
                       <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                     </div>
                   </div>
                 )}

                 <Button onClick={generatePDF} disabled={loadingPdf} className="w-full gap-2">
                   <Download className="h-4 w-4" /> 
                   {loadingPdf ? 'A gerar...' : 'Gerar Relatório (PDF)'}
                 </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Declaração Anual de Entradas</CardTitle>
                <CardDescription>Geração de planilha Excel com dízimos e ofertas detalhados do ano seleccionado.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                 <Button onClick={generateAnnualPDF} disabled={loadingXlsx} variant="default" className="w-full gap-2">
                   <Download className="h-4 w-4" /> 
                   {loadingXlsx ? 'A gerar...' : 'Exportar Relatório (PDF)'}
                 </Button>
                 <Button onClick={generateExcel} disabled={loadingXlsx} variant="outline" className="w-full gap-2">
                   <Download className="h-4 w-4" /> 
                   {loadingXlsx ? 'A gerar...' : 'Exportar Planilha (XLSX)'}
                 </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="individuais" className="m-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Extrato Individual de Contribuições</CardTitle>
              <CardDescription>Gerar histórico de dízimos para um membro específico.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
               <Select value={selectedMemberReport} onValueChange={setSelectedMemberReport}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccione o membro" /></SelectTrigger>
                  <SelectContent>
                     {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
               </Select>
               <Button onClick={generateIndividualPDF} disabled={loadingPdf || !selectedMemberReport} variant="secondary" className="gap-2">
                 <Download className="h-4 w-4" /> Exportar PDF
               </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
