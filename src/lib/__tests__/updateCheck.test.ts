import { describe, expect, it } from 'vitest';
import { compareVersions } from '../updateCheck';

describe('compareVersions (a=current, b=remota; >0 se houver atualização)', () => {
  it('deteta versão nova', () => {
    expect(compareVersions('1.9.3', 'v1.9.4')).toBeGreaterThan(0);
    expect(compareVersions('1.8.0', 'v1.9.4')).toBeGreaterThan(0);
    expect(compareVersions('1.9.4', 'v2.0.0')).toBeGreaterThan(0);
  });
  it('igual ou mais antiga → não avisa', () => {
    expect(compareVersions('1.9.4', 'v1.9.4')).toBe(0);
    expect(compareVersions('1.9.5', 'v1.9.4')).toBeLessThan(0);
  });
  it('não parte com formatos estranhos', () => {
    expect(compareVersions('0.0.0', 'v1.9.4')).toBeGreaterThan(0);
    expect(compareVersions('1.9', 'v1.9.4')).toBeGreaterThan(0);
  });
});
