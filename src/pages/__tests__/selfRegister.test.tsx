// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SelfRegister from '../SelfRegister';
import { selfRegister } from '../../lib/ai';

/* O auto-cadastro é o fluxo mais novo e mais sensível (v1.14.x): valida com
   o MESMO esquema do admin, normaliza o email, e — regressão de v1.14.2 —
   mostra os erros EM BANNER dentro da página (os toasts eram invisíveis
   neste ecrã fora do Layout). */

vi.mock('../../lib/ai', () => ({
  selfRegister: vi.fn(),
  compressImageFile: vi.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <SelfRegister />
    </MemoryRouter>
  );

function fill(opts: { name?: string; email?: string; pw?: string; pwc?: string } = {}) {
  fireEvent.change(screen.getByPlaceholderText('Ex.: Maria Domingos Paulo'), {
    target: { value: opts.name ?? 'Maria Silva' },
  });
  fireEvent.change(screen.getByPlaceholderText('nome@email.com'), {
    target: { value: opts.email ?? ' Maria@Exemplo.COM ' },
  });
  const pws = document.querySelectorAll('input[type="password"]');
  fireEvent.change(pws[0], { target: { value: opts.pw ?? 'abcd1234' } });
  fireEvent.change(pws[1], { target: { value: opts.pwc ?? opts.pw ?? 'abcd1234' } });
}

const submit = () => fireEvent.click(screen.getByText('Enviar cadastro para aprovação'));

describe('SelfRegister (ecrã público /register)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submissão válida → envia com email NORMALIZADO e mostra «Cadastro recebido!»', async () => {
    (selfRegister as any).mockResolvedValue({ ok: true, status: 'pendente' });
    renderPage();
    fill();
    submit();
    await waitFor(() => expect(selfRegister).toHaveBeenCalledTimes(1));
    const payload = (selfRegister as any).mock.calls[0][0];
    expect(payload.email).toBe('maria@exemplo.com');   // minúsculas + sem espaços
    expect(payload.name).toBe('Maria Silva');
    expect(payload.password).toBe('abcd1234');
    expect('passwordConfirm' in payload).toBe(false);   // não viaja
    expect(await screen.findByText('Cadastro recebido!')).toBeInTheDocument();
  });

  it('erro do servidor → BANNER vermelho na página com o motivo (regressão v1.14.2)', async () => {
    const err = Object.assign(new Error('Já existe um pedido pendente com este email.'), { status: 409 });
    (selfRegister as any).mockRejectedValue(err);
    renderPage();
    fill();
    submit();
    const banner = await screen.findByText(/Já existe um pedido pendente/);
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain('código 409');
    expect(screen.queryByText('Cadastro recebido!')).toBeNull();
  });

  it('palavras-passe diferentes → recusa no cliente e NÃO chama o servidor', async () => {
    renderPage();
    fill({ pw: 'abcd1234', pwc: 'outra1234' });
    submit();
    expect(await screen.findByText('As palavras-passe não coincidem.')).toBeInTheDocument();
    expect(selfRegister).not.toHaveBeenCalled();
  });

  it('palavra-passe curta → política mínima visível (8 caracteres)', async () => {
    renderPage();
    fill({ pw: 'abc', pwc: 'abc' });
    submit();
    expect(await screen.findByText(/pelo menos 8 caracteres/)).toBeInTheDocument();
    expect(selfRegister).not.toHaveBeenCalled();
  });

  it('telefone inválido → erro no campo, sem envio', async () => {
    renderPage();
    fill();
    fireEvent.change(screen.getByPlaceholderText('+244 9XX XXX XXX'), { target: { value: '12345' } });
    submit();
    expect(await screen.findByText(/Telefone angolano inválido/)).toBeInTheDocument();
    expect(selfRegister).not.toHaveBeenCalled();
  });
});
