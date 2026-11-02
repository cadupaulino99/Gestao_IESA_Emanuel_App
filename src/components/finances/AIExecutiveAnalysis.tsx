import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { FileText, RefreshCw, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { aiFinancialInsights } from '../../lib/ai';
import { formatKz } from '../../lib/money';

interface AIExecutiveAnalysisProps {
  financialStats: {
    totalTithes: number;
    totalOfferings: number;
    totalExpenses: number;
    balance: number;
    totalMembers: number;
    activeMembers: number;
    year: number;
  };
}

export function AIExecutiveAnalysis({ financialStats }: AIExecutiveAnalysisProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerateAnalysis = async () => {
    setLoading(true);
    try {
      const text = await aiFinancialInsights(financialStats);
      setAnalysis(text);
      toast.success('Parecer administrativo gerado.');
    } catch (err: any) {
      toast.error('Não foi possível gerar o parecer: ' + (err?.message || 'erro desconhecido.'));
    } finally {
      setLoading(false);
    }
  };

  const entradas = financialStats.totalTithes + financialStats.totalOfferings;

  return (
    <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-slate-800">
      <div className="h-1 w-full bg-gradient-to-r from-slate-800 via-slate-600 to-emerald-600" />
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
              <FileText className="h-4 w-4" />
            </span>
            Parecer administrativo
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Síntese da tesouraria de {financialStats.year}: entradas, despesas e recomendações para a liderança.
          </CardDescription>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Entradas {formatKz(entradas)}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Saídas {formatKz(financialStats.totalExpenses)}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Saldo {formatKz(financialStats.balance)}
            </span>
          </div>
        </div>
        <Button
          onClick={handleGenerateAnalysis}
          disabled={loading}
          size="sm"
          className="h-9 shrink-0 gap-2 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {loading ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              A elaborar…
            </>
          ) : (
            <>
              <BarChart3 className="h-3.5 w-3.5" />
              {analysis ? 'Actualizar parecer' : 'Gerar parecer'}
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {analysis ? (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
            {analysis}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-muted-foreground dark:border-slate-800">
            Clique em <span className="font-medium text-foreground">Gerar parecer</span> para obter um diagnóstico
            com base nos números actuais da igreja.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
