// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from '../../context/ConfirmContext';

/* ═══════════════════════════════════════════════════════════════════════
   O diálogo de confirmação é o mecanismo por trás de TODAS as acções
   destrutivas (apagar gravações da rádio — o bug histórico —, lixeira,
   rejeições…). Estes testes cobrem as três regressões de v1.12.3:
   palavra tolerante a caixa, Confirmar desativado até acertar, e o
   resolver em ref (sem zombies no duplo toque).
   ═══════════════════════════════════════════════════════════════════════ */

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button type="button" onClick={async () => onResult(await confirm('Apagar gravação do telemóvel?', 'APAGAR'))}>
      abrir
    </button>
  );
}

/* FASE 3 — harness para as opções de apresentação (destrutiva vs. segura). */
function HarnessOpts({ onResult }: { onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={async () =>
        onResult(await confirm('Publicar gravação para os membros?', undefined, { destructive: false, actionLabel: 'Publicar' }))
      }
    >
      abrir-segura
    </button>
  );
}

const renderHarness = () => {
  const spy = vi.fn();
  render(
    <ConfirmProvider>
      <Harness onResult={spy} />
    </ConfirmProvider>
  );
  return spy;
};

describe('ConfirmContext (diálogo com palavra de confirmação)', () => {
  it('abre com a mensagem e o Confirmar desativado até escrever a palavra', async () => {
    renderHarness();
    fireEvent.click(screen.getByText('abrir'));
    expect(await screen.findByText('Apagar gravação do telemóvel?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled();
  });

  it('«apagar» em minúsculas confirma (regressão v1.12.3 — teclado móvel)', async () => {
    const spy = renderHarness();
    fireEvent.click(screen.getByText('abrir'));
    fireEvent.change(await screen.findByPlaceholderText('APAGAR'), { target: { value: 'apagar' } });
    const confirmar = screen.getByRole('button', { name: /Confirmar/i });
    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(true));
  });

  it('palavra errada mantém tudo bloqueado', async () => {
    const spy = renderHarness();
    fireEvent.click(screen.getByText('abrir'));
    fireEvent.change(await screen.findByPlaceholderText('APAGAR'), { target: { value: 'APAGA' } });
    expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('Cancelar resolve false e fecha', async () => {
    const spy = renderHarness();
    fireEvent.click(screen.getByText('abrir'));
    fireEvent.change(await screen.findByPlaceholderText('APAGAR'), { target: { value: 'APAGAR' } });
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(false));
  });

  it('duplo clique no botão: o primeiro confirm resolve false (sem zombies, v1.12.3)', async () => {
    const spy = renderHarness();
    const btn = screen.getByText('abrir');
    fireEvent.click(btn);
    await screen.findByPlaceholderText('APAGAR');
    fireEvent.click(btn); // segundo pedido enquanto o primeiro está aberto
    fireEvent.change(screen.getByPlaceholderText('APAGAR'), { target: { value: 'apagar' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[0][0]).toBe(false); // o pendente foi cancelado
    expect(spy.mock.calls[1][0]).toBe(true);  // o segundo completou
  });

  /* FASE 3 — apresentação: ação destrutiva vermelha + ação segura proeminente */
  it('por omissão a ação é destrutiva (vermelha) e o Cancelar proeminente (primária)', async () => {
    renderHarness();
    fireEvent.click(screen.getByText('abrir'));
    const confirmar = await screen.findByRole('button', { name: /Confirmar/i });
    const cancelar = screen.getByRole('button', { name: /Cancelar/i });
    expect(confirmar.className).toContain('bg-destructive');
    expect(cancelar.className).toContain('bg-primary');
  });

  it('com destructive:false a ação fica primária (acções seguras)', async () => {
    const spy = vi.fn();
    render(
      <ConfirmProvider>
        <HarnessOpts onResult={spy} />
      </ConfirmProvider>
    );
    fireEvent.click(screen.getByText('abrir-segura'));
    const publicar = await screen.findByRole('button', { name: /Publicar/i });
    expect(publicar.className).toContain('bg-primary');
    expect(publicar.className).not.toContain('bg-destructive');
  });
});
