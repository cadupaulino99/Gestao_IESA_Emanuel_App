import { describe, expect, it } from 'vitest';
import { radioEngine } from '../nativeRadio';

/* v1.20.0 — rádio em segundo plano: escolha do motor de reprodução. */
describe('radioEngine', () => {
  it('Android → serviço foreground nativo', () => {
    expect(radioEngine('android')).toBe('native');
  });

  it('web → <audio> da WebView (comportamento antigo)', () => {
    expect(radioEngine('web')).toBe('web');
  });

  it('iOS → web (serviço nativo só existe para Android)', () => {
    expect(radioEngine('ios')).toBe('web');
  });

  it('plataforma desconhecida nunca cai no motor nativo', () => {
    expect(radioEngine('')).toBe('web');
    expect(radioEngine('windows')).toBe('web');
  });
});
