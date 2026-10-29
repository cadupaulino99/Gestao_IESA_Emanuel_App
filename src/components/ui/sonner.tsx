import React from 'react';
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

/* FASE 1 — toasts por tokens: fundo popover, sombra elev-2, 14 px,
   ícone colorido pelo token do estado. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-elev-2 group-[.toaster]:text-body-sm group-[.toaster]:rounded-md",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:[&_[data-icon]]:text-success",
          error: "group-[.toaster]:[&_[data-icon]]:text-danger-foreground",
          warning: "group-[.toaster]:[&_[data-icon]]:text-warning-foreground",
          info: "group-[.toaster]:[&_[data-icon]]:text-info-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
