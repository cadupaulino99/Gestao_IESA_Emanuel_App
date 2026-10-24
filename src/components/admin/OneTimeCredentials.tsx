import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { Copy, Mail, MessageCircle, Smartphone, AlertTriangle } from 'lucide-react';
import { buildShareMessage, shareLinks, type ShareCtx } from '../../lib/admins';
import { openExternal } from '../../lib/download';
import { useConfirm } from '../../context/ConfirmContext';

interface Props {
  ctx: ShareCtx | null;
  onClose: () => void;
}

/**
 * Ecrã de credenciais de USO ÚNICO: mostra utilizador + palavra-passe temporária
 * uma única vez, com partilha pronta (copiar / WhatsApp / SMS / email).
 * Ao fechar, o valor é descartado do estado — não fica guardado em lado nenhum.
 */
export default function OneTimeCredentials({ ctx, onClose }: Props) {
  const confirmDialog = useConfirm();
  if (!ctx) return null;
  const msg = buildShareMessage(ctx);
  const links = shareLinks(msg, ctx.phone, ctx.email);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg);
      toast.success('Mensagem copiada.');
    } catch {
      toast.error('Não foi possível copiar neste dispositivo.');
    }
  };

  return (
    <Dialog
      open={!!ctx}
      onOpenChange={async (o) => {
        if (!o) {
          const ok = await confirmDialog(
            'Atenção: ao fechar este ecrã a palavra-passe temporária DEIXA de poder ser vista. Guarde-a ou partilhe-a agora. Fechar mesmo assim?',
            'FECHAR'
          );
          if (ok) onClose();
        }
      }}
    >
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Credenciais do administrador</DialogTitle>
          <DialogDescription>
            Mostram-se UMA única vez. A palavra-passe não fica guardada em texto
            legível em nenhum sítio do sistema — o Firebase Auth guarda apenas o hash.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border p-3 space-y-1.5 text-sm bg-slate-50 dark:bg-slate-900/60">
          <div><span className="text-muted-foreground">Nome:</span> <b>{ctx.name || '—'}</b></div>
          <div><span className="text-muted-foreground">Utilizador:</span> <b className="break-all">{ctx.email}</b></div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Palavra-passe temporária:</span>
            <code className="font-mono font-bold text-emerald-700 dark:text-emerald-400 select-all">{ctx.tempPassword}</code>
          </div>
          <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 pt-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Válida 7 dias e obriga a definição de palavra-passe nova no primeiro acesso.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={copy} className="gap-1.5"><Copy className="h-4 w-4" /> Copiar mensagem</Button>
          {links.wa && (
            <Button variant="outline" onClick={() => openExternal(links.wa!)} className="gap-1.5">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
            </Button>
          )}
          {links.sms && (
            <Button variant="outline" onClick={() => openExternal(links.sms!)} className="gap-1.5">
              <Smartphone className="h-4 w-4 text-blue-600" /> SMS
            </Button>
          )}
          {links.mail && (
            <Button variant="outline" onClick={() => openExternal(links.mail!)} className="gap-1.5">
              <Mail className="h-4 w-4 text-slate-600" /> Email
            </Button>
          )}
        </div>
        {!ctx.phone && (
          <p className="text-[11px] text-muted-foreground">
            Sem telefone no formulário, os botões WhatsApp/SMS ficam ocultos.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
