import { describe, expect, it, vi } from 'vitest';
import { withBackoff, isRetryableError } from '../retry';

describe('withBackoff', () => {
  it('devolve o valor quando corre à primeira', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withBackoff(fn, { baseMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('repete em erro transitório e acaba por ter sucesso', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('429'), { status: 429 }))
      .mockResolvedValue('ok');
    await expect(withBackoff(fn, { tries: 3, baseMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('NÃO repete em erro de permissão', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('403'), { status: 403 }));
    await expect(withBackoff(fn, { tries: 5, baseMs: 1, retryable: isRetryableError })).rejects.toThrow('403');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('desiste ao fim das tentativas', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('500'), { status: 500 }));
    await expect(withBackoff(fn, { tries: 3, baseMs: 1, retryable: isRetryableError })).rejects.toThrow('500');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('isRetryableError', () => {
  it('classifica corretamente', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 408 })).toBe(true);
    expect(isRetryableError({ name: 'AbortError' })).toBe(true);
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 403 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });
});
