import React, { useEffect, useState } from 'react';
import DocumentReaderModal, { type DocKind } from '../components/documents/DocumentReaderModal';
import { prefGet } from '../lib/prefs';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, query, getDocs, addDoc, doc, deleteDoc, updateDoc, where, setDoc, getDoc, orderBy, limit, startAfter, startAt, endAt } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { FormSection } from '../components/ui/form';
import { EmptyState } from '../components/ui/state-view';
import { Skeleton } from '../components/ui/skeleton';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Trash2, Info, Download, Pencil, FileText, Check, ChevronsUpDown, Printer, MessageCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { toMonthIdx, idxToName } from '../lib/months';
import { classifyTitheDuplicate, deliveryOf, referenceOf, describeTithe } from '../lib/tithes';
import { saveBlob, dataUrlToBlob, saveXlsx, openExternal, formatMoneyCells } from '../lib/download';
import { savePdf } from '../lib/pdfUtils';
import { moveToTrash, restoreFromTrash, isRecordLocked } from '../lib/trash';
import { parseKzInput, formatKz } from '../lib/money';
import MoneyText from '../components/MoneyText';
import { useConfirm } from '../context/ConfirmContext';
import { useAuth } from '../context/AuthContext';
import { jsPDF } from 'jspdf';
import { Checkbox } from '../components/ui/checkbox';
import { Switch } from '../components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { cn } from '../lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { useDevice } from '../hooks/useDevice';

import { YearlyStats } from '../components/finances/YearlyStats';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const ptAOA = (v: number) => formatKz(v);
const mvCents = (t?: string) => { const r = parseKzInput(t || '', { required: false }); return r.ok ? r.cents : 0; };
const amtCents = (t?: string) => { const r = parseKzInput(t || '', { required: false }); return r.ok ? r.cents : null; };

export default function Finances() {
  const { user, isAdmin, userRole } = useAuth();
  const d = new Date();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[d.getMonth()]);
  const [selectedYear, setSelectedYear] = useState(d.getFullYear().toString());
  
  const [members, setMembers] = useState<{id: string, name: string, email?: string, phone?: string}[]>([]);
  const [memberLookup, setMemberLookup] = useState<Record<string, string>>({});
  const [lastMemberDoc, setLastMemberDoc] = useState<any>(null);
  const [hasMoreMembers, setHasMoreMembers] = useState(false);
  const [isLoadingMoreMembers, setIsLoadingMoreMembers] = useState(false);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  const [tithes, setTithes] = useState<any[]>([]);
  const [offerings, setOfferings] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  
  const [searchTithes, setSearchTithes] = useState('');
  const [searchOfferings, setSearchOfferings] = useState('');
  const [searchExpenses, setSearchExpenses] = useState('');

  const [loading, setLoading] = useState(true);

  const [tD, setTD] = useState<{
    memberId: string, 
    amount: string, 
    receiptNumber: string, 
    selectedMonths: string[],   // meses de REFERÊNCIA canónico '01'..'12'
    manualSplit: boolean, 
    manualValues: Record<string, string>,
    year: string,               // ano de REFERÊNCIA
    deliveryMonth: string,      // mês de ENTREGA '01'..'12' (contabilidade)
    deliveryYear: string,       // ano de ENTREGA
    contributionType: string,
    contributionDetail: string
  }>({
    memberId: '',
    amount: '',
    receiptNumber: '',
    selectedMonths: [String(new Date().getMonth() + 1).padStart(2, '0')],
    manualSplit: false,
    manualValues: {},
    year: selectedYear,
    deliveryMonth: String(new Date().getMonth() + 1).padStart(2, '0'),
    deliveryYear: selectedYear,
    contributionType: 'Dízimo',
    contributionDetail: ''
  });
  const [oD, setOD] = useState({ description: '', type: 'Geral', amount: '', receiptNumber: '', referenceDate: new Date().toISOString().split('T')[0], sinodPercentage: '0' });
  /* v1.14.6: tipo explícito — o estado ganha receiptBase64/receiptMime no
     upload do recibo e o openEditExpense não repõe customCategory. */
  const [eD, setED] = useState<{
    description: string; category: string; amount: string; responsible: string;
    customCategory?: string; referenceDate: string;
    receiptBase64?: string; receiptMime?: string;
  }>({ description: '', category: 'Manutenção', amount: '', responsible: '', customCategory: '', referenceDate: new Date().toISOString().split('T')[0] });
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  const [isTOpen, setIsTOpen] = useState(false);
  const [isOOpen, setIsOOpen] = useState(false);
  const [isEOpen, setIsEOpen] = useState(false);
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [receiptDocOpen, setReceiptDocOpen] = useState(false);
  const [financialMonth, setFinancialMonth] = useState<any>(null);
  const [financialYear, setFinancialYear] = useState<any>(null);
  const [churchConfig, setChurchConfig] = useState<any>({});

  const logAudit = async (action: string, collectionName: string, originalData: any, newData: any) => {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        adminEmail: auth.currentUser?.email || 'Desconhecido',
        action,
        collectionName,
        originalData,
        newData,
        createdAt: Date.now()
      });
    } catch(e) {
      console.error(e);
    }
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTithe, setEditingTithe] = useState<any>(null);
  const [editingOffering, setEditingOffering] = useState<any>(null);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [memberRegisteredTithes, setMemberRegisteredTithes] = useState<any[]>([]);

  const confirmDialog = useConfirm();

  // Carregar histórico de contribuições do membro seleccionado para avisos proactivos de duplicidade
  useEffect(() => {
    if (!tD.memberId) {
      setMemberRegisteredTithes([]);
      return;
    }
    const fetchMemberTithes = async () => {
      try {
        const q = query(collection(db, 'tithes'), where('memberId', '==', tD.memberId));
        const snap = await getDocs(q);
        const refYear = parseInt(tD.year) || parseInt(selectedYear);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((item: any) => {
          const itemYear = item.referenceYear || item.year;
          return itemYear === refYear;
        });
        setMemberRegisteredTithes(docs);
      } catch (err) {
        console.error("Erro ao carregar histórico do membro:", err);
      }
    };
    fetchMemberTithes();
  }, [tD.memberId, tD.year, selectedYear]);

  const loadData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      // Carregamento paginado inicial de membros (limit 40) para minimizar tráfego de dados inicial
      if (members.length === 0) {
        try {
          const mQuery = query(collection(db, 'members'), orderBy('name', 'asc'), limit(40));
          const mSnap = await getDocs(mQuery);
          const loadedMembers = mSnap.docs.map(d => ({ id: d.id, name: d.data().name, email: d.data().email || null }));
          setMembers(loadedMembers);
          setLastMemberDoc(mSnap.docs[mSnap.docs.length - 1] || null);
          setHasMoreMembers(mSnap.docs.length === 40);

          const initialMap: Record<string, string> = {};
          loadedMembers.forEach(m => { initialMap[m.id] = m.name; });
          setMemberLookup(prev => ({ ...prev, ...initialMap }));
        } catch (mErr) {
          console.warn("Aviso ao carregar membros iniciais:", mErr);
        }

        const cSnap = await getDoc(doc(db, 'settings', 'church'));
        if (cSnap.exists()) {
          setChurchConfig(cSnap.data());
        }
      }

      const fmQuery = query(collection(db, 'financialMonths'), where('month', '==', selectedMonth), where('year', '==', parseInt(selectedYear)));
      const fyQuery = query(collection(db, 'financialYears'), where('year', '==', parseInt(selectedYear)));
      // CONTABILIDADE = data de ENTREGA (v1.9.3+ deliveryMonth numérico).
      // A 2ª query apanha o legado pré-migração (month em nome).
      const tQuery1 = query(collection(db, 'tithes'), where('deliveryMonth', '==', toMonthIdx(selectedMonth)), where('deliveryYear', '==', parseInt(selectedYear)));
      const tQuery2 = query(collection(db, 'tithes'), where('month', '==', selectedMonth), where('year', '==', parseInt(selectedYear)));
      const oQuery = query(collection(db, 'offerings'), where('month', '==', selectedMonth), where('year', '==', parseInt(selectedYear)));
      const eQuery = query(collection(db, 'expenses'), where('month', '==', selectedMonth), where('year', '==', parseInt(selectedYear)));

      const [fmSnap, fySnap, tSnap1, tSnap2, oSnap, eSnap] = await Promise.all([
        getDocs(fmQuery),
        getDocs(fyQuery),
        getDocs(tQuery1),
        getDocs(tQuery2),
        getDocs(oQuery),
        getDocs(eQuery)
      ]);

      if (!fmSnap.empty) setFinancialMonth({ id: fmSnap.docs[0].id, ...fmSnap.docs[0].data() });
      else setFinancialMonth(null);

      if (!fySnap.empty) setFinancialYear({ id: fySnap.docs[0].id, ...fySnap.docs[0].data() });
      else setFinancialYear(null);

      // Combinar dízimos para evitar que registos de competência fiquem ocultos
      const tithesMap = new Map();
      [...tSnap1.docs, ...tSnap2.docs].forEach(d => {
        tithesMap.set(d.id, { id: d.id, ...d.data() });
      });
      const allTithesList = Array.from(tithesMap.values());
      setTithes(allTithesList);
      setOfferings(oSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setExpenses(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Resolver nomes de membros que não estejam no cache local inicial
      const missingIds = Array.from(new Set(
        allTithesList
          .map((t: any) => t.memberId)
          .filter((id: string) => id && !memberLookup[id] && !members.some(m => m.id === id))
      ));
      if (missingIds.length > 0) {
        Promise.all(missingIds.map(async id => {
          try {
            const snap = await getDoc(doc(db, 'members', id));
            if (snap.exists()) return { id, name: snap.data().name };
          } catch(e) {}
          return null;
        })).then(results => {
          const resolved = results.filter(Boolean) as { id: string; name: string }[];
          if (resolved.length > 0) {
            setMemberLookup(prev => {
              const updated = { ...prev };
              resolved.forEach(r => { updated[r.id] = r.name; });
              return updated;
            });
            setMembers(prev => {
              const existing = new Set(prev.map(m => m.id));
              return [...prev, ...resolved.filter(r => !existing.has(r.id))];
            });
          }
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'finances');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const loadMoreMembers = async () => {
    if (!lastMemberDoc || isLoadingMoreMembers) return;
    setIsLoadingMoreMembers(true);
    try {
      const nextQuery = query(
        collection(db, 'members'),
        orderBy('name', 'asc'),
        startAfter(lastMemberDoc),
        limit(40)
      );
      const mSnap = await getDocs(nextQuery);
      const newMembers = mSnap.docs.map(d => ({ id: d.id, name: d.data().name, email: d.data().email || null }));
      setMembers(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        return [...prev, ...newMembers.filter(m => !existingIds.has(m.id))];
      });
      setMemberLookup(prev => {
        const next = { ...prev };
        newMembers.forEach(m => { next[m.id] = m.name; });
        return next;
      });
      setLastMemberDoc(mSnap.docs[mSnap.docs.length - 1] || null);
      setHasMoreMembers(mSnap.docs.length === 40);
    } catch (err) {
      console.error("Erro ao carregar mais membros:", err);
    } finally {
      setIsLoadingMoreMembers(false);
    }
  };

  const handleMemberSearch = async (val: string) => {
    setMemberSearchQuery(val);
    const trimmed = val.trim();
    if (trimmed.length >= 2) {
      setIsSearchingMembers(true);
      try {
        const variations = [
          trimmed,
          trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase(),
          trimmed.toUpperCase()
        ];
        const uniqueVars = Array.from(new Set(variations));
        const searchPromises = uniqueVars.map(prefix =>
          getDocs(query(
            collection(db, 'members'),
            orderBy('name', 'asc'),
            startAt(prefix),
            endAt(prefix + '\uf8ff'),
            limit(15)
          ))
        );
        const snaps = await Promise.all(searchPromises);
        const found: { id: string; name: string }[] = [];
        snaps.forEach(s => {
          s.docs.forEach(d => {
            found.push({ id: d.id, name: d.data().name });
          });
        });
        if (found.length > 0) {
          setMembers(prev => {
            const existing = new Set(prev.map(m => m.id));
            return [...prev, ...found.filter(m => !existing.has(m.id))];
          });
          setMemberLookup(prev => {
            const next = { ...prev };
            found.forEach(m => { next[m.id] = m.name; });
            return next;
          });
        }
      } catch (err) {
        console.warn("Pesquisa sob demanda de membros:", err);
      } finally {
        setIsSearchingMembers(false);
      }
    }
  };

  const getMemberName = (id: string) => {
    const mem = members.find(m => m.id === id);
    if (mem) return mem.name;
    if (memberLookup[id]) return memberLookup[id];
    return 'Desconhecido';
  };

  useEffect(() => { loadData(true); }, [selectedMonth, selectedYear]);

  const generateAndSendWA = async (memberId: string, amount: number, receiptNum: string) => {
    try {
      const mDoc = await getDoc(doc(db, 'members', memberId));
      if (!mDoc.exists()) return;
      const mem = mDoc.data();
      
      const docPdf = new jsPDF();
      docPdf.setFontSize(16);
      docPdf.text('RECIBO DE CONTRIBUIÇÃO', 20, 20);
      docPdf.setFontSize(12);
      docPdf.text(`Recibo Nº: ${receiptNum}`, 20, 35);
      docPdf.text(`Membro: ${mem.name}`, 20, 45);
      docPdf.text(`Valor: ${formatKz(amount)}`, 20, 55);
      docPdf.text(`Data: ${new Date().toLocaleDateString('pt-AO')}`, 20, 65);
      const b64 = docPdf.output('datauristring');
      
      // Save for Webhook/Extension
      await addDoc(collection(db, 'whatsapp_outbox'), {
         memberPhone: mem.phone || '',
         memberName: mem.name || '',
         receiptNumber: receiptNum,
         amount: amount,
         pdfAttachmentDataUri: b64,
         status: 'pending',
         createdAt: Date.now()
      });

      if (mem.phone) {
         toast.success("Recibo gerado em Buffer para a extensão do WhatsApp", {
           action: {
             label: 'Enviar Manual',
             onClick: () => {
                const msg = `Olá ${mem.name}, O seu recibo de contribuição (Nº ${receiptNum}) foi registado com o valor de ${formatKz(amount)}. Que Deus o abençoe!`;
                openExternal(`https://wa.me/${mem.phone.replace(/[\s\+]/g, '')}?text=${encodeURIComponent(msg)}`);
             }
           }
         });
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handleAddTithe = async (e: React.FormEvent) => {
    e.preventDefault();
    if(isSubmitting) return;

    if (editingTithe) {
      setIsSubmitting(true);
      const editParsed = parseKzInput(tD.amount);
      if (!editParsed.ok) { toast.error(editParsed.error); setIsSubmitting(false); return; }
      const confirmed = await confirmDialog("Deseja guardar esta informação?");
      if (!confirmed) { setIsSubmitting(false); return; }
      try {
           const newData = {
             memberId: tD.memberId,
             amount: editParsed.cents,
             receiptNumber: tD.receiptNumber,
             deliveryMonth: toMonthIdx(tD.deliveryMonth) || toMonthIdx(selectedMonth),
             deliveryYear: parseInt(tD.deliveryYear, 10) || parseInt(selectedYear, 10),
             month: toMonthIdx(tD.deliveryMonth) || toMonthIdx(selectedMonth),
             year: parseInt(tD.deliveryYear, 10) || parseInt(selectedYear, 10),
             cashierMonth: toMonthIdx(tD.deliveryMonth) || toMonthIdx(selectedMonth),
             cashierYear: parseInt(tD.deliveryYear, 10) || parseInt(selectedYear, 10),
             referenceMonth: toMonthIdx(tD.selectedMonths[0]) || toMonthIdx(selectedMonth),
             referenceYear: parseInt(tD.year, 10) || parseInt(selectedYear, 10),
             contributionType: tD.contributionType,
             contributionDetail: tD.contributionDetail,
             updatedAt: Date.now()
           };
           await updateDoc(doc(db, 'tithes', editingTithe.id), newData);
           await logAudit('UPDATE', 'tithes', editingTithe, newData);
           toast.success("Contribuição actualizada.");
           setIsTOpen(false); 
           setEditingTithe(null);
           loadData(false); 
           resetTD();
      } catch(err) {
           toast.error("Falha ao actualizar.");
           handleFirestoreError(err, OperationType.WRITE, 'tithes');
      } finally {
           setIsSubmitting(false);
      }
      return;
    }

    if (tD.selectedMonths.length === 0) {
      toast.error('Seleccione pelo menos um mês de referência.');
      return;
    }
    
    setIsSubmitting(true);
    const baseReceipt = tD.receiptNumber || `REC-${Date.now()}`;
    const totalAmountParsed = parseKzInput(tD.amount);
    if (!totalAmountParsed.ok) { toast.error(totalAmountParsed.error); setIsSubmitting(false); return; }
    const totalAmount = totalAmountParsed.cents;

    // Verificação de duplicidade de dízimo/contribuição com verificação de mesmo valor
    try {
      const refYear = parseInt(tD.year) || parseInt(selectedYear);
      const existingQuery = query(
        collection(db, 'tithes'),
        where('memberId', '==', tD.memberId)
      );
      const existingSnap = await getDocs(existingQuery);
      
      const duplicatesFound: { month: string; amount: number; receipt: string }[] = [];
      let exactSameAmountFound = false;

      tD.selectedMonths.forEach(m => {
        const inputAmountForMonth = tD.manualSplit 
          ? mvCents(tD.manualValues[m])
          : totalAmount / tD.selectedMonths.length;

        existingSnap.docs.forEach(doc => {
          const d = doc.data();
          const docYear = d.referenceYear || d.year;
          if (docYear !== refYear) return;

          const matchMonth = referenceOf(d as any).month === toMonthIdx(m);
          const matchType = (d.contributionType || 'Dízimo') === (tD.contributionType || 'Dízimo');
          if (matchMonth && matchType) {
            duplicatesFound.push({
              month: idxToName(m),
              amount: d.amount,
              receipt: d.receiptNumber || 'S/N'
            });
            if (Math.abs(d.amount - inputAmountForMonth) < 0.01 || Math.abs(d.amount - totalAmount) < 0.01) {
              exactSameAmountFound = true;
            }
          }
        });
      });

      if (duplicatesFound.length > 0) {
        const memberObj = members.find(m => m.id === tD.memberId);
        const memberName = memberObj ? memberObj.name : 'este membro';
        
        let msg = `⚠️ AVISO DE DUPLICIDADE DETECTADA:\nO membro "${memberName}" já possui registo de ${tD.contributionType || 'Dízimo'} em ${refYear}:\n\n`;
        duplicatesFound.forEach(dup => {
          msg += `• Mês: ${dup.month} | Valor: ${ptAOA(dup.amount)} (Recibo: ${dup.receipt})\n`;
        });

        if (exactSameAmountFound) {
          msg += `\n🚨 ATENÇÃO: Foi detectado o MESMO VALOR (${ptAOA(totalAmount)}) já lançado para o mesmo período! Deseja realmente duplicar este lançamento?`;
        } else {
          msg += `\nDeseja realmente registar uma contribuição complementar para este(s) mês(es)?`;
        }

        const allowDuplicate = await confirmDialog(msg, exactSameAmountFound ? "POSSÍVEL DUPLICIDADE IDÊNTICA" : "CONFIRMAR REGISTO");
        if (!allowDuplicate) {
          setIsSubmitting(false);
          return;
        }
      }
    } catch (checkErr) {
      console.warn("Aviso ao verificar duplicidade:", checkErr);
    }

    // ── Sanitização canónica (v1.10.2): nunca deixar passar meses em nome nem
    //    entrega em falta — era isto que fazia o setDoc rejeitar (undefined/nome). ──
    const pairs = tD.selectedMonths
      .map((k) => ({ key: k, mi: toMonthIdx(k) }))
      .filter((pp) => pp.mi);
    if (pairs.length === 0) {
      toast.error('Seleccione pelo menos um mês de referência válido.');
      setIsSubmitting(false);
      return;
    }
    const delMonth = toMonthIdx(tD.deliveryMonth) || toMonthIdx(selectedMonth);
    const delYear = parseInt(tD.deliveryYear, 10) || parseInt(selectedYear, 10);
    const refYear = parseInt(tD.year, 10) || parseInt(selectedYear, 10);

    // ── Duplicidade (regra 2026-10-24): block se membro+ref+valor+entrega iguais;
    //    warn (com confirmação explícita) se já há lançamento na mesma referência. ──
    try {
      const warns: string[] = [];
      for (const pp of pairs) {
        const mi = pp.mi;
        const val = tD.manualSplit ? mvCents(tD.manualValues[pp.key]) : Math.floor(totalAmount / pairs.length);
        const snap = await getDocs(query(collection(db, 'tithes'),
          where('memberId', '==', tD.memberId),
          where('referenceMonth', '==', mi),
          where('referenceYear', '==', parseInt(tD.year))));
        const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        const verdict = classifyTitheDuplicate(existing, {
          memberId: tD.memberId, referenceMonth: mi, referenceYear: refYear,
          amount: val, deliveryMonth: delMonth, deliveryYear: delYear,
        });
        if (verdict.level === 'block') {
          toast.error(`Registo BLOQUEADO: já existe lançamento exatamente igual (${describeTithe(verdict.conflict!)}).`);
          setIsSubmitting(false);
          return;
        }
        if (verdict.level === 'warn') warns.push(`• ${idxToName(mi)}/${refYear}: ${describeTithe(verdict.conflict!)}`);
      }
      if (warns.length > 0) {
        const okWait = await confirmDialog(
          `Já existem lançamentos para este(s) mês(es) de referência:\n\n${warns.join('\n')}\n\nO membro pode estar a pagar em prestações. Confirma o novo lançamento?`,
          'CONFIRMAR'
        );
        if (!okWait) { setIsSubmitting(false); return; }
      }
    } catch (checkErr) {
      console.warn('Falha ao verificar duplicidade (a continuar):', checkErr);
    }

    const isManual = tD.manualSplit;
    if (isManual) {
      let sum = 0;
      for (const pp of pairs) {
         const v = mvCents(tD.manualValues[pp.key]);
         if (isNaN(v) || v <= 0) {
           toast.error(`Valor inválido para o mês de ${idxToName(pp.mi)}.`);
           setIsSubmitting(false);
           return;
         }
         sum += v;
      }
      
      if (Math.abs(sum - totalAmount) > 0.01) {
        toast.error(`A soma dos valores manuais (${sum}) deve ser igual ao valor total fornecido (${totalAmount}).`);
        setIsSubmitting(false);
        return;
      }
      
      const confirmed = await confirmDialog("Deseja guardar esta informação?");
      if (!confirmed) {
        setIsSubmitting(false);
        return;
      }
    } else {
      const splitAmount = Math.floor(totalAmount / tD.selectedMonths.length);
      if (pairs.length > 1) {
        const confirmed = await confirmDialog(`O valor de ${ptAOA(totalAmount)} será dividido igualmente em ${pairs.length} meses (${ptAOA(splitAmount)} cada). Confirma a divisão automática?`);
        if (!confirmed) {
          setIsSubmitting(false);
          return;
        }
      } else {
        const confirmed = await confirmDialog("Deseja guardar esta informação?");
        if (!confirmed) {
          setIsSubmitting(false);
          return;
        }
      }
    }

    // --- ATUALIZAÇÃO OTIMISTA (OPTIMISTIC UI: 0 SEGUNDOS) ---
    const splitAmount = Math.floor(totalAmount / pairs.length);
    const createdRecords: any[] = [];
    const createdDocIds: string[] = [];

    // auditoria 2026-10-24: cada dízimo novo leva o email do membro para que as
    // regras do Firestore permitam leitura apenas ao próprio e à liderança
    const memberEmail = members.find((mm) => mm.id === tD.memberId)?.email || null;

    for (let i = 0; i < pairs.length; i++) {
      const m = pairs[i].mi;
      const val = isManual ? mvCents(tD.manualValues[pairs[i].key]) : splitAmount;
      const titheDocId = doc(collection(db, 'tithes')).id;
      createdDocIds.push(titheDocId);
      createdRecords.push({
        id: titheDocId,
        memberId: tD.memberId,
        memberEmail,
        amount: val,
        receiptNumber: `${baseReceipt}${pairs.length > 1 ? `-${i+1}` : ''}`,
        // ENTREGA (contabilidade) e REFERÊNCIA (cartão), canónico '01'..'12'
        deliveryMonth: delMonth,
        deliveryYear: delYear,
        month: delMonth,
        year: delYear,
        cashierMonth: delMonth,
        cashierYear: delYear,
        referenceMonth: m,
        referenceYear: refYear,
        contributionType: tD.contributionType,
        contributionDetail: tD.contributionDetail,
        adminId: auth.currentUser?.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        _optimistic: true
      });
    }

    // Inserção imediata no estado local da tabela (0ms para o operador)
    const idxSel = toMonthIdx(selectedMonth);
    const yrSel = parseInt(selectedYear, 10);
    const recordsInCurrentView = createdRecords.filter(r => 
      (r.deliveryMonth === idxSel && r.deliveryYear === yrSel) ||
      (r.referenceMonth === idxSel && r.referenceYear === yrSel)
    );
    if (recordsInCurrentView.length > 0) {
      setTithes(prev => [...recordsInCurrentView, ...prev]);
    }

    // Configuração de despesa do sínodo, se aplicável
    let sinodExpId: string | null = null;
    let sinodExpData: any = null;
    const sinodPct = ((tD.contributionType === 'Dízimo' || tD.contributionType === 'Oferta Geral') && parseFloat(churchConfig?.tithePercentage || '0') > 0)
      ? parseFloat(churchConfig.tithePercentage)
      : 0;
    const sinodAmount = sinodPct > 0 ? Math.round((totalAmount * sinodPct) / 100) : 0;
    if (sinodAmount > 0) {
      sinodExpId = doc(collection(db, 'expenses')).id;
      const expDesc = tD.contributionType === 'Dízimo' 
        ? `Envio da percentagem de ${sinodPct}% dos Dízimos ao Sínodo`
        : `Envio da percentagem de ${sinodPct}% das ofertas geral ao Sínodo`;
      sinodExpData = {
        id: sinodExpId,
        description: expDesc,
        category: 'Administração',
        amount: sinodAmount,
        responsible: 'Sistema',
        month: selectedMonth,
        year: parseInt(selectedYear),
        adminId: auth.currentUser?.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        _optimistic: true
      };
      setExpenses(prev => [sinodExpData, ...prev]);
    }

    // Guarda referências para segundo plano, fecha o diálogo e reseta o formulário imediatamente
    const currentMemberId = tD.memberId;
    const savedReceipt = baseReceipt;
    setIsTOpen(false);
    resetTD();
    setIsSubmitting(false);

    // Feedback com Toast Acionável contendo botão "Desfazer"
    toast.success("Contribuição guardada com sucesso!", {
      duration: 8000,
      action: {
        label: "Desfazer",
        onClick: async () => {
          // Reversão imediata na UI
          setTithes(prev => prev.filter(t => !createdDocIds.includes(t.id)));
          if (sinodExpId) {
            setExpenses(prev => prev.filter(e => e.id !== sinodExpId));
          }
          try {
            await Promise.all(createdDocIds.map(id => deleteDoc(doc(db, 'tithes', id))));
            if (sinodExpId) {
              await deleteDoc(doc(db, 'expenses', sinodExpId));
            }
            toast.success("Lançamento desfeito com sucesso!");
          } catch(err) {
            console.error("Erro ao desfazer lançamento:", err);
            toast.error("Não foi possível desfazer no servidor.");
          }
        }
      }
    });

    // Gravação assíncrona no Firestore em segundo plano
    (async () => {
      try {
        for (const item of createdRecords) {
          const { id, _optimistic, ...docData } = item;
          await setDoc(doc(db, 'tithes', id), docData);
        }
        if (sinodExpData) {
          const { id, _optimistic, ...expData } = sinodExpData;
          await setDoc(doc(db, 'expenses', id), expData);
          setExpenses(prev => prev.map(e => e.id === sinodExpId ? { ...e, _optimistic: false } : e));
        }
        // Remove a flag otimista dos dízimos inseridos
        setTithes(prev => prev.map(t => createdDocIds.includes(t.id) ? { ...t, _optimistic: false } : t));
        
        // Disparar WhatsApp em background
        generateAndSendWA(currentMemberId, totalAmount, savedReceipt).catch(console.error);
      } catch (err) {
        console.error("Erro ao sincronizar dízimo com Firestore:", err);
        // Rollback da UI em caso de falha do servidor
        setTithes(prev => prev.filter(t => !createdDocIds.includes(t.id)));
        if (sinodExpId) {
          setExpenses(prev => prev.filter(e => e.id !== sinodExpId));
        }
        toast.error("Erro ao sincronizar com o servidor. O lançamento local foi revertido.");
        handleFirestoreError(err, OperationType.WRITE, 'tithes');
      }
    })();
  };

  const handleAddOffering = async (e: React.FormEvent) => {
    e.preventDefault();
    if(isSubmitting) return;
    setIsSubmitting(true);
    
    const confirmed = await confirmDialog("Deseja guardar esta informação?");
    if (!confirmed) {
      setIsSubmitting(false);
      return;
    }

    const oParsedEdit = parseKzInput(oD.amount);
    if (!oParsedEdit.ok) { toast.error(oParsedEdit.error); setIsSubmitting(false); return; }
    if (editingOffering) {
      try {
         const newData = {
           description: oD.description,
           type: oD.type,
           amount: oParsedEdit.cents,
           receiptNumber: oD.receiptNumber,
           updatedAt: Date.now()
         };
         await updateDoc(doc(db, 'offerings', editingOffering.id), newData);
         await logAudit('UPDATE', 'offerings', editingOffering, newData);
         toast.success("Oferta actualizada.");
         setIsOOpen(false); setEditingOffering(null); setOD({ description: '', type: 'Geral', amount: '', receiptNumber: '', referenceDate: new Date().toISOString().split('T')[0], sinodPercentage: '0' }); loadData(false);
      } catch (error) { 
         toast.error("Falha ao actualizar."); 
         handleFirestoreError(error, OperationType.WRITE, 'offerings'); 
      } finally {
         setIsSubmitting(false);
      }
      return;
    }

    try {
       const originalAmount = oParsedEdit.cents;
       const sinodPct = oD.type === 'Geral' ? parseFloat(churchConfig?.offeringPercentage || '0') : (parseFloat(oD.sinodPercentage) || 0);
       const sinodAmount = Math.round((originalAmount * sinodPct) / 100);

       await addDoc(collection(db, 'offerings'), {
         description: oD.description,
         type: oD.type,
         amount: originalAmount,
         receiptNumber: oD.receiptNumber || `REC-${Date.now()}`,
         referenceDate: oD.referenceDate,
         month: selectedMonth,
         year: parseInt(selectedYear),
         adminId: auth.currentUser?.uid,
         createdAt: Date.now(),
         updatedAt: Date.now()
       });

       if (sinodAmount > 0) {
         const expenseDesc = oD.type === 'Geral' 
           ? `Envio da percentagem de ${sinodPct}% das ofertas geral ao Sínodo`
           : oD.type === 'Domingo Especial'
           ? `Envio ao Sínodo da percentagem ${sinodPct}% do Domingo Especial ao Sínodo`
           : `Envio da Contribuição referente a ${oD.description} ao Sínodo`;

         await addDoc(collection(db, 'expenses'), {
           description: expenseDesc,
           category: 'Administração',
           amount: sinodAmount,
           responsible: 'Sistema',
           month: selectedMonth,
           year: parseInt(selectedYear),
           adminId: auth.currentUser?.uid,
           createdAt: Date.now(),
           updatedAt: Date.now()
         });
       }

       toast.success("Oferta registada.");
       setIsOOpen(false); setOD({ description: '', type: 'Geral', amount: '', receiptNumber: '', referenceDate: new Date().toISOString().split('T')[0], sinodPercentage: '0' }); loadData(false);
    } catch (error) { 
       toast.error("Falha ao guardar."); 
       handleFirestoreError(error, OperationType.WRITE, 'offerings');
    } finally {
       setIsSubmitting(false);
    }
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 800 * 1024) {
        toast.error("O comprovativo deve ser menor que 800KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
         if (typeof reader.result === 'string') {
           setED(prev => ({ ...prev, receiptBase64: reader.result as string, receiptMime: file.type }));
         }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if(isSubmitting) return;
    setIsSubmitting(true);
    
    const confirmed = await confirmDialog("Deseja guardar esta informação?");
    if (!confirmed) {
      setIsSubmitting(false);
      return;
    }

    const finalCategory = eD.category === 'Personalizada' ? eD.customCategory : eD.category;

    const eParsedEdit = parseKzInput(eD.amount);
    if (!eParsedEdit.ok) { toast.error(eParsedEdit.error); setIsSubmitting(false); return; }
    if (editingExpense) {
      try {
         const newData: any = {
           description: eD.description,
           category: finalCategory,
           amount: eParsedEdit.cents,
           responsible: eD.responsible,
           date: eD.referenceDate || new Date().toISOString().split('T')[0],
           updatedAt: Date.now()
         };
         if (eD.receiptBase64) newData.hasReceipt = true;
         
         await updateDoc(doc(db, 'expenses', editingExpense.id), newData);
         if (eD.receiptBase64) {
           await setDoc(doc(db, 'expense_receipts', editingExpense.id), {
             base64Data: eD.receiptBase64,
             mimeType: eD.receiptMime,
             updatedAt: Date.now()
           });
         }

         await logAudit('UPDATE', 'expenses', editingExpense, newData);
         toast.success("Saída actualizada.");
         setIsEOpen(false); setEditingExpense(null); setED({ description: '', category: 'Manutenção', amount: '', responsible: '', customCategory: '', receiptBase64: '', receiptMime: '', referenceDate: new Date().toISOString().split('T')[0] }); setIsCustomCategory(false); loadData(false);
      } catch (error) { 
         toast.error("Falha ao actualizar."); 
         handleFirestoreError(error, OperationType.WRITE, 'expenses'); 
      } finally {
         setIsSubmitting(false);
      }
      return;
    }

    try {
       const docRef = await addDoc(collection(db, 'expenses'), {
         description: eD.description,
         category: finalCategory,
         amount: eParsedEdit.cents,
         responsible: eD.responsible,
         date: eD.referenceDate || new Date().toISOString().split('T')[0],
         month: selectedMonth,
         year: parseInt(selectedYear),
         adminId: auth.currentUser?.uid,
         hasReceipt: !!eD.receiptBase64,
         createdAt: Date.now(),
         updatedAt: Date.now()
       });
       
       if (eD.receiptBase64) {
         await setDoc(doc(db, 'expense_receipts', docRef.id), {
           base64Data: eD.receiptBase64,
           mimeType: eD.receiptMime,
           createdAt: Date.now()
         });
       }

       toast.success("Saída registada.");
       setIsEOpen(false); setED({ description: '', category: 'Manutenção', amount: '', responsible: '', customCategory: '', referenceDate: new Date().toISOString().split('T')[0], receiptBase64: '', receiptMime: '' }); setIsCustomCategory(false); loadData(false);
    } catch (error) { 
       toast.error("Falha ao guardar."); 
       handleFirestoreError(error, OperationType.WRITE, 'expenses');
    } finally {
       setIsSubmitting(false);
    }
  };

  /** Estado canónico do formulário: meses sempre '01'..'12' e entrega preenchida.
   *  (v1.10.2 — um tD stalado com meses em nome ou entrega em falta era a causa
   *  do «sucesso… e depois erro ao sincronizar»: setDoc rejeita undefined.) */
  const resetTD = (keepMember = true) => {
    const mi = toMonthIdx(selectedMonth);
    setTD(prev => ({
      ...prev,
      memberId: keepMember ? prev.memberId : '',
      amount: '',
      receiptNumber: '',
      selectedMonths: [mi],
      manualSplit: false,
      manualValues: {},
      year: selectedYear,
      deliveryMonth: mi,
      deliveryYear: selectedYear,
      contributionType: 'Dízimo',
      contributionDetail: '',
    }));
  };

  const openEditTithe = (t: any) => {
    setEditingTithe(t);
    const r = referenceOf(t); const d = deliveryOf(t);
    setTD({
      memberId: t.memberId,
      amount: t.amount.toString(),
      receiptNumber: t.receiptNumber || '',
      selectedMonths: [r.month || toMonthIdx(selectedMonth)],
      manualSplit: false,
      manualValues: {},
      year: String(r.year || selectedYear),
      deliveryMonth: d.month || toMonthIdx(selectedMonth),
      deliveryYear: String(d.year || selectedYear),
      contributionType: t.contributionType || 'Dízimo',
      contributionDetail: t.contributionDetail || ''
    });
    setIsTOpen(true);
  };

  const openEditOffering = (o: any) => {
    setEditingOffering(o);
    setOD({
      description: o.description,
      type: o.type,
      amount: o.amount.toString(),
      receiptNumber: o.receiptNumber || '',
      referenceDate: o.referenceDate || new Date().toISOString().split('T')[0],
      sinodPercentage: '0'
    });
    setIsOOpen(true);
  };

  const openEditExpense = (e: any) => {
    setEditingExpense(e);
    setED({
      description: e.description,
      category: e.category,
      amount: e.amount.toString(),
      responsible: e.responsible || '',
      referenceDate: e.date || new Date().toISOString().split('T')[0]
    });
    setIsEOpen(true);
  };

  const deleteDocSafely = async (col: string, id: string) => {
    if (financialMonth?.status === 'closed') {
      toast.error("O mês está encerrado. Não é possível eliminar registos.");
      return;
    }
    
    let origData: any = null;
    if (col === 'tithes') origData = tithes.find((t:any) => t.id === id);
    if (col === 'offerings') origData = offerings.find((t:any) => t.id === id);
    if (col === 'expenses') origData = expenses.find((t:any) => t.id === id);

    if (origData) {
      const { locked, reason } = isRecordLocked(origData.createdAt || origData.date);
      if (locked && !isAdmin) {
        toast.error(reason || "Registo bloqueado.");
        return;
      }
    }

    const confirmed = await confirmDialog("Tem certeza de que deseja mover este registo financeiro para a lixeira? Esta ação será registada.", "APAGAR");
    if (confirmed) {
      // Remoção otimista imediata da tabela
      if (col === 'tithes') setTithes(prev => prev.filter((t:any) => t.id !== id));
      if (col === 'offerings') setOfferings(prev => prev.filter((o:any) => o.id !== id));
      if (col === 'expenses') setExpenses(prev => prev.filter((e:any) => e.id !== id));

      const trashDocId = `${col}_${id}`;
      try { 
        await moveToTrash(col, id, user?.email || 'unknown');
        await logAudit('DELETE', col, origData, null);

        // Feedback com Toast Acionável contendo botão "Desfazer"
        toast.success("Movido para a lixeira.", {
          duration: 8000,
          action: {
            label: "Desfazer",
            onClick: async () => {
              try {
                await restoreFromTrash(trashDocId);
                if (col === 'tithes' && origData) setTithes(prev => [origData, ...prev]);
                if (col === 'offerings' && origData) setOfferings(prev => [origData, ...prev]);
                if (col === 'expenses' && origData) setExpenses(prev => [origData, ...prev]);
                toast.success("Registo restaurado com sucesso!");
              } catch(err) {
                console.error("Erro ao restaurar da lixeira:", err);
                toast.error("Não foi possível restaurar.");
                loadData(false);
              }
            }
          }
        });
      } catch(e) { 
        // Rollback da remoção em caso de erro
        if (col === 'tithes' && origData) setTithes(prev => [origData, ...prev]);
        if (col === 'offerings' && origData) setOfferings(prev => [origData, ...prev]);
        if (col === 'expenses' && origData) setExpenses(prev => [origData, ...prev]);
        toast.error("Erro ao remover."); 
        handleFirestoreError(e, OperationType.DELETE, col); 
      }
    }
  };

  const totalEntradas = tithes.reduce((a, b) => a + b.amount, 0) + offerings.reduce((a, b) => a + b.amount, 0);
  const totalSaidas = expenses.reduce((a, b) => a + b.amount, 0);

  const toggleMonthStatus = async () => {
    try {
      if (financialMonth) {
        if (financialMonth.status === 'open') {
          const saldoAnterior = financialMonth.openingBalance || 0;
          const novoSaldo = saldoAnterior + totalEntradas - totalSaidas;
          
          const confirmed = await confirmDialog("Tem certeza que deseja encerrar o mês de " + selectedMonth + "?");
          if(confirmed) {
            await updateDoc(doc(db, 'financialMonths', financialMonth.id), {
              status: 'closed',
              closingBalance: novoSaldo,
              closedAt: Date.now(),
              updatedAt: Date.now()
            });
            toast.success("Mês encerrado com sucesso.");
            loadData(false);
          }
        } else if (financialMonth.status === 'closed' && userRole === 'admin') {
          const confirmed = await confirmDialog("Aviso: O mês está encerrado. Deseja REABRIR este mês para edição?");
          if (confirmed) {
            await updateDoc(doc(db, 'financialMonths', financialMonth.id), {
              status: 'open',
              updatedAt: Date.now()
            });
            toast.success("Mês reaberto com sucesso.");
            loadData(false);
          }
        } else {
          toast.info("O mês já se encontra encerrado.");
        }
      } else {
        const confirmed = await confirmDialog("Deseja abrir financeiramente o mês de " + selectedMonth + " de " + selectedYear + "?");
        if(confirmed) {
          let openingBalance = 0;
          // In a real app we'd fetch the closing balance of the previous month. Let's start with 0 for simplicity.
          await addDoc(collection(db, 'financialMonths'), {
            month: selectedMonth,
            year: parseInt(selectedYear),
            status: 'open',
            openingBalance,
            adminId: auth.currentUser?.uid,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
          toast.success("Mês aberto com sucesso.");
          loadData(false);
        }
      }
    } catch(e) {
      handleFirestoreError(e, OperationType.WRITE, 'financialMonths');
    }
  };

  const isMonthClosed = financialMonth?.status === 'closed';
  const isYearClosed = financialYear?.status === 'closed';
  
  const isClosed = (isMonthClosed || isYearClosed) && userRole !== 'admin';

  const toggleYearStatus = async () => {
    try {
      if (financialYear) {
        if (financialYear.status === 'open') {
          const confirmed = await confirmDialog("Tem certeza que deseja encerrar o ano " + selectedYear + "? Nenhuma alteração financeira poderá ser feita aos meses deste ano.");
          if(confirmed) {
            await updateDoc(doc(db, 'financialYears', financialYear.id), {
              status: 'closed',
              closedAt: Date.now(),
              updatedAt: Date.now()
            });
            toast.success("Ano encerrado com sucesso.");
            loadData(false);
          }
        } else if (financialYear.status === 'closed' && userRole === 'admin') {
          const confirmed = await confirmDialog("Aviso: O ano está encerrado. Deseja REABRIR este ano para edição?");
          if (confirmed) {
            await updateDoc(doc(db, 'financialYears', financialYear.id), {
              status: 'open',
              updatedAt: Date.now()
            });
            toast.success("Ano reaberto com sucesso.");
            loadData(false);
          }
        } else {
          toast.info("O ano já se encontra encerrado.");
        }
      } else {
        const confirmed = await confirmDialog("O ano não está inicializado. Deseja iniciar o ano de " + selectedYear + " agora?");
        if(confirmed) {
          await addDoc(collection(db, 'financialYears'), {
            year: parseInt(selectedYear),
            status: 'open',
            adminId: auth.currentUser?.uid,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
          toast.success("Ano iniciado.");
          loadData(false);
        }
      }
    } catch(e) {
      handleFirestoreError(e, OperationType.WRITE, 'financialYears');
    }
  };

  const exportFinancesExcel = () => {
    import('xlsx').then(async XLSX => {
      const tithesRows = tithes.map(t => {
        const member = members.find(m => m.id === t.memberId)?.name || 'Desconhecido';
        return {
          'Tipo': 'Entrada de Membro',
          'Membro/Resp': member,
          'Categoria/Tipo': t.contributionType || 'Dízimo',
          'Detalhes': t.contributionDetail || '',
          'Valor (Kz)': t.amount / 100,
          'Ref. Mensal': t.referenceMonth || selectedMonth
        };
      });
      const offeringsRows = offerings.map(o => ({
        'Tipo': 'Oferta',
        'Membro/Resp': '',
        'Categoria/Tipo': o.type,
        'Detalhes': o.description,
        'Valor (Kz)': o.amount / 100,
        'Ref. Mensal': selectedMonth
      }));
      const expensesRows = expenses.map(e => ({
        'Tipo': 'Saída',
        'Membro/Resp': e.responsible,
        'Categoria/Tipo': e.category,
        'Detalhes': e.description,
        'Valor (Kz)': -e.amount / 100,
        'Ref. Mensal': selectedMonth
      }));

      const rows = [...tithesRows, ...offeringsRows, ...expensesRows];

      if (rows.length === 0) {
        toast.error("Sem dados para exportar neste mês.");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      formatMoneyCells(ws, XLSX);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Finanças");
      await saveXlsx(XLSX, wb, `financas_${selectedMonth}_${selectedYear}.xlsx`);
      toast.success("Dados financeiros exportados com sucesso.");
    }).catch(err => {
      console.error(err);
      toast.error("Erro ao exportar ficheiro.");
    });
  };

  const viewReceipt = async (expenseId: string) => {
    const loadingToast = toast.loading('A descarregar comprovativo...');
    try {
      const docSnap = await getDoc(doc(db, 'expense_receipts', expenseId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.base64Data) {
          // window.open()/anchor são mudos na WebView — partilha/gravação explícita
          await saveBlob(dataUrlToBlob(data.base64Data), `Comprovativo_Saida_${expenseId}.pdf`);
        } else {
          toast.error("Comprovativo vazio.");
        }
      } else {
        toast.error("Comprovativo não encontrado.");
      }
    } catch (e) {
      toast.error("Erro ao carregar comprovativo.");
      console.error(e);
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  const printReceiptHeaderFooter = (doc: any, churchName: string, logoUrl: string, receiptNumber: string, yOffset: number = 0, isOferta: boolean = false) => {
    // Header
    if (logoUrl) {
      try { doc.addImage(logoUrl, 'PNG', 15, yOffset + 10, 20, 20); } catch(e) {}
    } else {
      // Draw a highly simple dummy church icon/text
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("IMAGEM DA", 15, yOffset + 15);
      doc.text("IGREJA", 15, yOffset + 22);
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(isOferta ? "Recibo de Oferta" : "Recibo de Entrada", 105, yOffset + 20, { align: "center" });
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    // Updated receipt message
    doc.text(`${churchName} - Recibo Nº ${receiptNumber}`, 105, yOffset + 35, { align: "center" });
    doc.setFont("helvetica", "normal");
  };

  const printReceiptFooter = (doc: any, yPosition: number) => {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    const biblePassage = `"Cada um contribua segundo propôs no seu coração; não com tristeza, ou por necessidade; porque Deus ama ao que dá com alegria." - 2 Coríntios 9:7`;
    
    // Split text to fit width
    const splitText = doc.splitTextToSize(biblePassage, 160);
    doc.text(splitText, 105, yPosition, { align: "center" });
    
    doc.setLineWidth(0.5);
    doc.line(60, yPosition + 15, 150, yPosition + 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("A Administração e Tesouraria", 105, yPosition + 22, { align: "center" });
  };

  const sendWhatsAppReceipt = (t: any, isOffering = false) => {
    let churchName = 'Igreja local';
    const churchInfoString = prefGet('church-settings');
    if (churchInfoString) {
      try {
        const info = JSON.parse(churchInfoString);
        if (info.nome) churchName = info.nome;
      } catch (e) {}
    }

    const memberName = isOffering ? 'Irmão(ã)' : (members.find(m => m.id === t.memberId)?.name || 'Membro');
    const memberPhone = isOffering ? '' : (members.find(m => m.id === t.memberId)?.phone || '');
    const amount = formatKz(t.amount);
    const receiptNum = t.receiptNumber || t.id.substring(0,8).toUpperCase();
    
    let text = `Olá *${memberName}*,\n\nO seu recibo (Nº ${receiptNum}) foi registado com sucesso.\n\n`;
    text += `*Igreja:* ${churchName}\n`;
    text += `*Valor:* ${amount}\n`;
    if (isOffering) {
      text += `*Referente a:* Oferta ${t.type}\n`;
      if (t.description) text += `*Descrição:* ${t.description}\n`;
    } else {
      text += `*Referente a:* ${t.contributionType || 'Dízimo'}\n`;
      if (t.contributionDetail) text += `*Descrição:* ${t.contributionDetail}\n`;
    }
    text += `*Data:* ${new Date(t.createdAt || Date.now()).toLocaleDateString('pt-AO')}\n\n`;
    text += `_"Cada um contribua segundo propôs no seu coração..." 2 Coríntios 9:7_`;

    const encodedText = encodeURIComponent(text);
    const url = memberPhone ? `https://wa.me/${memberPhone.replace(/\D/g, '')}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
    
    window.open(url, '_blank');
  };

  const exportReceiptPDF = async (t: any) => {
    const doc = new jsPDF();
    const memberName = members.find(m => m.id === t.memberId)?.name || 'Membro';
    const amount = formatKz(t.amount);
    
    let churchName = 'Igreja local de Emanuel - Xangongo';
    let logoUrl = '';
    const churchInfoString = prefGet('church-settings');
    if (churchInfoString) {
      try {
        const info = JSON.parse(churchInfoString);
        if (info.nome) churchName = info.nome;
        if (info.logoUrl) logoUrl = info.logoUrl;
      } catch (e) {}
    }

    const receiptNum = t.receiptNumber || t.id.substring(0,8).toUpperCase();
    printReceiptHeaderFooter(doc, churchName, logoUrl, receiptNum, 0, false);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Recebemos de: ${memberName}`, 20, 60);
    doc.text(`A quantia de: ${amount}`, 20, 70);
    doc.text(`Referente a: ${t.contributionType || 'Dízimo'} ${t.contributionDetail ? '(' + t.contributionDetail + ')' : ''}`, 20, 80);
    doc.text(`Mês/Ano de Ref: ${t.referenceMonth || selectedMonth} / ${t.referenceYear || selectedYear}`, 20, 90);
    
    doc.text(`Data de Emissão: ${new Date(t.createdAt || Date.now()).toLocaleDateString('pt-AO')}`, 20, 110);
    
    printReceiptFooter(doc, 130);
    
    await savePdf(doc, `Recibo_${memberName.replace(/\s+/g, '_')}_${t.referenceMonth || selectedMonth}.pdf`);
    toast.success("Recibo gerado com sucesso.");
  };

  const batchPrintReceipts = async () => {
    if (tithes.length === 0) {
      toast.warning("Sem entradas para imprimir.");
      return;
    }
    const doc = new jsPDF('portrait', 'mm', 'a4') as any;
    let yOffset = 0;

    let churchName = 'Igreja local de Emanuel - Xangongo';
    let logoUrl = '';
    const churchInfoString = prefGet('church-settings');
    if (churchInfoString) {
      try {
        const info = JSON.parse(churchInfoString);
        if (info.nome) churchName = info.nome;
        if (info.logoUrl) logoUrl = info.logoUrl;
      } catch (e) {}
    }

    tithes.forEach((t, index) => {
      if (index > 0 && index % 2 === 0) {
        doc.addPage();
        yOffset = 0;
      }
      
      const memberName = members.find(m => m.id === t.memberId)?.name || 'Membro';
      const amount = formatKz(t.amount);
      
      const receiptNum = t.receiptNumber || t.id.substring(0,8).toUpperCase();
      printReceiptHeaderFooter(doc, churchName, logoUrl, receiptNum, yOffset, false);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(`Recebemos de: ${memberName}`, 20, yOffset + 60);
      doc.text(`A quantia de: ${amount}`, 20, yOffset + 70);
      doc.text(`Referente a: ${t.contributionType || 'Dízimo'} ${t.contributionDetail ? '(' + t.contributionDetail + ')' : ''}`, 20, yOffset + 80);
      doc.text(`Mês/Ano de Ref: ${t.referenceMonth || selectedMonth} / ${t.referenceYear || selectedYear}`, 20, yOffset + 90);
      doc.text(`Data de Emissão: ${new Date(t.createdAt || Date.now()).toLocaleDateString('pt-AO')}`, 20, yOffset + 110);
      
      printReceiptFooter(doc, yOffset + 130);
      
      doc.setLineDashPattern([5, 5], 0);
      doc.line(10, yOffset + 145, 200, yOffset + 145); // Separator line
      doc.setLineDashPattern([], 0);
      
      yOffset += 148; // Move down for the next receipt on the same page
    });
    
    await savePdf(doc, `Recibos_Lote_${selectedMonth}_${selectedYear}.pdf`);
    toast.success("Recibos gerados em lote com sucesso.");
  };

  const exportOfferingReceiptPDF = async (o: any) => {
    const doc = new jsPDF();
    const amount = formatKz(o.amount);
    
    let churchName = 'Igreja local de Emanuel - Xangongo';
    let logoUrl = '';
    const churchInfoString = prefGet('church-settings');
    if (churchInfoString) {
      try {
        const info = JSON.parse(churchInfoString);
        if (info.nome) churchName = info.nome;
        if (info.logoUrl) logoUrl = info.logoUrl;
      } catch (e) {}
    }

    const receiptNum = o.receiptNumber || o.id.substring(0,8).toUpperCase();
    printReceiptHeaderFooter(doc, churchName, logoUrl, receiptNum, 0, true);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Tipo de Oferta: ${o.type}`, 20, 60);
    doc.text(`Descrição: ${o.description}`, 20, 70);
    doc.text(`A quantia de: ${amount}`, 20, 80);
    doc.text(`Mês/Ano de Ref: ${selectedMonth} / ${selectedYear}`, 20, 90);
    
    doc.text(`Data de Emissão: ${new Date(o.createdAt || Date.now()).toLocaleDateString('pt-AO')}`, 20, 110);
    
    printReceiptFooter(doc, 130);
    
    await savePdf(doc, `Recibo_Oferta_${o.type}_${selectedMonth}.pdf`);
    toast.success("Recibo gerado com sucesso.");
  };

  const filteredTithes = tithes.filter(t => {
    const memberName = members.find(m => m.id === t.memberId)?.name || '';
    const search = searchTithes.toLowerCase();
    return memberName.toLowerCase().includes(search) || t.contributionType?.toLowerCase().includes(search) || t.receiptNumber?.toLowerCase().includes(search);
  });

  const filteredOfferings = offerings.filter(o => 
    o.description?.toLowerCase().includes(searchOfferings.toLowerCase()) || o.type?.toLowerCase().includes(searchOfferings.toLowerCase())
  );

  const filteredExpenses = expenses.filter(e => 
    e.description?.toLowerCase().includes(searchExpenses.toLowerCase()) || e.responsible?.toLowerCase().includes(searchExpenses.toLowerCase()) || e.category?.toLowerCase().includes(searchExpenses.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestão Mensal</h2>
          <p className="text-muted-foreground">Registo de entradas e saídas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button variant="outline" onClick={exportFinancesExcel}>
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Exportar (Excel)</span>
          </Button>
          <Button variant="outline" onClick={batchPrintReceipts}>
            <Printer className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Lote (Recibos)</span>
          </Button>
          <Button 
            variant={financialMonth?.status === 'open' ? 'secondary' : financialMonth?.status === 'closed' ? 'outline' : 'default'}
            onClick={toggleMonthStatus}
            disabled={financialMonth?.status === 'closed' && userRole !== 'admin'}
          >
            {financialMonth ? (financialMonth.status === 'open' ? 'Encerrar Mês' : 'Mês Encerrado') : 'Abrir Mês'}
          </Button>
          <Button 
            variant={financialYear?.status === 'open' ? 'secondary' : financialYear?.status === 'closed' ? 'outline' : 'default'}
            onClick={toggleYearStatus}
            disabled={financialYear?.status === 'closed' && userRole !== 'admin'}
          >
            {financialYear ? (financialYear.status === 'open' ? 'Encerrar Ano' : 'Ano Encerrado') : 'Abrir Ano'}
          </Button>
        </div>
      </div>

        <Tabs defaultValue="estatisticas" className="w-full">
          <TabsList className="grid w-full grid-cols-4 md:w-[500px]">
            <TabsTrigger value="estatisticas">Análise</TabsTrigger>
            <TabsTrigger value="dizimos">Membros</TabsTrigger>
            <TabsTrigger value="ofertas">Ofertas</TabsTrigger>
            <TabsTrigger value="saidas">Saídas</TabsTrigger>
          </TabsList>
          
          <TabsContent value="estatisticas">
            <YearlyStats year={selectedYear} />
          </TabsContent>

          <TabsContent value="dizimos" className="mt-4">
            <Card>
              <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Entradas de Membros - {selectedMonth}</CardTitle>
                  <CardDescription>Total: {ptAOA(tithes.reduce((a, b) => a + b.amount, 0))} ({filteredTithes.length} registos)</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input placeholder="Pesquisar membro ou recibo..." value={searchTithes} onChange={e => setSearchTithes(e.target.value)} className="w-[200px]" />
                  <Dialog open={isTOpen} onOpenChange={isClosed ? undefined : (o) => { setIsTOpen(o); if (o && !editingTithe) resetTD(); }}>
                    <DialogTrigger asChild><Button disabled={isClosed}><Plus className="w-4 h-4 mr-2" /> Registar</Button></DialogTrigger>
                  <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Registar Entrada de Membro</DialogTitle>
                      <DialogDescription className="sr-only">Preencha os dados</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddTithe} className="space-y-4 px-5 py-4">
                    <FormSection title="Dados da entrada">
                      <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-2.5 flex flex-wrap items-center gap-2">
                        <span className="text-body-sm font-medium text-muted-foreground mr-auto">Recebeu por transferência ou depósito?</span>
                        <Button type="button" variant="outline" className="gap-1.5" onClick={() => setReceiptDocOpen(true)}>
                          Ler comprovativo com IA
                        </Button>
                        <DocumentReaderModal
                          open={receiptDocOpen}
                          onOpenChange={setReceiptDocOpen}
                          kind="comprovativo"
                          onApply={(f) => {
                            setTD(prev => ({
                              ...prev,
                              amount: f.amount !== undefined && f.amount !== null ? String(f.amount) : prev.amount,
                              contributionDetail: [
                                prev.contributionDetail,
                                [f.date ? 'Data: ' + f.date : null, f.bank ? 'Banco: ' + f.bank : null, f.payerName ? 'Pagador: ' + f.payerName : null, f.reference ? 'Ref: ' + f.reference : null].filter(Boolean).join(' · ')
                              ].filter(Boolean).join(' | ')
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-2 flex flex-col">
                        <Label>Membro</Label>
                        <Popover open={memberSearchOpen} onOpenChange={setMemberSearchOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={memberSearchOpen}
                              className="w-full justify-between font-normal"
                            >
                              {tD.memberId
                                ? getMemberName(tD.memberId)
                                : "Seleccione ou pesquise o membro..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput 
                                placeholder="Pesquisar membro..." 
                                value={memberSearchQuery}
                                onValueChange={handleMemberSearch}
                              />
                              <CommandList className="max-h-60 overflow-y-auto">
                                {isSearchingMembers && (
                                  <div className="flex items-center justify-center p-2 text-xs text-muted-foreground gap-1.5">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    A pesquisar no servidor...
                                  </div>
                                )}
                                {members.filter(m => !memberSearchQuery || m.name.toLowerCase().includes(memberSearchQuery.toLowerCase())).length === 0 && !isSearchingMembers && (
                                  <CommandEmpty>Nenhum membro encontrado.</CommandEmpty>
                                )}
                                <CommandGroup>
                                  {members
                                    .filter(m => !memberSearchQuery || m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                                    .map((m) => (
                                    <CommandItem
                                      key={m.id}
                                      value={m.name}
                                      onSelect={() => {
                                        setTD({ ...tD, memberId: m.id });
                                        setMemberLookup(prev => ({ ...prev, [m.id]: m.name }));
                                        setMemberSearchOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          tD.memberId === m.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {m.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                                {hasMoreMembers && !memberSearchQuery && (
                                  <div className="p-2 border-t text-center">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled={isLoadingMoreMembers}
                                      onClick={loadMoreMembers}
                                      className="w-full text-xs text-primary h-7"
                                    >
                                      {isLoadingMoreMembers ? (
                                        <span className="flex items-center gap-1.5 justify-center">
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> A carregar...
                                        </span>
                                      ) : (
                                        "Carregar mais membros (+40)"
                                      )}
                                    </Button>
                                  </div>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {/* Hidden input to handle 'required' attribute since Popover doesn't do it */}
                        <input type="text" required value={tD.memberId} className="hidden" readOnly onChange={() => {}} />
                      </div>

                      <div className="space-y-2">
                        <Label>Tipo de Contribuição</Label>
                        <Select required value={tD.contributionType} onValueChange={v => setTD({...tD, contributionType: v})}>
                          <SelectTrigger><SelectValue placeholder="Seleccione o tipo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Dízimo">Dízimo</SelectItem>
                            <SelectItem value="Donativo voluntário">Donativo voluntário</SelectItem>
                            <SelectItem value="Fundo para missões">Fundo para missões</SelectItem>
                            <SelectItem value="Segurança Social">Segurança Social</SelectItem>
                            <SelectItem value="Compra de Literatura">Compra de Literatura</SelectItem>
                            <SelectItem value="Contribuição">Contribuição</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {tD.contributionType === 'Donativo voluntário' || tD.contributionType === 'Contribuição' ? (
                         <div className="space-y-2">
                            <Label>Especificar detalhes (Opcional)</Label>
                            <Input value={tD.contributionDetail} onChange={e => setTD({...tD, contributionDetail: e.target.value})} placeholder="Para qual finalidade?" />
                         </div>
                      ) : null}

                      <div className="space-y-2">
                        <Label>Valor Total (Kz)</Label>
                        <MoneyText required value={tD.amount} onChange={v => setTD({...tD, amount: v})} placeholder="0,00" />
                      </div>

                      <div className="p-3 bg-muted rounded-md border border-border space-y-4">
                        <div className="form-grid">
                          <div className="space-y-2">
                            <Label>Mês de Entrega (contabilidade)</Label>
                            <Select value={tD.deliveryMonth} onValueChange={v => setTD(prev => ({
                              ...prev,
                              deliveryMonth: v,
                              // por defeito a referência = entrega, até o utilizador a escolher
                              selectedMonths: prev.selectedMonths.length === 1 && prev.selectedMonths[0] === prev.deliveryMonth ? [v] : prev.selectedMonths,
                            }))}>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {MONTHS.map((nm, i2) => <SelectItem key={nm} value={String(i2 + 1).padStart(2, '0')}>{nm}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Ano de Entrega</Label>
                            <Select value={tD.deliveryYear} onValueChange={v => setTD(prev => ({
                              ...prev,
                              deliveryYear: v,
                              year: prev.year === prev.deliveryYear ? v : prev.year,
                            }))}>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {['2024', '2025', '2026', '2027'].map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground -mt-2">
                          A contabilidade e os relatórios usam a entrega; o cartão do membro usa a referência.
                        </p>
                        <div className="flex flex-col space-y-2">
                          <Label>Ano de Referência</Label>
                          <Select value={tD.year} onValueChange={v => setTD({...tD, year: v})}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Ano" /></SelectTrigger>
                            <SelectContent>
                              {['2024', '2025', '2026', '2027'].map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>

                        <Label>Meses de Referência</Label>
                        <div className="form-grid">
                          {MONTHS.map((nm, i2) => {
                            const m = String(i2 + 1).padStart(2, '0');
                            const isPaid = memberRegisteredTithes.some(item => {
                              const matchMonth = referenceOf(item).month === m;
                              const matchType = (item.contributionType || 'Dízimo') === (tD.contributionType || 'Dízimo');
                              return matchMonth && matchType;
                            });

                            return (
                              <div key={m} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`month-${m}`} 
                                  checked={tD.selectedMonths.includes(m)}
                                  onCheckedChange={(checked) => {
                                    setTD(prev => ({
                                      ...prev,
                                      selectedMonths: checked 
                                        ? [...prev.selectedMonths, m]
                                        : prev.selectedMonths.filter(x => x !== m)
                                    }))
                                  }}
                                />
                                <label htmlFor={`month-${m}`} className="text-sm cursor-pointer flex items-center gap-1">
                                  <span>{idxToName(m).substring(0, 3)}</span>
                                  {isPaid && (
                                    <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1 py-0.2 rounded font-semibold" title="Já possui contribuição registada neste mês">
                                      Pago
                                    </span>
                                  )}
                                </label>
                              </div>
                            );
                          })}
                        </div>

                        {(() => {
                          const matchingDups = memberRegisteredTithes.filter(item => {
                            const matchType = (item.contributionType || 'Dízimo') === (tD.contributionType || 'Dízimo');
                            return tD.selectedMonths.includes(referenceOf(item).month) && matchType;
                          });

                          if (matchingDups.length === 0) return null;

                          const expectedValPerMonth = tD.amount ? (mvCents(tD.amount) / (tD.selectedMonths.length || 1)) : 0;
                          const hasIdenticalAmount = matchingDups.some(dup => Math.abs(dup.amount - expectedValPerMonth) < 1 || Math.abs(dup.amount - mvCents(tD.amount)) < 1);

                          return (
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-850 rounded-lg text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                              <div className="space-y-1">
                                <p className="font-semibold">Aviso de Registo Prévio:</p>
                                <p>
                                  O membro já tem {tD.contributionType || 'Dízimo'} em: {matchingDups.map(d => `${idxToName(referenceOf(d).month)} (${ptAOA(d.amount)})`).join(', ')}.
                                </p>
                                {hasIdenticalAmount && (
                                  <p className="font-bold text-red-600 dark:text-red-400">
                                    🚨 Atenção: O valor é igual ao já registado! Verifique para não lançar o mesmo recibo duas vezes.
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {tD.selectedMonths.length > 1 && (
                          <div className="space-y-4 mt-4 pt-4 border-t">
                            <div className="flex items-center space-x-2">
                              <Switch id="manual-split" checked={tD.manualSplit} onCheckedChange={c => setTD({...tD, manualSplit: c})} />
                              <Label htmlFor="manual-split">Dividir valor manualmente (Padrão: divisão igual automática)</Label>
                            </div>

                          {tD.manualSplit && (
                            <div className="space-y-2">
                              {tD.selectedMonths.map(m => (
                                <div key={`manual-${m}`} className="flex items-center gap-2">
                                  <Label className="w-20">{idxToName(m)}</Label>
                                  <MoneyText
                                    placeholder="Valor"
                                    value={tD.manualValues[m] || ''}
                                    onChange={v => setTD(prev => ({
                                      ...prev,
                                      manualValues: {...prev.manualValues, [m]: v}
                                    }))}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Nº Recibo (Opcional)</Label>
                      <Input value={tD.receiptNumber} onChange={e => setTD({...tD, receiptNumber: e.target.value})} />
                    </div>
                    </FormSection>
                    <DialogFooter className="-mx-5 -mb-4">
                      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                        {isSubmitting ? 'A guardar...' : 'Guardar'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <div className="hidden md:block">
                  <div className="overflow-x-auto"><Table className="min-w-[560px]">
                    <TableHeader>
                      <TableRow><TableHead>Recibo</TableHead><TableHead>Membro</TableHead><TableHead>Tipo</TableHead><TableHead>Ref.</TableHead><TableHead>Valor</TableHead><TableHead></TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                          </TableRow>
                        ))
                      ) : filteredTithes.map(t => (
                        <TableRow key={t.id} className={cn(t._optimistic && "opacity-85 bg-amber-50/30 dark:bg-amber-950/20")}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span>{t.receiptNumber}</span>
                              {t._optimistic && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 px-1.5 py-0.5 rounded-full animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                  A gravar...
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getMemberName(t.memberId)}</TableCell>
                          <TableCell>
                            <span className="font-medium">{t.contributionType || 'Dízimo'}</span>
                            {t.contributionDetail && <span className="block text-xs text-muted-foreground">{t.contributionDetail}</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">{t.referenceMonth ? `${t.referenceMonth.substring(0, 3)}/${t.referenceYear || '-'}` : '-'}</TableCell>
                          <TableCell>{ptAOA(t.amount)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => sendWhatsAppReceipt(t, false)} title="Enviar por WhatsApp">
                                <MessageCircle className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => exportReceiptPDF(t)} title="Baixar Recibo">
                                <FileText className="h-4 w-4 text-blue-500" />
                              </Button>
                              <Button variant="ghost" size="icon" disabled={isClosed || t._optimistic} onClick={() => openEditTithe(t)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" disabled={isClosed} onClick={() => deleteDocSafely('tithes', t.id)}>
                                <Trash2 className="text-destructive h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!loading && filteredTithes.length === 0 && <TableRow><TableCell colSpan={6} className="p-4"><EmptyState title="Sem registos de dízimos" description="Registe a primeira entrada ou ajuste o mês/pesquisa." action={<Button variant="outline" onClick={() => setIsTOpen(true)}>Registar Entrada</Button>} className="border-0 bg-transparent" /></TableCell></TableRow>}
                    </TableBody>
                  </Table></div>
                </div>
                {/* Mobile View */}
                <div className="md:hidden flex flex-col gap-4">
                   {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="border p-4 rounded-lg shadow-sm flex flex-col gap-2">
                           <div className="h-5 w-40 bg-muted animate-pulse rounded"></div>
                           <Skeleton className="h-4 w-24" />
                           <Skeleton className="h-4 w-32" />
                        </div>
                      ))
                   ) : filteredTithes.length === 0 ? (
                      <div className="p-4"><EmptyState title="Sem registos" description="Registe um novo movimento ou ajuste a pesquisa." className="border-0 bg-transparent" /></div>
                   ) : filteredTithes.map(t => (
                      <div key={t.id} className={cn("border p-4 rounded-lg shadow-sm flex flex-col gap-2 relative transition-all", t._optimistic && "opacity-90 border-dashed border-amber-400 bg-amber-50/20")}>
                         <div className="font-semibold pr-8 flex items-center gap-2">
                           <span>{getMemberName(t.memberId)}</span>
                           {t._optimistic && (
                             <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium animate-pulse">
                               A gravar...
                             </span>
                           )}
                         </div>
                         <div className="text-sm">
                            <span className="font-medium bg-secondary px-2 py-0.5 rounded-full text-xs mr-2">{t.contributionType || 'Dízimo'}</span>
                            {t.contributionDetail && <span className="text-xs text-muted-foreground block mt-1">{t.contributionDetail}</span>}
                         </div>
                         <div className="text-sm text-muted-foreground">Recibo: {t.receiptNumber} | Ref: {t.referenceMonth ? `${t.referenceMonth.substring(0, 3)}/${t.referenceYear || '-'}` : '-'}</div>
                         <div className="font-bold text-lg mb-2">{ptAOA(t.amount)}</div>
                         <div className="absolute top-2 right-2 flex gap-1">
                           <Button variant="outline" size="icon" onClick={() => sendWhatsAppReceipt(t, false)} title="Enviar por WhatsApp">
                              <MessageCircle className="h-4 w-4 text-green-500" />
                           </Button>
                           <Button variant="outline" size="icon" onClick={() => exportReceiptPDF(t)} title="Baixar Recibo">
                              <FileText className="h-4 w-4 text-blue-500" />
                           </Button>
                           <Button variant="outline" size="icon" disabled={isClosed || t._optimistic} onClick={() => openEditTithe(t)}>
                              <Pencil className="h-4 w-4" />
                           </Button>
                           <Button variant="outline" size="icon" className="text-destructive" disabled={isClosed} onClick={()=>deleteDocSafely('tithes', t.id)}>
                              <Trash2 className="h-4 w-4" />
                           </Button>
                         </div>
                      </div>
                   ))}
                </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ofertas" className="mt-4">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                 <CardTitle>Ofertas de {selectedMonth}</CardTitle>
                 <CardDescription>Total: {ptAOA(offerings.reduce((a, b) => a + b.amount, 0))} ({filteredOfferings.length} registos)</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input placeholder="Pesquisar oferta..." value={searchOfferings} onChange={e => setSearchOfferings(e.target.value)} className="w-[200px]" />
                <Dialog open={isOOpen} onOpenChange={isClosed ? undefined : setIsOOpen}>
                  <DialogTrigger asChild><Button disabled={isClosed}><Plus className="w-4 h-4 mr-2" /> Registar</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Registar Oferta</DialogTitle>
                    <DialogDescription className="sr-only">Preencha os dados da oferta</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddOffering} className="space-y-4 px-5 py-4">
                    <FormSection title="Dados da oferta">
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Input required value={oD.description} onChange={e => setOD({...oD, description: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select required value={oD.type} onValueChange={v => setOD({...oD, type: v})}>
                        <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                        <SelectContent>
                           <SelectItem value="Geral">Oferta Geral</SelectItem>
                           <SelectItem value="Missões">Fundo para Missões</SelectItem>
                           <SelectItem value="Segurança Social">Segurança Social</SelectItem>
                           <SelectItem value="Literaturas">Literaturas</SelectItem>
                           <SelectItem value="Domingo Especial">Domingo Especial</SelectItem>
                           <SelectItem value="Contribuição Sínodo">Contribuição para Sínodo</SelectItem>
                           <SelectItem value="Específica">Específica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <>
                      <div className="space-y-2">
                        <Label>Valor (Kz)</Label>
                        <MoneyText required value={oD.amount} onChange={v => setOD({...oD, amount: v})} placeholder="0,00" />
                      </div>
                      <div className="space-y-2">
                        <Label>Data Ref.</Label>
                        <Input required type="date" value={oD.referenceDate} onChange={e => setOD({...oD, referenceDate: e.target.value})} />
                      </div>
                    </>
                    {!editingOffering && oD.type !== 'Geral' && oD.type !== 'Missões' && oD.type !== 'Segurança Social' && oD.type !== 'Literaturas' && oD.type !== 'Específica' && (
                      <div className="space-y-2 pb-2">
                        <Label>Percentagem a enviar ao Sínodo (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={oD.sinodPercentage}
                          onChange={e => setOD({...oD, sinodPercentage: e.target.value})}
                          placeholder="Ex: 10"
                          required
                        />
                        <p className="text-caption text-muted-foreground">
                          Será registada uma saída automática com este valor.
                        </p>
                      </div>
                    )}
                    {!editingOffering && oD.type === 'Geral' && parseFloat(churchConfig?.offeringPercentage || '0') > 0 && (
                      <div className="space-y-2 pb-2">
                        <p className="text-caption text-info bg-info-soft p-2 rounded border border-info/30">
                          <strong>Aviso:</strong> {parseFloat(churchConfig?.offeringPercentage || '0')}% desta oferta será automaticamente registada como Saída para o Sínodo, conforme definido no Painel de Administrador.
                        </p>
                      </div>
                    )}
                    </FormSection>
                    <DialogFooter className="-mx-5 -mb-4">
                      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                        {isSubmitting ? 'A guardar...' : 'Guardar'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="hidden md:block">
                <div className="overflow-x-auto"><Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow><TableHead>Descrição</TableHead><TableHead>Tipo</TableHead><TableHead>Data Ref.</TableHead><TableHead>Valor</TableHead><TableHead></TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredOfferings.map(t => (
                      <TableRow key={t.id}>
                        <TableCell>{t.description}</TableCell>
                        <TableCell>{t.type}</TableCell>
                        <TableCell className="text-muted-foreground">{t.referenceDate ? new Date(t.referenceDate).toLocaleDateString('pt-AO') : '-'}</TableCell>
                        <TableCell>{ptAOA(t.amount)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => sendWhatsAppReceipt(t, true)} title="Enviar por WhatsApp">
                              <MessageCircle className="h-4 w-4 text-green-500" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => exportOfferingReceiptPDF(t)} title="Baixar Recibo">
                              <FileText className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="icon" disabled={isClosed} onClick={() => openEditOffering(t)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" disabled={isClosed} onClick={() => deleteDocSafely('offerings', t.id)}>
                              <Trash2 className="text-destructive h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && filteredOfferings.length === 0 && <TableRow><TableCell colSpan={5} className="p-4"><EmptyState title="Sem registos de ofertas" description="Registe a primeira oferta ou ajuste o mês/pesquisa." action={<Button variant="outline" onClick={() => setIsOOpen(true)}>Registar Oferta</Button>} className="border-0 bg-transparent" /></TableCell></TableRow>}
                  </TableBody>
                </Table></div>
              </div>
              <div className="md:hidden flex flex-col gap-4">
                 {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="border p-4 rounded-lg shadow-sm flex flex-col gap-2">
                         <div className="h-5 w-40 bg-muted animate-pulse rounded"></div>
                         <Skeleton className="h-4 w-24" />
                         <div className="h-6 w-24 bg-muted animate-pulse rounded"></div>
                      </div>
                    ))
                 ) : filteredOfferings.length === 0 ? (
                    <div className="p-4"><EmptyState title="Sem registos" description="Registe um novo movimento ou ajuste a pesquisa." className="border-0 bg-transparent" /></div>
                 ) : filteredOfferings.map(t => (
                    <div key={t.id} className="border p-4 rounded-lg shadow-sm flex flex-col gap-2 relative">
                       <div className="font-semibold">{t.description}</div>
                       <div className="text-sm text-muted-foreground">Tipo: {t.type} {t.referenceDate && `| Data Ref.: ${new Date(t.referenceDate).toLocaleDateString('pt-AO')}`}</div>
                       <div className="font-bold text-lg mb-2">{ptAOA(t.amount)}</div>
                       <div className="absolute top-2 right-2 flex gap-1">
                         <Button variant="outline" size="icon" onClick={() => sendWhatsAppReceipt(t, true)} title="Enviar por WhatsApp">
                            <MessageCircle className="h-4 w-4 text-green-500" />
                         </Button>
                         <Button variant="outline" size="icon" onClick={() => exportOfferingReceiptPDF(t)} title="Baixar Recibo">
                            <FileText className="h-4 w-4 text-blue-500" />
                         </Button>
                         <Button variant="outline" size="icon" disabled={isClosed} onClick={() => openEditOffering(t)}>
                            <Pencil className="h-4 w-4" />
                         </Button>
                         <Button variant="outline" size="icon" className="text-destructive" disabled={isClosed} onClick={()=>deleteDocSafely('offerings', t.id)}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                       </div>
                    </div>
                 ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="saidas" className="mt-4">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                  <CardTitle>Saídas de {selectedMonth}</CardTitle>
                  <CardDescription className="text-destructive">Total: {ptAOA(expenses.reduce((a, b) => a + b.amount, 0))} ({filteredExpenses.length} registos)</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input placeholder="Pesquisar saída/categoria..." value={searchExpenses} onChange={e => setSearchExpenses(e.target.value)} className="w-[200px]" />
                <Dialog open={isEOpen} onOpenChange={isClosed ? undefined : setIsEOpen}>
                  <DialogTrigger asChild><Button variant="destructive" disabled={isClosed}><Plus className="w-4 h-4 mr-2" /> Registar Despesa</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Registar Saída</DialogTitle>
                    <DialogDescription className="sr-only">Preencha os dados da saída</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddExpense} className="space-y-4 px-5 py-4">
                    <FormSection title="Dados da saída">
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Input required value={eD.description} onChange={e => setED({...eD, description: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <Select required value={eD.category} onValueChange={v => {
                        setED({...eD, category: v});
                        if (v === 'Personalizada') setIsCustomCategory(true);
                        else setIsCustomCategory(false);
                      }}>
                        <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                        <SelectContent>
                           <SelectItem value="Manutenção">Manutenção e Obras</SelectItem>
                           <SelectItem value="Evangelismo">Evangelismo/Missões</SelectItem>
                           <SelectItem value="Administração">Administração</SelectItem>
                           <SelectItem value="Sustento">Sustento Pastoral</SelectItem>
                           <SelectItem value="Outros">Outros</SelectItem>
                           {Array.from(new Set(expenses.map(e => e.category))).filter((c): c is string => typeof c === 'string' && !["Manutenção", "Evangelismo", "Administração", "Sustento", "Outros", "Personalizada", "Manutenção e Obras", "Evangelismo/Missões", "Sustento Pastoral"].includes(c)).map(c => (
                             <SelectItem key={c} value={c}>{c}</SelectItem>
                           ))}
                           <SelectItem value="Personalizada">Outro (Personalizada)...</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {isCustomCategory && (
                      <div className="space-y-2">
                        <Label>Nova Categoria</Label>
                        <Input required value={eD.customCategory} onChange={e => setED({...eD, customCategory: e.target.value})} placeholder="Digite a nova categoria" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input type="date" required value={eD.referenceDate} onChange={e => setED({...eD, referenceDate: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Responsável</Label>
                      <Input required value={eD.responsible} onChange={e => setED({...eD, responsible: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor (Kz)</Label>
                      <MoneyText required value={eD.amount} onChange={v => setED({...eD, amount: v})} placeholder="0,00" />
                    </div>
                    <div className="space-y-2">
                      <Label>Comprovativo (Opcional, max: 800KB)</Label>
                      <Input type="file" accept="image/*,application/pdf" onChange={handleReceiptUpload} />
                      {eD.receiptBase64 && <p className="text-body-sm text-success font-medium">Comprovativo carregado!</p>}
                    </div>
                    </FormSection>
                    <DialogFooter className="-mx-5 -mb-4">
                      <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto" variant="destructive">
                        {isSubmitting ? 'A registar...' : 'Registar Despesa'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="hidden md:block">
                <div className="overflow-x-auto"><Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow><TableHead>Data/Desc.</TableHead><TableHead>Responsável</TableHead><TableHead>Categoria</TableHead><TableHead>Valor</TableHead><TableHead></TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredExpenses.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.description}</TableCell>
                        <TableCell>{t.responsible}</TableCell>
                        <TableCell>{t.category}</TableCell>
                        <TableCell className="text-destructive font-medium">{ptAOA(t.amount)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {t.hasReceipt && (
                              <Button variant="ghost" size="icon" onClick={()=>viewReceipt(t.id)} title="Ver Comprovativo">
                                <FileText className="h-4 w-4 text-slate-500" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={()=>deleteDocSafely('expenses', t.id)} title="Apagar">
                              <Trash2 className="text-destructive h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && filteredExpenses.length === 0 && <TableRow><TableCell colSpan={5} className="p-4"><EmptyState title="Sem registos de saídas" description="Registe a primeira saída ou ajuste o mês/pesquisa." action={<Button variant="outline" onClick={() => setIsEOpen(true)}>Registar Saída</Button>} className="border-0 bg-transparent" /></TableCell></TableRow>}
                  </TableBody>
                </Table></div>
              </div>
              <div className="md:hidden flex flex-col gap-4">
                 {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="border p-4 rounded-lg shadow-sm flex flex-col gap-2 border-destructive/20">
                         <div className="h-5 w-40 bg-muted animate-pulse rounded"></div>
                         <Skeleton className="h-4 w-32" />
                         <div className="h-6 w-24 bg-muted animate-pulse rounded"></div>
                      </div>
                    ))
                 ) : filteredExpenses.length === 0 ? (
                    <div className="p-4"><EmptyState title="Sem registos" description="Registe um novo movimento ou ajuste a pesquisa." className="border-0 bg-transparent" /></div>
                 ) : filteredExpenses.map(t => (
                    <div key={t.id} className="border p-4 rounded-lg shadow-sm flex flex-col gap-2 relative border-destructive/20">
                       <div className="font-semibold">{t.description}</div>
                       <div className="text-sm text-muted-foreground">Responsável: {t.responsible} | Categoria: {t.category}</div>
                       <div className="font-bold text-lg text-destructive">{ptAOA(t.amount)}</div>
                       <div className="absolute top-2 right-2 flex gap-1">
                         {t.hasReceipt && (
                           <Button variant="ghost" size="icon" onClick={()=>viewReceipt(t.id)} title="Ver Comprovativo">
                              <FileText className="h-4 w-4 text-slate-500" />
                           </Button>
                         )}
                         <Button variant="ghost" size="icon" className="text-destructive" onClick={()=>deleteDocSafely('expenses', t.id)}>
                            <Trash2 className="h-4 w-4" />
                         </Button>
                       </div>
                    </div>
                 ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
