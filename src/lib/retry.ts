/**
 * Retries com backoff exponencial + jitter — usado pelas chamadas de IA e pelo
 * cliente do Worker (tratadas como operações que PODEM falhar: quota, 5xx,
 * rede móvel instável).
 */
export interface BackoffOpts {
  tries?: number;
  baseMs?: number;
  maxMs?: number;
  retryable?: (e: unknown) => boolean;
  onRetry?: (e: unknown, attempt: number, waitMs: number) => void;
}

export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOpts = {}): Promise<T> {
  const { tries = 3, baseMs = 700, maxMs = 8000, retryable = () => true, onRetry } = opts;
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt === tries - 1 || !retryable(e)) break;
      const wait = Math.min(maxMs, baseMs * 2 ** attempt) * (0.8 + Math.random() * 0.4);
      onRetry?.(e, attempt + 1, Math.round(wait));
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

/** Repetível: timeout, quota, erro de servidor, falha de rede.
 *  NÃO repetível: 400 (pedido inválido), 401/403 (sessão/papel), 404 (rota). */
export const isRetryableError = (e: any): boolean => {
  const st = e?.status;
  if (st === 408 || st === 429) return true;
  if (typeof st === 'number' && st >= 500 && st <= 599) return true;
  const name = e?.name;
  return name === 'AbortError' || name === 'TypeError';
};
