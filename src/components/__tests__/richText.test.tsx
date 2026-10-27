// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RichTextView, { ExpandableRichText } from '../richtext/RichTextView';

/* Terceira camada de defesa XSS: mesmo que um documento guardado traga HTML
   sujo (pedido directo que contorne o editor), o render re-saneia. */
describe('RichTextView (sanitização no render)', () => {
  it('remove <script> com o conteúdo e handlers — passo 7 do guião', () => {
    const { container } = render(
      <RichTextView html={'<p>Olá</p><script>alert(1)</script><img src=x onerror=alert(1)>'} />
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Olá');
    expect(container.textContent).not.toContain('alert');
  });

  it('mantém a formatação permitida (negrito, listas, links seguros)', () => {
    const { container } = render(
      <RichTextView html={'<p><b>Culto</b></p><ul><li>18:30</li></ul><a href="https://x.pt">site</a>'} />
    );
    expect(container.querySelector('b')?.textContent).toBe('Culto');
    expect(container.querySelectorAll('li')).toHaveLength(1);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://x.pt');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });

  it('link javascript: é removido, o texto fica', () => {
    const { container } = render(<RichTextView html={'<a href="javascript:alert(1)">clica</a>'} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('clica');
  });
});

describe('ExpandableRichText («Ver mais» dos avisos)', () => {
  const curto = '<p>Aviso curto.</p>';
  const longo = `<p>${'Palavra '.repeat(80)}</p>`; // > 240 caracteres de texto

  it('texto curto não mostra o botão', () => {
    render(<ExpandableRichText html={curto} />);
    expect(screen.queryByText('Ver mais')).toBeNull();
  });

  it('texto longo recolhe e expande', () => {
    render(<ExpandableRichText html={longo} />);
    const btn = screen.getByText('Ver mais');
    fireEvent.click(btn);
    expect(screen.getByText('Ver menos')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver menos'));
    expect(screen.getByText('Ver mais')).toBeInTheDocument();
  });
});
