"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowLeft, X } from "lucide-react"

import { cn } from "@/src/lib/utils"

/* FASE 1 — diálogos: máx. 90dvh em qualquer orientação, cabeçalho e rodapé
   fixos (sticky) com corpo a rolar; fecho com 44 px.
   FASE 3 — forma por orientação:
     • telemóvel retrato  → folha inferior com pega de arrasto (drag handle)
     • telemóvel paisagem → painel à direita (nunca tapa a altura toda)
     • tablet/desktop     → cartão centrado
   Diálogos aninhados: o de cima mostra botão «Voltar» (seta) em vez do X;
   o de baixo mantém-se montado (estado preservado pelo Radix). */
const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-foreground/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/* Profundidade da pilha de diálogos/folhas. O Portal do Radix usa
   createPortal, que PRESERVA o contexto React: um DialogContent aberto
   dentro de outro vê parentDepth ≥ 1 → mostra «Voltar» em vez de «Fechar»,
   sem depender de timing de DOM. */
export const DialogDepthContext = React.createContext(0)

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const parentDepth = React.useContext(DialogDepthContext)
  const nested = parentDepth >= 1
  const depth = parentDepth + 1
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          /* base: cartão centrado (tablet/desktop) */
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-0 overflow-y-auto overscroll-contain border bg-card shadow-elev-3 rounded-lg max-h-[90dvh] duration-slow data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          /* retrato: folha inferior + pega de arrasto */
          "dlg-sheet:left-0 dlg-sheet:top-auto dlg-sheet:bottom-0 dlg-sheet:translate-x-0 dlg-sheet:translate-y-0 dlg-sheet:max-w-none dlg-sheet:rounded-b-none dlg-sheet:rounded-t-xl dlg-sheet:data-[state=open]:slide-in-from-bottom dlg-sheet:data-[state=closed]:slide-out-to-bottom",
          /* paisagem: painel à direita, largura confortável, máx. 90dvh */
          "nav-rail:left-auto nav-rail:top-[5dvh] nav-rail:bottom-[5dvh] nav-rail:right-0 nav-rail:max-h-none nav-rail:translate-x-0 nav-rail:translate-y-0 nav-rail:w-[min(30rem,100%)] nav-rail:rounded-lg nav-rail:border-r-0 nav-rail:data-[state=open]:slide-in-from-right nav-rail:data-[state=closed]:slide-out-to-right",
          className
        )}
        {...props}
      >
        {/* pega de arrasto — visível só em folha inferior (retrato) */}
        <DialogDepthContext.Provider value={depth}>
          <div
            aria-hidden
            className="dlg-sheet:mx-auto dlg-sheet:mt-2 dlg-sheet:block mx-auto hidden h-1.5 w-10 shrink-0 rounded-full bg-border"
          />
          {children}
          <DialogPrimitive.Close className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-fast hover:bg-accent hover:text-foreground disabled:pointer-events-none dlg-sheet:top-1">
            {nested ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
            <span className="sr-only">{nested ? "Voltar" : "Fechar"}</span>
          </DialogPrimitive.Close>
        </DialogDepthContext.Provider>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky top-0 z-10 flex flex-col space-y-1.5 border-b border-border bg-card px-5 py-4 pr-14 text-left dlg-sheet:pt-2",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-border bg-card px-5 py-4 pb-safe sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-title font-semibold leading-7 tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-body-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
