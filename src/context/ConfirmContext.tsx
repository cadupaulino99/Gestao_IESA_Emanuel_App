import React, { useRef, useState, createContext, useContext, ReactNode } from 'react';
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
import { matchesRequired } from "../lib/confirm";

type ConfirmContextType = {
  confirm: (message: string, requireText?: string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [requireText, setRequireText] = useState<string | undefined>(undefined);
  const [inputText, setInputText] = useState('');
  /* Resolver em REF (não em state): sem closures stale e permite cancelar um
     confirm pendente quando chega outro — o duplo toque no botão do lixo
     criava uma Promise que nunca resolvia e o removeRecording ficava zombie. */
  const resolverRef = useRef<{ resolve: (value: boolean) => void } | null>(null);

  const confirmFn = (msg: string, textToRequire?: string) => {
    resolverRef.current?.resolve(false); // confirm anterior pendente → cancelado
    resolverRef.current = null;
    setMessage(msg);
    setRequireText(textToRequire);
    setInputText('');
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = { resolve };
    });
  };

  const handleClose = (value: boolean) => {
    setOpen(false);
    resolverRef.current?.resolve(value);
    resolverRef.current = null;
  };

  /* v1.12.3: comparação tolerante a caixa/espaços (matchesRequired) — antes
     era exacta e «Apagar»/«apagar» deixavam o Confirmar desativado. */
  const isConfirmDisabled = requireText ? !matchesRequired(inputText, requireText) : false;

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
                Por favor, escreva <strong>{requireText}</strong> para confirmar{' '}
                <span className="font-normal text-muted-foreground">(maiúsculas ou minúsculas, tanto faz)</span>:
              </p>
              <Input 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={requireText}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
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
