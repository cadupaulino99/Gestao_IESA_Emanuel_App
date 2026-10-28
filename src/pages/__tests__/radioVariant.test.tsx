// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/* v1.15.0 — A Rádio chegou ao Portal do Membro: `variant="member"` mostra o
   player ao vivo e ESCONDE o gravador/biblioteca (ferramentas da liderança). */

vi.mock('../../lib/radio', () => {
  const noop = () => {};
  return {
    RADIO: {
      name: 'Rádio Maranata', freq: '91.9 FM', city: 'Lubango · Huíla',
      site: 'https://radiomaranatahuila.com/', streamUrl: 'https://stream', nowPlayingUrl: 'https://np',
      bitrateKbps: 48, folder: 'Radio',
    },
    livePlayer: {
      playing: false, loading: false, error: null, volume: 0.9,
      subscribe: vi.fn(() => noop), play: vi.fn(async () => {}), pause: vi.fn(), setVolume: vi.fn(),
    },
    recorder: { recording: false, seconds: 0, bytes: 0, onProgress: null, start: vi.fn(), stop: vi.fn() },
    isNative: () => true,
    listRecordings: vi.fn(async () => []),
    saveRecording: vi.fn(), deleteRecording: vi.fn(), shareRecording: vi.fn(async () => false),
    downloadBlob: vi.fn(), recordingName: () => 'Maranata_teste.aac',
    fetchNowPlaying: vi.fn(async () => null),
    fmtDuration: (s: number) => `${Math.round(s)}s`,
    fmtBytes: (b: number) => `${b} B`,
    publishRecording: vi.fn(async () => {}),
    unpublishRecording: vi.fn(async () => {}),
    listPublishedRecordings: vi.fn(async () => []),
    publishedRecordingUrl: vi.fn(async () => 'https://x/r.aac'),
  };
});
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'lider@iesa.ao', uid: 'u1' }, userRole: 'admin' }),
}));
vi.mock('../../lib/audit', () => ({ logAudit: vi.fn() }));

import Radio from '../Radio';
import { ConfirmProvider } from '../../context/ConfirmContext';

const renderRadio = (props: { variant?: 'full' | 'member' } = {}) =>
  render(
    <ConfirmProvider>
      <Radio {...props} />
    </ConfirmProvider>
  );

describe('Radio — variantes liderança vs membro', () => {
  beforeEach(() => vi.clearAllMocks());

  it('variante completa (liderança): player + gravador + biblioteca', () => {
    renderRadio();
    expect(screen.getByText('Rádio Maranata')).toBeInTheDocument();
    expect(screen.getByText('Gravar transmissão')).toBeInTheDocument();
    expect(screen.getByText('Gravações no telemóvel')).toBeInTheDocument();
  });

  it('variante membro: player + «Gravações da igreja»; gravador/biblioteca AUSENTES', async () => {
    renderRadio({ variant: 'member' });
    expect(screen.getByText('Rádio Maranata')).toBeInTheDocument();
    expect(screen.getByText(/emissão em direto/)).toBeInTheDocument();
    expect(screen.getByText('Site da rádio')).toBeInTheDocument();
    expect(await screen.findByText('Gravações da igreja')).toBeInTheDocument();  // v1.18
    expect(screen.queryByText('Gravar transmissão')).toBeNull();
    expect(screen.queryByText('Gravações no telemóvel')).toBeNull();
    expect(screen.queryByText('Parar e guardar')).toBeNull();
  });

  it('variante por omissão continua a ser a completa (liderança não perde nada)', () => {
    renderRadio({});
    expect(screen.getByText('Gravar transmissão')).toBeInTheDocument();
  });
});
