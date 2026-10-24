import { describe, expect, it, vi, beforeEach } from 'vitest';

/* Mock do Firestore: as funções vivem DENTRO da factory (o vi.mock é hoisted e
   não pode capturar variáveis de topo). Obtêm-se depois via import dinâmico. */
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ _collection: true })),
  query: vi.fn(() => ({ _query: true })),
  where: vi.fn(() => ({ _where: true })),
  doc: vi.fn((_db: unknown, _col: string, id: string) => ({ id })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(async () => ({ id: 'novo' })),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
}));
vi.mock('../firebase', () => ({ db: {} }));

const fs = await import('firebase/firestore');
const { cycleCommunionMark, fetchCommunion } = await import('../communion');
const addDoc = fs.addDoc as ReturnType<typeof vi.fn>;
const updateDoc = fs.updateDoc as ReturnType<typeof vi.fn>;
const deleteDoc = fs.deleteDoc as ReturnType<typeof vi.fn>;
const getDocs = fs.getDocs as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('cycleCommunionMark (vazio → ✓ → ✗ → vazio)', () => {
  it('sem marca → cria "present" com recordedBy e memberEmail', async () => {
    await cycleCommunionMark('m1', 2026, '03', undefined, 'pastor@iesa.org', 'membro@iesa.org');
    expect(addDoc).toHaveBeenCalledTimes(1);
    const payload = addDoc.mock.calls[0][1];
    expect(payload).toMatchObject({
      memberId: 'm1', year: 2026, month: '03', mark: 'present',
      recordedBy: 'pastor@iesa.org', memberEmail: 'membro@iesa.org',
    });
  });
  it('present → absent (não participou)', async () => {
    await cycleCommunionMark('m1', 2026, '03',
      { id: 'c1', memberId: 'm1', year: 2026, month: '03', mark: 'present' }, 'p@x', null);
    expect(updateDoc).toHaveBeenCalledWith({ id: 'c1' }, expect.objectContaining({ mark: 'absent' }));
  });
  it('absent → apaga o documento (mês volta a "não registado")', async () => {
    await cycleCommunionMark('m1', 2026, '03',
      { id: 'c1', memberId: 'm1', year: 2026, month: '03', mark: 'absent' }, 'p@x', null);
    expect(deleteDoc).toHaveBeenCalledWith({ id: 'c1' });
  });
  it('marca legada em texto livre ("FM") → normaliza para present', async () => {
    await cycleCommunionMark('m1', 2026, '03',
      { id: 'c1', memberId: 'm1', year: 2026, month: '03', mark: 'FM' }, 'p@x', null);
    expect(updateDoc).toHaveBeenCalledWith({ id: 'c1' }, expect.objectContaining({ mark: 'present' }));
  });
});

describe('fetchCommunion', () => {
  it('mapeia documentos para CommunionMark', async () => {
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 'c1', data: () => ({ memberId: 'm1', year: 2026, month: '01', mark: 'present' }) }],
    });
    const out = await fetchCommunion('m1');
    expect(out).toEqual([{ id: 'c1', memberId: 'm1', year: 2026, month: '01', mark: 'present' }]);
  });
});
