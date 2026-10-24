import React, { createContext, useContext, useEffect, useState } from 'react';
import { prefGet,prefSet } from '../lib/prefs';
import { formatKz } from '../lib/money';

interface SettingsContextType {
  animationsEnabled: boolean;
  soundEnabled: boolean;
  compactMode: boolean;
  hideFinancials: boolean;
  language: string;
  setAnimationsEnabled: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setCompactMode: (v: boolean) => void;
  setHideFinancials: (v: boolean) => void;
  setLanguage: (v: string) => void;
  formatCurrency: (value: number) => string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [hideFinancials, setHideFinancials] = useState(false);
  const [language, setLanguage] = useState('pt-AO');

  useEffect(() => {
    const anim = prefGet('animations_enabled');
    if (anim !== null) setAnimationsEnabled(anim === 'true');
    
    const sound = prefGet('sound_enabled');
    if (sound !== null) setSoundEnabled(sound === 'true');

    const compact = prefGet('compact_mode');
    if (compact !== null) {
      setCompactMode(compact === 'true');
      if (compact === 'true') document.body.classList.add('compact-ui');
    }

    const hideFin = prefGet('hide_financials');
    if (hideFin !== null) {
      setHideFinancials(hideFin === 'true');
      if (hideFin === 'true') document.body.classList.add('hide-financials');
    }

    const lang = prefGet('app_language');
    if (lang) setLanguage(lang);
  }, []);

  const updateAnimations = (v: boolean) => {
    setAnimationsEnabled(v);
    prefSet('animations_enabled', String(v));
  };

  const updateSound = (v: boolean) => {
    setSoundEnabled(v);
    prefSet('sound_enabled', String(v));
  };

  const updateCompactMode = (v: boolean) => {
    setCompactMode(v);
    prefSet('compact_mode', String(v));
    if (v) document.body.classList.add('compact-ui');
    else document.body.classList.remove('compact-ui');
  };

  const updateHideFinancials = (v: boolean) => {
    setHideFinancials(v);
    prefSet('hide_financials', String(v));
    if (v) document.body.classList.add('hide-financials');
    else document.body.classList.remove('hide-financials');
  };

  const updateLanguage = (v: string) => {
    setLanguage(v);
    prefSet('app_language', v);
  };

  // v1.12: moeda única — formatKz(cêntimos), sem depender do idioma do aparelho
  const formatCurrency = (value: number) => {
    if (hideFinancials) return 'Kz ***';
    return formatKz(value);
  };

  return (
    <SettingsContext.Provider value={{
      animationsEnabled, soundEnabled, compactMode, hideFinancials, language,
      setAnimationsEnabled: updateAnimations,
      setSoundEnabled: updateSound,
      setCompactMode: updateCompactMode,
      setHideFinancials: updateHideFinancials,
      setLanguage: updateLanguage,
      formatCurrency
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
