import { Check, X } from 'lucide-react';
import { CommunionMark, MONTHS_IDX, MONTHS_SHORT } from '../../types';

interface Props {
  year: number;
  marks: CommunionMark[];
  onCycle: (month: string) => void;
  disabled?: boolean;
}

/**
 * Grelha de 12 meses para registar a comunhão com um clique por mês:
 *   vazio → ✓ participou → ✗ não participou → vazio
 * (réplica digital das casas assinadas pelo pastor no cartão de papel)
 */
export default function CommunionGrid({ year, marks, onCycle, disabled }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-6 gap-1">
        {MONTHS_IDX.map((mi, i) => {
          const mark = marks.find((c) => c.year === year && c.month === mi)?.mark || '';
          return (
            <button
              key={mi}
              type="button"
              disabled={disabled}
              onClick={() => onCycle(mi)}
              title={`${MONTHS_SHORT[i]} ${year}: clique para rodar  vazio → ✓ → ✗ → vazio`}
              className={`h-9 rounded border text-[11px] font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50 ${
                mark === 'present'
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : mark === 'absent'
                    ? 'border-red-300 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300'
                    : 'border-slate-300 dark:border-slate-700 text-slate-400 hover:border-slate-400'
              }`}
            >
              {MONTHS_SHORT[i]}
              {mark === 'present' ? <Check className="h-3.5 w-3.5" /> : mark === 'absent' ? <X className="h-3.5 w-3.5" /> : null}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-500">
        ✓ participou · ✗ não participou · vazio = ainda não registado. Cada marca guarda quem a registou.
      </p>
    </div>
  );
}
