import * as React from 'react';
import { cn } from '@/src/lib/utils';

/* FASE 1 — textarea por tokens: texto 16 px, erro via aria-invalid. */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-24 w-full rounded-md border border-input bg-card px-3 py-2.5 text-body text-foreground shadow-elev-1 transition-colors duration-fast ease-standard placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:bg-danger-soft/40',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
export { Textarea };
