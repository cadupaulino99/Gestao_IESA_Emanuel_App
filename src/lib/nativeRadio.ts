import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * v1.20.0 — Rádio em segundo plano (Android).
 *
 * Ponte para o plugin local `RadioService` (Java, em android/app):
 * serviço foreground mediaPlayback + MediaSession. No Android a emissão
 * passa a tocar NATIVA (sobrevive a ecrã apagado / app em segundo plano,
 * com notificação de media e controlo no ecrã de bloqueio); nas outras
 * plataformas mantém-se o <audio> da WebView.
 */
export interface RadioStateEvent {
  playing: boolean;
  loading: boolean;
}

export interface RadioErrorEvent {
  message: string;
}

export interface RadioServicePlugin {
  play(o: { url: string; title: string }): Promise<void>;
  stop(): Promise<void>;
  setVolume(o: { value: number }): Promise<void>;
  getState(): Promise<{ playing: boolean }>;
  addListener(
    eventName: 'radioState',
    listenerFunc: (e: RadioStateEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'radioError',
    listenerFunc: (e: RadioErrorEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const RadioService = registerPlugin<RadioServicePlugin>('RadioService');

/**
 * Decisão PURA (testável em vitest): que motor toca a emissão ao vivo.
 * Android → serviço foreground nativo; web/iOS → <audio> da WebView.
 */
export function radioEngine(platform: string): 'native' | 'web' {
  return platform === 'android' ? 'native' : 'web';
}

export const nativeRadio = (): boolean => radioEngine(Capacitor.getPlatform()) === 'native';
