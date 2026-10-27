import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { currentVersion } from '../lib/updateCheck';

/* ═══════════════════════════════════════════════════════════════════════
   v1.14.3 (auditoria) — Fronteira de erros GLOBAL.
   Antes: qualquer excepção de render = ECRÃ BRANCO na WebView, sem forma
   de recuperar (nem menu, nem botões). Agora: painel amigo com o resumo
   do erro, a versão instalada (para o diagnóstico telefónico) e recarregar.
   ═══════════════════════════════════════════════════════════════════════ */

interface Props {
  children?: any;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Erro de interface (ErrorBoundary):', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children as any;
    const msg = String(this.state.error?.message || this.state.error || '').slice(0, 300);
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border bg-background p-6 text-center space-y-4 shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/40">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-bold">Algo correu mal nesta página</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A aplicação encontrou um erro inesperado. Os seus dados estão guardados no
            servidor — recarregar resolve na maioria dos casos.
          </p>
          {msg && (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-left text-[11px] break-all text-muted-foreground">
              {msg}
            </p>
          )}
          <Button className="w-full gap-2" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" /> Recarregar aplicação
          </Button>
          <p className="text-[10px] text-slate-400">
            Versão instalada: v{currentVersion()} — se o erro persistir, verifique se há
            uma actualização disponível e reporte esta mensagem ao administrador.
          </p>
        </div>
      </div>
    );
  }
}
