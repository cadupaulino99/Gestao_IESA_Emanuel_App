// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/* Cadastros pendentes (Admin): a lista que «não aparecia» na v1.14.1 —
   os testes cobrem o comportamento visível e o painel de erro (v1.14.2),
   além do gate de perfil (o servidor confirma nas regras). */

const h = vi.hoisted(() => ({ role: 'admin' as string }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: any, name: string) => ({ name })),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  doc: vi.fn(),
}));
vi.mock('../../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@iesa.ao' }, userRole: h.role }),
}));
vi.mock('../../lib/members', () => ({ nextInternalCode: vi.fn(async () => 'M-0042') }));

import { getDocs } from 'firebase/firestore';
import PendingSignups from '../admin/PendingSignups';
import { ConfirmProvider } from '../../context/ConfirmContext';

const signup = (o: Record<string, unknown> = {}) => ({
  id: 'maria@exemplo.com',
  data: () => ({
    email: 'maria@exemplo.com',
    name: 'Maria Silva',
    statusSignup: 'pendente',
    createdAt: Date.now(),
    phone: '+244923000000',
    documentNumber: '123456789LA012',
    address: 'Xangongo',
    ...o,
  }),
});

const renderPage = () =>
  render(
    <ConfirmProvider>
      <PendingSignups />
    </ConfirmProvider>
  );

describe('PendingSignups (Admin → Cadastros Pendentes)', () => {
  beforeEach(() => {
    h.role = 'admin';
    vi.clearAllMocks();
  });

  it('lista os pendentes com nome, email e contagem', async () => {
    (getDocs as any).mockResolvedValue({ docs: [signup()] });
    renderPage();
    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('maria@exemplo.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pendentes \(1\)/ })).toBeInTheDocument();
  });

  it('expandir mostra os dados enviados (BI, telefone, morada)', async () => {
    (getDocs as any).mockResolvedValue({ docs: [signup()] });
    renderPage();
    await screen.findByText('Maria Silva');
    fireEvent.click(screen.getByTitle('Ver todos os dados'));
    /* Morada só aparece na grelha expandida; o BI passa a constar 2×
       (linha «Recebido em…» + detalhe). */
    expect(await screen.findByText(/Xangongo/)).toBeInTheDocument();
    expect((await screen.findAllByText(/123456789LA012/)).length).toBeGreaterThanOrEqual(2);
  });

  it('falha na leitura → painel de erro com PERMISSION_DENIED e «Tentar novamente» (v1.14.2)', async () => {
    (getDocs as any).mockRejectedValue({ code: 'permission-denied', message: 'Missing or insufficient permissions.' });
    renderPage();
    expect(await screen.findByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });

  it('perfil não-admin não vê a lista (UI — as regras confirmam no servidor)', async () => {
    h.role = 'pastor';
    renderPage();
    expect(await screen.findByText(/reservado ao perfil de administrador/i)).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('sem pedidos: estado vazio com pistas de diagnóstico', async () => {
    (getDocs as any).mockResolvedValue({ docs: [] });
    renderPage();
    expect(await screen.findByText('Nenhum cadastro pendente.')).toBeInTheDocument();
    expect(screen.getByText(/1\.14\.0 ou superior/)).toBeInTheDocument();
  });
});
