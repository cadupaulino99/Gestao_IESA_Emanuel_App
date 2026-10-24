import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { sanitizeHtml, richTextPlainLength } from '../../lib/richtext';

/* Estilos do conteúdo formatado (allowlist de lib/richtext — sem estilos livres). */
const RICH_CLASSES =
  '[&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-1.5 ' +
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-1.5 [&_li]:mb-0.5 ' +
  '[&_a]:text-blue-700 [&_a]:underline dark:[&_a]:text-blue-300 ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-slate-400 [&_blockquote]:pl-2 [&_blockquote]:italic [&_blockquote]:my-1 ' +
  '[&_h4]:font-bold [&_h4]:mb-1';

/**
 * Apresenta HTML formatado — SEMPRE re-saneado aqui (defesa em profundidade:
 * mesmo que um documento antigo/alterado à mão traga HTML sujo, não passa).
 */
export default function RichTextView({ html, className = '' }: { html: string; className?: string }) {
  return <div className={`${RICH_CLASSES} ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}

/** Texto longo com «Ver mais» (recolhido por omissão). */
export function ExpandableRichText({ html, chars = 240 }: { html: string; chars?: number }) {
  const [open, setOpen] = useState(false);
  const long = richTextPlainLength(html) > chars;
  return (
    <div>
      <div className="relative">
        <RichTextView html={html} className={long && !open ? 'max-h-24 overflow-hidden' : ''} />
        {long && !open && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white dark:from-slate-950 to-transparent" />
        )}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline"
        >
          {open ? <><ChevronUp className="h-3.5 w-3.5" /> Ver menos</> : <><ChevronDown className="h-3.5 w-3.5" /> Ver mais</>}
        </button>
      )}
    </div>
  );
}
