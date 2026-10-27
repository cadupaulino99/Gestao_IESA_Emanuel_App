import { useEffect, useRef, type ReactNode } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Quote, Link2, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeHtml, richTextPlainLength, RICHTEXT_MAX_PLAIN } from '../../lib/richtext';

/* ═══════════════════════════════════════════════════════════════════════
   EDITOR DE TEXTO FORMATADO (v1.13.0) — a página «Postes» não existia;
   o editor nasce aqui e pode ser reaproveitado quando ela existir.
   Barra: negrito, itálico, sublinhado, listas, citação, link, limpar.
   Segurança: o HTML é saneado em cada edição (allowlist de lib/richtext);
   colagens entram como TEXTO SIMPLES; o servidor (firestore.rules) ainda
   recusa padrões perigosos — ver lib/richtext.ts (3 camadas).
   ═══════════════════════════════════════════════════════════════════════ */

/* v1.14.8: botão da barra fora do render (remontava a cada tecla). */
function Tool({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault() /* não perde a selecção */}
      onClick={onClick}
      className="h-7 w-7 rounded flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  );
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Escreva aqui…', minHeight = 110 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  /* (re)inserção do valor externo sem partir o cursor: só quando não focado */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clean = sanitizeHtml(value);
    if (!focused.current && el.innerHTML !== clean) el.innerHTML = clean;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    let clean = sanitizeHtml(el.innerHTML);
    if (richTextPlainLength(clean) === 0) clean = '';
    if (el.innerHTML !== clean) el.innerHTML = clean;
    onChange(clean);
  };

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const addLink = () => {
    const url = window.prompt('Endereço do link (https://… ou mailto:…):');
    if (url === null) return;
    const u = url.trim();
    if (!u) return;
    if (!/^(https?:\/\/|mailto:)/i.test(u)) {
      toast.error('Só links https:// ou mailto: — outros são recusados por segurança.');
      return;
    }
    exec('createLink', u);
  };

  const chars = richTextPlainLength(value);
  const over = chars > RICHTEXT_MAX_PLAIN;


  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1 py-0.5">
        <Tool onClick={() => exec('bold')} title="Negrito"><Bold className="h-3.5 w-3.5" /></Tool>
        <Tool onClick={() => exec('italic')} title="Itálico"><Italic className="h-3.5 w-3.5" /></Tool>
        <Tool onClick={() => exec('underline')} title="Sublinhado"><Underline className="h-3.5 w-3.5" /></Tool>
        <Tool onClick={() => exec('insertUnorderedList')} title="Lista com pontos"><List className="h-3.5 w-3.5" /></Tool>
        <Tool onClick={() => exec('insertOrderedList')} title="Lista numerada"><ListOrdered className="h-3.5 w-3.5" /></Tool>
        <Tool onClick={() => exec('formatBlock', 'blockquote')} title="Citação"><Quote className="h-3.5 w-3.5" /></Tool>
        <Tool onClick={addLink} title="Link"><Link2 className="h-3.5 w-3.5" /></Tool>
        <Tool onClick={() => exec('removeFormat')} title="Limpar formatação"><Eraser className="h-3.5 w-3.5" /></Tool>
        <span className={`ml-auto pr-1.5 text-[10px] tabular-nums ${over ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
          {chars}/{RICHTEXT_MAX_PLAIN}
        </span>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-ph={placeholder}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; emit(); }}
        onInput={emit}
        onPaste={(e) => {
          /* colagens como texto simples — nada de HTML externo entra */
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          emit();
        }}
        style={{ minHeight }}
        className={
          'px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
          'empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-ph)] ' +
          '[&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
          '[&_blockquote]:border-l-2 [&_blockquote]:border-slate-400 [&_blockquote]:pl-2 [&_blockquote]:italic ' +
          '[&_a]:text-blue-700 [&_a]:underline'
        }
      />
    </div>
  );
}
