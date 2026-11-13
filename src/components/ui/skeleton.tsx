import { cn } from '@/src/lib/utils';

/** Placeholder de carregamento (evita layout jump com Spinner só). */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
