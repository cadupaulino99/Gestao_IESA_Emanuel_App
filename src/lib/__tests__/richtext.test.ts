import { describe, expect, it } from 'vitest';
import { sanitizeHtml, htmlToPlain, richTextPlainLength, validateRichText, hasDangerousPattern } from '../richtext';

describe('sanitizeHtml — allowlist estrita', () => {
  it('mantém as etiquetas permitidas', () => {
    expect(sanitizeHtml('<p>Olá <b>mundo</b></p>')).toBe('<p>Olá <b>mundo</b></p>');
    expect(sanitizeHtml('<ul><li>um</li><li>dois</li></ul>')).toBe('<ul><li>um</li><li>dois</li></ul>');
  });
  it('remove <script> COM o conteúdo (passo 7 do guião de testes)', () => {
    const out = sanitizeHtml('<p>A</p><script>alert(1)</script>');
    expect(out).toBe('<p>A</p>');
    expect(out).not.toContain('alert');
  });
  it('remove <style> e <iframe> com o conteúdo', () => {
    expect(sanitizeHtml('x<style>body{}</style>y<iframe src="//evil"></iframe>z')).toBe('xyz');
  });
  it('atributos e handlers morrem; etiquetas desconhecidas fazem unwrap', () => {
    expect(sanitizeHtml('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeHtml('<div onclick="x()">texto</div>')).toBe('texto');
    expect(sanitizeHtml('<p style="color:red">cor</p>')).toBe('<p>cor</p>');
  });
  it('links: só http/https/mailto; javascript: (também em entidades) é recusado', () => {
    expect(sanitizeHtml('<a href="https://x.pt">ok</a>')).toContain('href="https://x.pt"');
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('x');
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe('x');
    expect(sanitizeHtml('<a href="https://x.pt">ok</a>')).not.toContain('javascript');
  });
  it("escapa '<' soltos no texto", () => {
    expect(sanitizeHtml('a < b e 5 > 2')).toBe('a &lt; b e 5 &gt; 2');
  });
  it('saída balanceada (fechos sem abertura ignorados; aberturas fechadas no fim)', () => {
    expect(sanitizeHtml('</b>texto<b>')).toBe('texto<b></b>');
    expect(sanitizeHtml('<b><i>x</b>')).toBe('<b><i>x</i></b>');
  });
  it('é idempotente', () => {
    const once = sanitizeHtml('<p>a<script>x</script>b</p>');
    expect(sanitizeHtml(once)).toBe(once);
  });
});

describe('htmlToPlain / limites', () => {
  it('converte para texto (listas com •)', () => {
    expect(htmlToPlain('<p>Olá</p><ul><li>um</li></ul>')).toBe('Olá\n• um');
  });
  it('richTextPlainLength conta só texto (com separadores de bloco)', () => {
    expect(richTextPlainLength('<p>abc</p><b>de</b>')).toBe(6); // 'abc\nde'
  });
  it('validateRichText recusa texto acima de 8000 caracteres', () => {
    expect(validateRichText(`<p>${'x'.repeat(8001)}</p>`)).toMatch(/demasiado longo/);
    expect(validateRichText('<p>ok</p>')).toBeNull();
  });
  it('hasDangerousPattern detecta o que as rules também recusam', () => {
    expect(hasDangerousPattern('<SCRIPT>x</SCRIPT>')).toBe(true);
    expect(hasDangerousPattern('<p onclick=x>')).toBe(true);
    expect(hasDangerousPattern('<p>texto limpo</p>')).toBe(false);
  });
});
