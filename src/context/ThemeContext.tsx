import React, { createContext, useContext, useEffect, useState } from 'react';
import { prefGet, prefSet } from '../lib/prefs';

/** Modo de neutros (claro/escuro/sistema) — independente da paleta de marca. */
export type Mode = 'light' | 'dark' | 'system';
/** Paleta de marca: as duas novas (iesa/executivo) + os temas completos legados. */
export type Palette = 'iesa' | 'executivo' | 'cosmic' | 'forest' | 'ocean' | 'sunset';
/** Compatibilidade com código antigo. */
export type Theme = Mode | Palette;

const PALETTES: Palette[] = ['iesa', 'executivo', 'cosmic', 'forest', 'ocean', 'sunset'];
const MODES: Mode[] = ['light', 'dark', 'system'];
/** Temas legados que trazem os próprios neutros (ignoram o modo). */
const SELF_DARK: Palette[] = ['cosmic', 'ocean'];
const SELF_LIGHT: Palette[] = ['forest', 'sunset'];

interface ThemeContextType {
  mode: Mode;
  setMode: (m: Mode) => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
  isDark: boolean;
  /* legado (CommandPalette etc.): 'light'|'dark'|'system' ou uma paleta */
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    const m = prefGet('app-mode') as Mode | null;
    if (m && MODES.includes(m)) return m;
    const old = prefGet('app-theme') as string | null;
    if (old && MODES.includes(old as Mode)) return old as Mode;
    return 'system';
  });

  const [palette, setPalette] = useState<Palette>(() => {
    const p = prefGet('app-palette') as Palette | null;
    if (p && PALETTES.includes(p)) return p;
    const old = prefGet('app-theme') as string | null;
    if (old && PALETTES.includes(old as Palette)) return old as Palette;
    return 'iesa';
  });

  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const isDark = SELF_DARK.includes(palette)
    ? true
    : SELF_LIGHT.includes(palette)
      ? false
      : mode === 'system'
        ? systemDark
        : mode === 'dark';

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark', ...PALETTES);
    root.classList.add(isDark ? 'dark' : 'light');
    root.classList.add(palette);
    prefSet('app-mode', mode);
    prefSet('app-palette', palette);
  }, [mode, palette, isDark]);

  const setTheme = (t: Theme) => {
    if (MODES.includes(t as Mode)) setMode(t as Mode);
    else if (PALETTES.includes(t as Palette)) setPalette(t as Palette);
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        setMode,
        palette,
        setPalette,
        isDark,
        theme: (MODES.includes(palette as never) ? palette : isDark ? 'dark' : 'light') as Theme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
