import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/src/lib/utils"

/* FASE 1 — alertas com tokens de estado (info por omissão, além de
   sucesso/aviso/erro); 14 px de corpo; ícone alinhado ao texto. */
const alertVariants = cva(
  "relative w-full rounded-md border px-4 py-3 text-body-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7 [&>svg]:size-5",
  {
    variants: {
      variant: {
        default: "bg-info-soft border-info/30 text-foreground [&>svg]:text-info-foreground",
        success: "bg-success-soft border-success/30 text-foreground [&>svg]:text-success-foreground",
        warning: "bg-warning-soft border-warning/30 text-foreground [&>svg]:text-warning-foreground",
        destructive:
          "bg-danger-soft border-danger/40 text-danger-foreground [&>svg]:text-danger-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-body-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
