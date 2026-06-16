import { describe, expect, it } from 'vitest';
import { findApiProvider } from '../api-provider';
import type { SovereignManifest } from '../types';

const make = (id: string, apiProvider?: boolean): SovereignManifest =>
  ({
    schemaVersion: 1,
    id,
    name: id,
    version: '1.0.0',
    type: 'sovereign',
    runtime: 'native',
    routePrefix: `/${id}`,
    permissions: [],
    compatibility: { minPlatformVersion: '0.5.0' },
    ...(apiProvider === undefined ? {} : { apiProvider }),
  }) as SovereignManifest;

describe('findApiProvider', () => {
  it('returns no provider when none declare apiProvider', () => {
    const res = findApiProvider([make('a'), make('b', false)]);
    expect(res.provider).toBeUndefined();
    expect(res.duplicates).toEqual([]);
  });

  it('returns the single provider when exactly one declares apiProvider', () => {
    const res = findApiProvider([make('a'), make('api-composer', true)]);
    expect(res.provider?.id).toBe('api-composer');
    expect(res.duplicates).toHaveLength(1);
  });

  it('reports duplicates and resolves no provider when more than one declares it', () => {
    const res = findApiProvider([make('one', true), make('two', true)]);
    expect(res.provider).toBeUndefined();
    expect(res.duplicates.map((m) => m.id)).toEqual(['one', 'two']);
  });
});
