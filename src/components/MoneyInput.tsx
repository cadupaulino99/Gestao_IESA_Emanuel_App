import { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { editValue, parseKzInput, formatKz } from '../lib/money';

interface Props {
  /** valor em cêntimos (nulo = vazio) */
  value: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
}

/**
 * Campo de valor em Kz: texto livre ao editar (teclado decimal no móvel),
 * formata AO SAIR do campo («700» → «700,00»), sem reformatar a cada tecla.
 * Ao focar, mostra o valor sem símbolo; ao sair, formatado.
 * Erro aparece JUNTO ao campo e o texto escrito é preservado.
 */
export default function MoneyInput({ value, onChange, placeholder = '0,00', required = true, className, id }: Props) {
  const [text, setText] = useState(value === null ? '' : editValue(value));
  const [focus, setFocus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focus) {
      setText(value === null ? '' : editValue(value));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focus]);

  const commit = () => {
    const r = parseKzInput(text, { required });
    if (!r.ok) {
      setError(r.error); // mantém o que a pessoa escreveu
      return;
    }
    setError(null);
    onChange(r.cents === 0 && !required ? null : r.cents);
    setText(r.cents ? editValue(r.cents) : '');
  };

  return (
    <div className={className}>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={focus ? text : text ? `${text} Kz` : ''}
        placeholder={placeholder}
        onFocus={() => { setFocus(true); setText(value === null ? '' : editValue(value)); }}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        onBlur={() => { setFocus(false); commit(); }}
        aria-invalid={!!error}
      />
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
      {!error && value !== null && !focus && (
        <p className="text-[10px] text-muted-foreground mt-0.5">{formatKz(value)}</p>
      )}
    </div>
  );
}
