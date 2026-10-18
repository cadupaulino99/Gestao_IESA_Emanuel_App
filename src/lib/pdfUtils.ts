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
  let logoUrl = "logo-iesa.png"; // logotipo embutido no APK
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
