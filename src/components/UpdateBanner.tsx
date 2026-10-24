import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownToLine, X, Rocket } from 'lucide-react';
import { Button } from './ui/button';
import { checkForUpdate, openUpdate, currentVersion, type UpdateInfo } from '../lib/updateCheck';
import { prefGet, prefSet } from '../lib/prefs';

const DISMISS_KEY = 'update-dismissed-tag';

/**
 * Banner discreto no topo: «Nova versão disponível — tocar para instalar».
 * Mostra-se uma vez por versão nova; «Agora não» guarda a decisão para essa tag.
 */
export default function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async (force = false, silent = true) => {
      const u = await checkForUpdate(force);
      if (!alive) return;
      if (!u) {
        if (force && silent) toast.info(`Sem atualizações: está na versão ${currentVersion()}.`);
        return;
      }
      if (prefGet(DISMISS_KEY) === u.tag) return;
      setInfo(u);
    };
    run();
    const onRetry = () => run(true, false);
    const onManual = () => run(true, true);
    const onVisible = () => { if (document.visibilityState === 'visible') run(false, false); };
    window.addEventListener('iesa:update-retry', onRetry);
    window.addEventListener('iesa:check-update', onManual);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener('iesa:update-retry', onRetry);
      window.removeEventListener('iesa:check-update', onManual);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!info) return null;

  return (
    <div className="mb-4 rounded-2xl border border-emerald-300/60 dark:border-emerald-800/60 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-3 pr-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
          <Rocket className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            Nova versão disponível: {info.tag.replace(/^v/, '')}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-tight mt-0.5">
            Instala por cima da atual — não perdes dados nem gravações.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          onClick={() => openUpdate(info.apkUrl)}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" /> Instalar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-slate-500"
          title="Agora não"
          onClick={() => {
            prefSet(DISMISS_KEY, info.tag);
            setInfo(null);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
