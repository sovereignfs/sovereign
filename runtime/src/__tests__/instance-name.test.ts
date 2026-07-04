import { describe, expect, it } from 'vitest';
import { resolveInstanceName } from '../instance-name';

describe('resolveInstanceName', () => {
  it('falls back to Sovereign for missing or blank values', () => {
    expect(resolveInstanceName(undefined)).toBe('Sovereign');
    expect(resolveInstanceName(null)).toBe('Sovereign');
    expect(resolveInstanceName('')).toBe('Sovereign');
    expect(resolveInstanceName('   ')).toBe('Sovereign');
  });

  it('trims configured names', () => {
    expect(resolveInstanceName('  Acme Workspace  ')).toBe('Acme Workspace');
  });
});
