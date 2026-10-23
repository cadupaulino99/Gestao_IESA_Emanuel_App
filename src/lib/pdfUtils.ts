import { jsPDF } from 'jspdf';
import { prefGet } from './prefs';
import { Member } from '../types';

export const generateMembershipCard = async (member: Member) => {
  const docPdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [85.6, 53.98] // ID Card size (CR80)
  });

  // Background (Dark Blue)
  docPdf.setFillColor(15, 23, 42); 
  docPdf.rect(0, 0, 85.6, 53.98, 'F');
  
  // Bottom white area
  docPdf.setFillColor(255, 255, 255);
  docPdf.rect(0, 16, 85.6, 38.98, 'F');

  // Header Text
  docPdf.setTextColor(255, 255, 255);
  docPdf.setFontSize(10);
  docPdf.setFont("helvetica", "bold");
  
  // Try to get church name from localStorage else default
  let churchName = "IGREJA LOCAL";
  let logoUrl = "/logo-iesa.png"; // logotipo embutido no APK
  const saved = prefGet('church-settings');
  if (saved) {
    try {
      const info = JSON.parse(saved);
      if (info.nome) churchName = info.nome;
      if (info.logoUrl) logoUrl = info.logoUrl;
    } catch(e) {}
  }

  if (logoUrl) {
    try {
      const response = await fetch(logoUrl);
      const blob = await response.blob();
      const base64data = await new Promise<string>((resolve) => {
         const reader = new FileReader();
         reader.onloadend = () => resolve(reader.result as string);
         reader.readAsDataURL(blob);
      });
      const imgType = base64data.substring(5, base64data.indexOf(";")).split("/")[1].toUpperCase();
      const finalType = imgType === 'JPG' ? 'JPEG' : imgType;
      docPdf.addImage(base64data, finalType, 2, 2, 12, 12);
      // adjust text to be more right/center
      docPdf.setFontSize(8);
      docPdf.text(churchName.substring(0, 45), (85.6 + 12) / 2, 8, { align: 'center' });
      docPdf.setFontSize(6);
      docPdf.text("CARTÃO DE MEMBRO", (85.6 + 12) / 2, 12, { align: 'center' });
    } catch (e) {
      // Fallback if image fails
      docPdf.setFontSize(8);
      docPdf.text(churchName.substring(0, 45), 85.6 / 2, 8, { align: 'center' });
      docPdf.setFontSize(6);
      docPdf.text("CARTÃO DE MEMBRO", 85.6 / 2, 12, { align: 'center' });
    }
  } else {
    docPdf.setFontSize(8);
    docPdf.text(churchName.substring(0, 45), 85.6 / 2, 8, { align: 'center' });
    docPdf.setFontSize(6);
    docPdf.text("CARTÃO DE MEMBRO", 85.6 / 2, 12, { align: 'center' });
  }

  // Body Text
  docPdf.setTextColor(15, 23, 42);
  docPdf.setFontSize(12);
  docPdf.setFont("helvetica", "bold");
  docPdf.text(member.name.substring(0, 35), 5, 25);
  
  docPdf.setFontSize(8);
  docPdf.setFont("helvetica", "normal");
  docPdf.text('Cargo / Categoria:', 5, 34);
  docPdf.setFont("helvetica", "bold");
  docPdf.text(member.groupCell || 'Membro', 5, 39);
  
  docPdf.setFontSize(8);
  docPdf.setFont("helvetica", "normal");
  docPdf.text('Data de Baptismo:', 45, 34);
  docPdf.setFont("helvetica", "bold");
  const [y, m, d] = (member.baptismDate || '').split('-');
  const bd = d && m && y ? `${d}/${m}/${y}` : '-';
  docPdf.text(bd, 45, 39);

  docPdf.setFontSize(6);
  docPdf.setFont("helvetica", "normal");
  docPdf.setTextColor(100, 100, 100);
  docPdf.text('ID: ' + member.id.substring(0, 8).toUpperCase(), 5, 49);
  docPdf.text('Emitido em: ' + new Date().toLocaleDateString('pt-AO'), 45, 49);

  docPdf.save(`Cartao_Membro_${member.name.replace(/\s+/g,'_')}.pdf`);
};

/* ------------------------------------------------------------------ */
/* Cartão de membro — PDF fiel às duas faces do cartão de papel        */
/* (página 1 = frente: dados, comunhão, donativos;                     */
/*  página 2 = verso: renovações, foto, assinatura, dízimos, Mal 3:10) */
/* ------------------------------------------------------------------ */
import autoTable from 'jspdf-autotable';
import {
  CommunionMark,
  Donation,
  Renewal,
  Tithe,
  CardHeader,
  MONTHS_SHORT,
  MONTHS_IDX,
} from '../types';

export interface MemberCardPdfData {
  communions: CommunionMark[];
  donations: Donation[];
  tithes: Tithe[];
  renewals: Renewal[];
}

const MESES_LONG = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const pdfDate = (iso?: string | null) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || '—';
};
const pdfDateLong = (iso?: string | null) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} de ${MESES_LONG[Number(m[2]) - 1]} de ${m[1]}` : iso || '—';
};
const pdfMoney = (n: number) => (n || 0).toLocaleString('pt-AO', { maximumFractionDigits: 2 });

function drawSeal(doc: jsPDF, x: number, y: number, r: number) {
  doc.setFillColor(180, 35, 42);
  doc.circle(x, y, r, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.circle(x, y, r * 0.82, 'S');
  doc.setFillColor(255, 255, 255);
  doc.rect(x - 1.6, y - r * 0.62, 3.2, r * 1.24, 'F');
  doc.rect(x - r * 0.48, y - r * 0.28, r * 0.96, 3.2, 'F');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('IESA', x, y + r * 0.62, { align: 'center' });
}

function yearsOfPdf(d: MemberCardPdfData): number[] {
  const ys = new Set<number>();
  d.communions.forEach((c) => c.year && ys.add(c.year));
  d.donations.forEach((x) => x.referenceYear && ys.add(x.referenceYear));
  d.tithes.forEach((t) => t.referenceYear && ys.add(t.referenceYear));
  if (ys.size === 0) ys.add(new Date().getFullYear());
  return [...ys].sort((a, b) => a - b).slice(-4);
}

export const generateMemberCardPdf = async (
  member: Member,
  data: MemberCardPdfData,
  header: CardHeader
) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const years = yearsOfPdf(data);
  const W = 297;
  const paper = () => {
    doc.setFillColor(238, 245, 238);
    doc.rect(0, 0, W, 210, 'F');
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    doc.rect(6, 6, W - 12, 198, 'S');
  };
  const label = (t: string, x: number, y: number, w: number, v: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(40, 40, 40);
    doc.text(t, x, y);
    const lw = doc.getTextWidth(t);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 40, 120);
    doc.text(v || '—', x + lw + 1.5, y);
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.2);
    doc.line(x + lw + 1, y + 1.2, x + w, y + 1.2);
  };

  /* ─────────── FRENTE ─────────── */
  paper();
  drawSeal(doc, 22, 24, 12);
  label('Sínodo Eclesiástico de', 40, 18, 90, header.sinodo);
  label('Igreja Local de', 40, 26, 90, header.igreja);
  label('Província de', 40, 34, 90, header.provincia);

  doc.setFillColor(200, 200, 200);
  doc.rect(230, 12, 55, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text('CARTÃO DE MEMBRO', 257.5, 17, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(20, 40, 120);
  doc.text(`Nº ${member.memberNumber || '—'}`, 257.5, 26, { align: 'center' });

  let y = 46;
  const COL2 = 150;
  label('Nome', 12, y, 270, member.name); y += 8;
  label('Filho de', 12, y, 120, member.fatherName || '');
  label('e de', COL2, y, 120, member.motherName || ''); y += 8;
  label('Natural de', 12, y, 120, member.placeOfBirth || '');
  label('Nascido aos', COL2, y, 120, member.birthDate ? pdfDateLong(member.birthDate) : ''); y += 8;
  label('Residente em', 12, y, 120, member.address || '');
  label('BI nº', COL2, y, 120, member.documentNumber || ''); y += 8;
  label('Emitido aos', 12, y, 120, member.issueDate ? pdfDate(member.issueDate) : '');
  label('Estado Civil', COL2, y, 120, member.maritalStatus || ''); y += 8;
  label('Baptizado aos', 12, y, 120, member.baptismDate ? pdfDate(member.baptismDate) : '');
  label('Recebido como membro aos', COL2, y, 120, member.joinDate ? pdfDate(member.joinDate) : ''); y += 6;

  /* Comunhão */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text('PARTICIPOU DA COMUNHÃO', 12, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: 12, right: 12 },
    head: [['Mês', ...years.map(String)]],
    body: MONTHS_IDX.map((mi, i) => [
      `${MONTHS_SHORT[i]}.`,
      ...years.map((yr) => data.communions.find((c) => c.year === yr && c.month === mi)?.mark || ''),
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.1, halign: 'center' },
    headStyles: { fillColor: [210, 215, 210], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: {},
    theme: 'grid',
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  /* Donativos voluntários */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ENTREGA DE DONATIVOS VOLUNTÁRIOS', 12, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: 12, right: 12 },
    head: [['Mês', ...years.map(String)]],
    body: [
      ...MONTHS_IDX.map((mi, i) => [
        `${MONTHS_SHORT[i]}.`,
        ...years.map((yr) => {
          const v = data.donations
            .filter((d) => d.referenceYear === yr && d.referenceMonth === mi)
            .reduce((a, b) => a + b.amount, 0);
          return v ? pdfMoney(v) : '';
        }),
      ]),
      ['Total', ...years.map((yr) => pdfMoney(data.donations.filter((d) => d.referenceYear === yr).reduce((a, b) => a + b.amount, 0)))],
    ],
    styles: { fontSize: 7.5, cellPadding: 1.1, halign: 'center' },
    headStyles: { fillColor: [210, 215, 210], textColor: 20, fontStyle: 'bold' },
    theme: 'grid',
  });

  /* ─────────── VERSO ─────────── */
  doc.addPage('a4', 'landscape');
  paper();
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  doc.text('Este cartão será renovado anualmente, e o portador será obrigado a entregá-lo em caso de desistência.', 12, 14);

  /* Renovações */
  autoTable(doc, {
    startY: 18,
    margin: { left: 12 },
    tableWidth: 120,
    head: [['RENOVAÇÕES', 'Rubrica do Pastor']],
    body:
      data.renewals.length === 0
        ? [['—', '']]
        : [...data.renewals]
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .slice(-4)
            .map((r) => [`Renovado aos ${pdfDate(r.date)}`, r.pastorSign || '']),
    styles: { fontSize: 7.5, cellPadding: 1.4 },
    headStyles: { fillColor: [210, 215, 210], textColor: 20, fontStyle: 'bold' },
    theme: 'grid',
  });
  let y2 = (doc as any).lastAutoTable.finalY + 8;

  /* Fotografia + assinatura */
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.3);
  doc.rect(12, y2, 30, 38, 'S');
  if (member.photoBase64) {
    try {
      doc.addImage(`data:image/jpeg;base64,${member.photoBase64}`, 'JPEG', 12.5, y2 + 0.5, 29, 37);
    } catch { /* foto inválida: fica a moldura vazia */ }
  } else {
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.text('fotografia', 27, y2 + 19, { align: 'center' });
  }
  doc.setLineWidth(0.3);
  doc.line(50, y2 + 30, 120, y2 + 30);
  doc.setFontSize(7);
  doc.setTextColor(70, 70, 70);
  doc.text('Assinatura do Titular', 50, y2 + 34);

  /* Dízimos */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text('ENTREGA DE DÍZIMOS', 140, 18);
  autoTable(doc, {
    startY: 21,
    margin: { left: 140, right: 12 },
    head: [['Mês', ...years.map(String)]],
    body: [
      ...MONTHS_IDX.map((mi, i) => {
        return [
          `${MONTHS_SHORT[i]}.`,
          ...years.map((yr) => {
            const rows = data.tithes.filter((t) => t.referenceYear === yr && t.referenceMonth === mi);
            const total = rows.reduce((a, b) => a + b.amount, 0);
            return total ? `${pdfMoney(total)}${rows.length > 1 ? ` (${rows.length}×)` : ''}` : '';
          }),
        ];
      }),
      ['Total', ...years.map((yr) => pdfMoney(data.tithes.filter((t) => t.referenceYear === yr).reduce((a, b) => a + b.amount, 0)))],
    ],
    styles: { fontSize: 7.5, cellPadding: 1.1, halign: 'center' },
    headStyles: { fillColor: [210, 215, 210], textColor: 20, fontStyle: 'bold' },
    theme: 'grid',
  });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text('“Trazei todos os dízimos à casa do tesouro…”  Mal. 3:10', W / 2, 200, { align: 'center' });

  doc.save(`cartao-membro-${(member.name || 'membro').toLowerCase().replace(/\s+/g, '-')}.pdf`);
};
