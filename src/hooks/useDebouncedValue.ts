import { useEffect, useState } from 'react';

/**
 * Devolve `value` só depois de `delayMs` sem alterações.
 * O input continua imediato; o filtro/consulta usa o valor debounced.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
