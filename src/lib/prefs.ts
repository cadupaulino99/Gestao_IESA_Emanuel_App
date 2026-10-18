import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Armazenamento persistente híbrido.
 *
 * No browser usa localStorage (síncrono). No Android, o localStorage da WebView
 * PODE ser apagado pelo sistema (gestão de memória/limpeza), por isso cada
 * escrita é espelhada no @capacitor/preferences (nativo, durável) e, no arrananque
 * da app, os valores nativos repõem o localStorage antes de o React montar.
 */

export const PREF_KEYS = [
  'app-theme',
  'animations_enabled',
  'sound_enabled',
  'compact_mode',
  'hide_financials',
  'app_language',
  'church-settings',
] as const;

export function prefGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function prefSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignora */
  }
  if (Capacitor.isNativePlatform()) {
    if (value === null) Preferences.remove({ key }).catch(() => {});
    else Preferences.set({ key, value }).catch(() => {});
  }
}

/** Repor o localStorage a partir do storage nativo. Chamar ANTES de render(). */
export async function hydratePrefs(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  for (const key of PREF_KEYS) {
    try {
      const { value } = await Preferences.get({ key });
      if (value !== null) localStorage.setItem(key, value);
    } catch {
      /* ignora */
    }
  }
}
