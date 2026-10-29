import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/src/lib/utils';

/* FASE 3 — estados de interface com o mesmo padrão em toda a app:
   ícone + frase + ação. Usado em listas vazias, erros e afins. */

export function StateView({
  icon: Icon,
  title,
  description,
  action,
  tone = 'muted',
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'muted' | 'danger';
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-body font-semibold">{title}</p>
        {description && <p className="mx-auto max-w-md text-body-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateView icon={Inbox} title={title} description={description} action={action} className={className} />
  );
}

export function ErrorState({
  title = 'Algo correu mal',
  description = 'Não foi possível carregar os dados. Tente novamente.',
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateView icon={AlertTriangle} tone="danger" title={title} description={description} action={action} className={className} />
  );
}
