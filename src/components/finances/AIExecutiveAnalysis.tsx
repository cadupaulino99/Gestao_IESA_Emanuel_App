import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Sparkles, TrendingUp, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { aiFinancialInsights } from '../../lib/ai';

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
      toast.success('Parecer executivo gerado com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao gerar parecer com IA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-purple-200/60 dark:border-purple-900/50 bg-gradient-to-br from-purple-50/40 via-background to-indigo-50/30 dark:from-purple-950/20 dark:via-background dark:to-indigo-950/10 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            Parecer Executivo & Insights com IA (Gemini 3.8 Flash)
          </CardTitle>
          <CardDescription className="text-xs">
            Diagnóstico instantâneo sobre a saúde das finanças, equilíbrio das despesas e recomendações de tesouraria.
          </CardDescription>
        </div>
        <Button
          onClick={handleGenerateAnalysis}
          disabled={loading}
          size="sm"
          className="gap-2 bg-purple-600 hover:bg-purple-700 text-white shadow-xs"
        >
          {loading ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>A analisar dados...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              <span>{analysis ? 'Actualizar Análise' : 'Gerar Diagnóstico IA'}</span>
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {analysis ? (
          <div className="p-4 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-purple-100 dark:border-purple-900/40 text-sm whitespace-pre-wrap font-sans leading-relaxed text-slate-800 dark:text-slate-200">
            {analysis}
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
            <span>
              Carregue no botão para processar receitas ({financialStats.totalTithes + financialStats.totalOfferings} Kz), saídas ({financialStats.totalExpenses} Kz) e propor acções estratégicas.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
