import { useState } from 'react';
import { Input } from './ui/input';
import { editValue, parseKzInput } from '../lib/money';

interface Props {
  /** texto canónico sem símbolo («700,00») */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  required?: boolean;
}
/** Campo de valor em Kz baseado em texto: formata ao SAIR (não a cada tecla),
 *  preserva o texto em caso de recusa e mostra a mensagem junto ao campo. */
export default function MoneyText({ value, onChange, placeholder = '0,00', className, id, required = true }: Props) {
  const [focus, setFocus] = useState(false);
  const [local, setLocal] = useState(value);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className}>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off" autoCorrect="off" spellCheck={false}
        value={focus ? local : value}
        placeholder={placeholder}
        onFocus={() => { setFocus(true); setLocal(value); }}
        onChange={(e) => { setLocal(e.target.value); setError(null); }}
        onBlur={() => {
          setFocus(false);
          const r = parseKzInput(local, { required });
          if (!r.ok) { setError(r.error); return; } // mantém o que escreveu
          onChange(r.cents ? editValue(r.cents) : '');
          setError(null);
        }}
        aria-invalid={!!error}
      />
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </div>
  );
}
