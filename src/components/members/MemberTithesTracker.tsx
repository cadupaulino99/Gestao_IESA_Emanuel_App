import React, { useState, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Check, X, Search, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function MemberTithesTracker() {
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'most_tithes' | 'least_tithes'>('name');

  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['members_for_tithes'],
    queryFn: async () => {
      try {
        const snapshot = await getDocs(query(collection(db, 'members'), where('status', '==', 'Activo')));
        return snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'members');
        return [];
      }
    }
  });

  const { data: tithes = [], isLoading: loadingTithes } = useQuery({
    queryKey: ['tithes_for_tracker', selectedYear],
    queryFn: async () => {
      try {
        // Buscamos pelos dízimos registados no ano selecionado.
        // O referenceYear pode ser diferente do ano de registo, mas a maioria será igual.
        // Para uma precisão total, devíamos usar um índice composto ou carregar todos os dízimos do ano de referência,
        // mas o Firestore não suporta um "OR" simples entre campos diferentes facilmente sem índices.
        // Vamos pesquisar pelo ano de registo (year) e/ou referenceYear se possível, 
        // ou simplesmente trazer todos os do ano de registo e os do ano de referência.
        const snapshot1 = await getDocs(query(collection(db, 'tithes'), where('referenceYear', '==', selectedYear)));
        const snapshot2 = await getDocs(query(collection(db, 'tithes'), where('year', '==', selectedYear)));
        
        const uniqueDocs = new Map();
        [...snapshot1.docs, ...snapshot2.docs].forEach(doc => {
           uniqueDocs.set(doc.id, doc);
        });

        return Array.from(uniqueDocs.values()).map(doc => {
          const data = doc.data();
          // referenceMonth is like 'Janeiro', 'Fevereiro', etc.
          const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
          const refMonth = data.referenceMonth || data.month;
          return {
            id: doc.id,
            memberId: data.memberId,
            month: MONTHS_PT.indexOf(refMonth), // 0-11
            refYear: data.referenceYear || data.year,
          };
        }).filter(t => t.refYear === selectedYear);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'tithes');
        return [];
      }
    }
  });

  const memberStats = useMemo(() => {
    if (!members.length) return [];

    const statsMap = new Map<string, { id: string; name: string; months: boolean[]; total: number }>();

    members.forEach(m => {
      statsMap.set(m.id, {
        id: m.id,
        name: m.name,
        months: Array(12).fill(false),
        total: 0
      });
    });

    tithes.forEach(t => {
      if (statsMap.has(t.memberId) && t.month >= 0 && t.month < 12) {
        const memberStat = statsMap.get(t.memberId)!;
        if (!memberStat.months[t.month]) {
          memberStat.months[t.month] = true;
          memberStat.total++;
        }
      }
    });

    let result = Array.from(statsMap.values());

    if (searchTerm) {
      result = result.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'most_tithes') {
      result.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    } else if (sortBy === 'least_tithes') {
      result.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
    }

    return result;
  }, [members, tithes, searchTerm, sortBy]);

  const currentMonthTithedCount = useMemo(() => {
    let count = 0;
    tithes.forEach(t => {
      if (t.month === currentMonthIdx) {
        // Count unique members who tithed this month
        count++;
      }
    });
    // This could have duplicates if multiple tithes exist for the same month for a member.
    // Let's do it safer:
    const tithedThisMonth = new Set<string>();
    tithes.forEach(t => {
      if (t.month === currentMonthIdx) {
        tithedThisMonth.add(t.memberId);
      }
    });
    return tithedThisMonth.size;
  }, [tithes, currentMonthIdx]);

  const isLoading = loadingMembers || loadingTithes;
  const [isExporting, setIsExporting] = useState(false);

  // Generate an array of years from currentYear down to 2024
  const availableYears = [];
  for (let y = currentYear; y >= 2024; y--) {
    availableYears.push(y);
  }

  const handleExportExcel = async () => {
    setIsExporting(true);
    
    // Simulate slight delay to show spinner and allow UI update
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const wsData: any[][] = [];
      
      // Header row
      const header = ['Nome do Membro', ...MONTHS, 'Total Anual', '% Cumprimento'];
      wsData.push(header);
      
      // Data rows
      memberStats.forEach(stat => {
        const row = [stat.name];
        
        stat.months.forEach((tithed, idx) => {
          const isFuture = selectedYear === currentYear && idx > currentMonthIdx;
          if (tithed) {
            row.push('Dizimou');
          } else if (isFuture) {
            row.push('-');
          } else {
            row.push('Não Dizimou');
          }
        });
        
        row.push(stat.total);
        
        const maxMonths = selectedYear === currentYear ? currentMonthIdx + 1 : 12;
        const pct = Math.min(100, Math.round((stat.total / maxMonths) * 100));
        row.push(`${pct}%`);
        
        wsData.push(row);
      });
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      // Auto-size columns
      const colWidths = [
        { wch: 40 }, // Name
        ...Array(12).fill({ wch: 15 }), // Months
        { wch: 15 }, // Total
        { wch: 15 }  // %
      ];
      ws['!cols'] = colWidths;
      
      // Freeze header row and first column
      ws['!freeze'] = { xSplit: 1, ySplit: 1, topLeftCell: 'B2', activePane: 'bottomRight', state: 'frozen' };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dízimos");
      
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Dizimos_${selectedYear}_${dateStr}.xlsx`;
      
      XLSX.writeFile(wb, fileName);
      toast.success('Exportação concluída com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar o ficheiro para Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-lg">Total de Membros Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{members.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-lg">Dizimaram este mês ({MONTHS[currentMonthIdx]})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{currentMonthTithedCount}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {members.length > 0 ? Math.round((currentMonthTithedCount / members.length) * 100) : 0}% de adesão
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle>Painel de Dízimos</CardTitle>
              <CardDescription>Acompanhamento mensal das contribuições de cada membro.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Pesquisar membro..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="w-full md:w-[160px]">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nome (A-Z)</SelectItem>
                  <SelectItem value="most_tithes">Mais Cumpridores</SelectItem>
                  <SelectItem value="least_tithes">Em Atraso</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                <SelectTrigger className="w-full md:w-[120px]">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                className="w-full md:w-auto" 
                onClick={handleExportExcel} 
                disabled={isExporting || memberStats.length === 0}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                <span className="hidden sm:inline">Exportar para Excel</span>
                <span className="sm:hidden">Excel</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px]">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  <TableHead className="min-w-[200px] font-semibold sticky left-0 bg-background/95 backdrop-blur z-20">Membro</TableHead>
                  {MONTHS.map(m => (
                    <TableHead key={m} className="text-center w-12 px-2 text-xs font-semibold">{m}</TableHead>
                  ))}
                  <TableHead className="text-center font-semibold">Total</TableHead>
                  <TableHead className="text-center font-semibold">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="sticky left-0 bg-background z-10"><div className="h-4 w-32 bg-muted animate-pulse rounded"></div></TableCell>
                      {MONTHS.map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-4 mx-auto bg-muted animate-pulse rounded"></div></TableCell>
                      ))}
                      <TableCell><div className="h-4 w-6 mx-auto bg-muted animate-pulse rounded"></div></TableCell>
                      <TableCell><div className="h-4 w-8 mx-auto bg-muted animate-pulse rounded"></div></TableCell>
                    </TableRow>
                  ))
                ) : memberStats.length === 0 ? (
                  <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground">Nenhum membro encontrado.</TableCell></TableRow>
                ) : (
                  memberStats.map(stat => (
                    <TableRow key={stat.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium sticky left-0 bg-background/95 backdrop-blur z-10 truncate max-w-[200px]" title={stat.name}>
                        {stat.name}
                      </TableCell>
                      {stat.months.map((tithed, idx) => {
                        const isFuture = selectedYear === currentYear && idx > currentMonthIdx;
                        return (
                          <TableCell key={idx} className="text-center p-2">
                            {tithed ? (
                              <div className="flex justify-center" title="Dizimou">
                                <Check className="h-4 w-4 text-emerald-500" />
                              </div>
                            ) : isFuture ? (
                              <div className="flex justify-center text-muted-foreground/30" title="Ainda não aplicável">-</div>
                            ) : (
                              <div className="flex justify-center" title="Não Dizimou">
                                <X className="h-4 w-4 text-destructive/50" />
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-semibold">
                        <Badge variant="outline" className={stat.total === 12 ? "border-emerald-500 text-emerald-600" : ""}>
                          {stat.total}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          // Se for o ano atual, percentagem pode basear-se nos meses que já passaram, ou do ano total
                          // Se basear nos meses decorridos (currentMonthIdx + 1):
                          const maxMonths = selectedYear === currentYear ? currentMonthIdx + 1 : 12;
                          const pct = Math.min(100, Math.round((stat.total / maxMonths) * 100));
                          return (
                            <span className={`text-xs font-medium ${pct >= 80 ? 'text-emerald-600' : pct < 50 ? 'text-destructive' : 'text-amber-500'}`}>
                              {pct}%
                            </span>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
