// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/* ═══════════════════════════════════════════════════════════════════════
   REGRESSÃO v1.14.8 — «clicas numa letra e o teclado desaparece»:
   Field/Item estavam definidos DENTRO do componente; cada setForm (cada
   tecla!) criava um tipo novo e o React REMONTAVA o formulário — o input
   perdia o foco e o teclado do Android fechava. O teste garante que o
   mesmo nó DOM sobrevive à digitação (focus mantido).
   ═══════════════════════════════════════════════════════════════════════ */

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: any, name: string) => ({ name })),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: any, ...p: string[]) => ({ id: p.join('/') })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  runTransaction: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn() })),
  arrayUnion: vi.fn(),
}));
vi.mock('../../lib/firebase', () => ({
  db: {},
  storage: {},
  auth: { currentUser: null },
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@iesa.ao', uid: 'u1' }, userRole: 'admin' }),
}));

import { getDocs } from 'firebase/firestore';
import EventsAdmin from '../admin/EventsAdmin';
import { ConfirmProvider } from '../../context/ConfirmContext';

describe('EventsAdmin — foco do teclado (regressão v1.14.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getDocs as any).mockResolvedValue({ docs: [] });
  });

  it('escrever no título NÃO remonta o input (foco mantido letra a letra)', async () => {
    render(
      <ConfirmProvider>
        <EventsAdmin />
      </ConfirmProvider>
    );
    const title = (await screen.findByPlaceholderText('Ex.: Conferência de Jovens')) as HTMLInputElement;
    title.focus();
    expect(title).toHaveFocus();

    fireEvent.change(title, { target: { value: 'C' } });
    await waitFor(() => expect((screen.getByPlaceholderText('Ex.: Conferência de Jovens') as HTMLInputElement).value).toBe('C'));
    expect(title).toHaveFocus(); // o MESMO nó DOM sobreviveu ao re-render

    fireEvent.change(title, { target: { value: 'Cu' } });
    await waitFor(() => expect((screen.getByPlaceholderText('Ex.: Conferência de Jovens') as HTMLInputElement).value).toBe('Cu'));
    expect(title).toHaveFocus();
  });

  it('campo de local também mantém o foco (todos os Field eram afectados)', async () => {
    render(
      <ConfirmProvider>
        <EventsAdmin />
      </ConfirmProvider>
    );
    const local = (await screen.findByPlaceholderText('Ex.: Templo de Xangongo')) as HTMLInputElement;
    local.focus();
    fireEvent.change(local, { target: { value: 'Templo' } });
    await waitFor(() => expect((screen.getByPlaceholderText('Ex.: Templo de Xangongo') as HTMLInputElement).value).toBe('Templo'));
    expect(local).toHaveFocus();
  });
});
