import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ShortcutItem {
  id: string;
  title: string;
  description?: string;
  category: 'Navegação' | 'Ações Rápidas' | 'Preferências' | 'Ajuda';
  icon?: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  openPalette: () => void;
  closePalette: () => void;
  registerActions: (id: string, actions: ShortcutItem[]) => () => void;
  actions: ShortcutItem[];
}

const CommandPaletteContext = createContext<CommandPaletteContextType | undefined>(undefined);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [customActionMap, setCustomActionMap] = useState<Record<string, ShortcutItem[]>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openPalette = () => setIsOpen(true);
  const closePalette = () => setIsOpen(false);

  const registerActions = (id: string, newActions: ShortcutItem[]) => {
    setCustomActionMap((prev) => ({ ...prev, [id]: newActions }));
    return () => {
      setCustomActionMap((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    };
  };

  const actions = Object.values(customActionMap).flat();

  return (
    <CommandPaletteContext.Provider
      value={{
        isOpen,
        setIsOpen,
        openPalette,
        closePalette,
        registerActions,
        actions,
      }}
    >
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  }
  return ctx;
}
