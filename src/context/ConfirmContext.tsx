import React, { useState, createContext, useContext, ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Input } from "../components/ui/input";

type ConfirmContextType = {
  confirm: (message: string, requireText?: string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [requireText, setRequireText] = useState<string | undefined>(undefined);
  const [inputText, setInputText] = useState('');
  const [resolver, setResolver] = useState<{ resolve: (value: boolean) => void } | null>(null);

  const confirmFn = (msg: string, textToRequire?: string) => {
    setMessage(msg);
    setRequireText(textToRequire);
    setInputText('');
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolver({ resolve });
    });
  };

  const handleClose = (value: boolean) => {
    setOpen(false);
    if (resolver) {
      resolver.resolve(value);
      setResolver(null);
    }
  };

  const isConfirmDisabled = requireText ? inputText !== requireText : false;

  return (
    <ConfirmContext.Provider value={{ confirm: confirmFn }}>
      {children}
      <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmação</AlertDialogTitle>
            <AlertDialogDescription>{message}</AlertDialogDescription>
          </AlertDialogHeader>
          
          {requireText && (
            <div className="py-4">
              <p className="text-sm font-medium mb-2 text-destructive">
                Por favor, digite <strong>{requireText}</strong> para confirmar:
              </p>
              <Input 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={requireText}
                className="border-destructive/50 focus-visible:ring-destructive"
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => { e.preventDefault(); handleClose(false); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              disabled={isConfirmDisabled}
              onClick={(e) => { e.preventDefault(); handleClose(true); }}
              className={requireText ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be inside ConfirmProvider');
  return context.confirm;
}
