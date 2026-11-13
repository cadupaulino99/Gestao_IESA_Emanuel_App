import * as React from 'react';
import { cn } from '@/src/lib/utils';

/** Placeholder de carregamento com shimmer (respeita prefers-reduced-motion). */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton rounded-md', className)} {...props} />;
}

export { Skeleton };
