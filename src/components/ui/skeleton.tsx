import * as React from "react"
import { cn } from "@/src/lib/utils"

/* FASE 3 — esqueleto de carregamento por tokens (sem cores mágicas). */
const Skeleton = React.forwardRef<
  React.ElementRef<"div">,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden
    className={cn("animate-pulse rounded-md bg-muted", className)}
    {...props}
  />
))
Skeleton.displayName = "Skeleton"

export { Skeleton }
