// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/* MemberBoard (Portal do Membro): ordenação de avisos (fixados/urgentes no
   topo, expirados ocultos), agenda semanal com ocorrência cancelada e
   eventos com «Hoje»/«Faltam N dias» + filtro Passados. Tudo só-leitura. */

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: any, name: string) => ({ name })),
  getDocs: vi.fn(),
}));
vi.mock('../../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
}));
vi.mock('../../lib/posters', () => ({ posterUrl: vi.fn(() => Promise.reject(new Error('sem bucket'))) }));

import { getDocs } from 'firebase/firestore';
import MemberBoard from '../portal/MemberBoard';
import { luandaDayKey, luandaParts } from '../../lib/luanda';

const DAY = 86400000;
const today = luandaDayKey();
const dowToday = luandaParts().dow;
const d = (offsetDays: number) => luandaDayKey(Date.now() + offsetDays * DAY);

const docOf = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

const announcements = [
  docOf('a-normal', { title: 'Aviso Normal', content: 'texto', active: true, createdAt: 200, adminId: 'x' }),
  docOf('a-urgente', { title: 'Aviso Urgente', content: 'texto', active: true, createdAt: 300, adminId: 'x', level: 'urgente', status: 'publicado' }),
  docOf('a-fixado', { title: 'Aviso Fixado', content: 'texto', active: true, createdAt: 100, adminId: 'x', pinned: true, status: 'publicado' }),
  docOf('a-expirado', { title: 'Aviso Expirado', content: 'texto', active: true, createdAt: 400, adminId: 'x', status: 'publicado', visibleUntil: d(-1) }),
  docOf('a-rascunho', { title: 'Rascunho Invisível', content: 'texto', active: true, createdAt: 500, adminId: 'x', status: 'rascunho' }),
];

const agenda = [
  docOf('ag-hoje', { title: 'Culto de Hoje', weekday: dowToday, startTime: '18:30', endTime: '20:00', location: 'Templo', cancelledDates: [today], ativo: true }),
];

const events = [
  docOf('ev-hoje', { title: 'Vigília Hoje', date: today, time: '23:30', description: 'vigília', status: 'marcado', publishStatus: 'publicado' }),
  docOf('ev-futuro', { title: 'Conferência Futura', date: d(5), time: '18:00', description: 'conf', status: 'marcado', publishStatus: 'publicado' }),
  docOf('ev-passado', { title: 'Retiro Antigo', date: d(-10), description: 'retiro', status: 'realizado', publishStatus: 'publicado' }),
  docOf('ev-rascunho', { title: 'Rascunho de Evento', date: d(2), publishStatus: 'rascunho' }),
];

function mockCollections() {
  (getDocs as any).mockImplementation(async (col: any) => {
    const map: Record<string, any[]> = { announcements, agenda_items: agenda, events };
    return { docs: map[col?.name] || [] };
  });
}

describe('MemberBoard (Portal do Membro — Avisos, Agenda e Eventos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollections();
  });

  it('avisos: fixados e urgentes primeiro; expirados e rascunhos ocultos', async () => {
    render(<MemberBoard />);
    const arts = await screen.findAllByRole('article');
    expect(arts.map((a) => a.textContent)).toHaveLength(3);
    expect(arts[0].textContent).toContain('Aviso Fixado');
    expect(arts[1].textContent).toContain('Aviso Urgente');
    expect(arts[2].textContent).toContain('Aviso Normal');
    expect(screen.queryByText('Aviso Expirado')).toBeNull();      // «visível até» passou
    expect(screen.queryByText('Rascunho Invisível')).toBeNull();  // nunca aos membros
    expect(screen.getByText('URGENTE')).toBeInTheDocument();
    expect(screen.getByText('Fixado')).toBeInTheDocument();
  });

  it('agenda: dia de hoje marcado, ocorrência cancelada riscada com «Cancelado»', async () => {
    render(<MemberBoard />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Agenda/ }));
    expect(await screen.findByText('Culto de Hoje')).toBeInTheDocument();
    expect(screen.getByText('HOJE')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    const title = screen.getByText('Culto de Hoje');
    expect(title.className).toContain('line-through');
  });

  it('eventos: próximos com «Hoje»/«Faltam 5 dias»; rascunho oculto; Passados com filtro', async () => {
    render(<MemberBoard />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Eventos/ }));
    expect(await screen.findByText('Vigília Hoje')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('Conferência Futura')).toBeInTheDocument();
    expect(screen.getByText('Faltam 5 dias')).toBeInTheDocument();
    expect(screen.queryByText('Rascunho de Evento')).toBeNull();
    expect(screen.queryByText('Retiro Antigo')).toBeNull();       // só no filtro Passados

    fireEvent.click(screen.getByRole('button', { name: /Passados/ }));
    expect(await screen.findByText('Retiro Antigo')).toBeInTheDocument();
    expect(screen.getByText('Realizado')).toBeInTheDocument();
  });
});
