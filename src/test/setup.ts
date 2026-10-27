/* ═══════════════════════════════════════════════════════════════════════
   Setup dos testes (v1.14.7) — corre em TODOS os ficheiros de teste.
   Stubs mínimos para componentes Radix/shadcn em jsdom + matchers do
   jest-dom. Mantém-se leve: os testes puros (node) não tocam nisto.
   ═══════════════════════════════════════════════════════════════════════ */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const isJsdom = typeof document !== 'undefined' && typeof window !== 'undefined';

if (isJsdom) {
  // matchMedia (usado por alguns componentes responsivos)
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as any;
  }

  // Radix UI precisa destes APIs de pointer/scroll que o jsdom não tem
  const elemProto = Element.prototype as any;
  for (const fn of ['scrollIntoView', 'hasPointerCapture', 'releasePointerCapture', 'setPointerCapture', 'scrollTo']) {
    if (!elemProto[fn]) elemProto[fn] = vi.fn();
  }
  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // window.scrollTo (jsdom não implementa; SelfRegister usa-o nos erros)
  (window as any).scrollTo = vi.fn();

  // URLs de objecto (fotos/pré-visualizações)
  if (!window.URL.createObjectURL) {
    (window.URL as any).createObjectURL = vi.fn(() => 'blob:mock');
    (window.URL as any).revokeObjectURL = vi.fn();
  }
}
