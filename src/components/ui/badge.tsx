import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/src/lib/utils"

/* FASE 1 — selos por tokens de estado (sucesso/aviso/info/erro), 12 px
   (reservado a selos e legendas). */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-caption font-semibold leading-none transition-colors duration-fast ease-standard [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        success: "border-transparent bg-success-soft text-success-foreground",
        warning: "border-transparent bg-warning-soft text-warning-foreground",
        info: "border-transparent bg-info-soft text-info-foreground",
        danger: "border-transparent bg-danger-soft text-danger-foreground",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
