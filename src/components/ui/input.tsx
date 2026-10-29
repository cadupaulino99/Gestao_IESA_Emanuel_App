import * as React from "react"

import { cn } from "@/src/lib/utils"

/* FASE 1 — campo por tokens: 44 px de altura, texto 16 px (sem zoom da
   WebView), erro via aria-invalid, foco pelo anel global. */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-body text-foreground transition-colors duration-fast ease-standard file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:bg-danger-soft/40",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
