import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SovereignManifest } from '@sovereignfs/manifest';
import { describe, expect, it } from 'vitest';
import { RESERVED_API_SEGMENTS, decideApiNamespace, isPublicApiPath } from '../api-namespace';

const provider = {
  id: 'fs.sovereign.api-composer',
  routePrefix: '/api-composer',
  apiProvider: true,
} as SovereignManifest;
const other = { id: 'fs.sovereign.tasks', routePrefix: '/tasks' } as SovereignManifest;
const none = new Set<string>();

describe('isPublicApiPath', () => {
  it('is true for a non-reserved /api/<slug> path', () => {
    expect(isPublicApiPath('/api/blog')).toBe(true);
    expect(isPublicApiPath('/api/blog/posts/1')).toBe(true);
  });

  it('is false for reserved runtime segments', () => {
    for (const seg of RESERVED_API_SEGMENTS) {
      expect(isPublicApiPath(`/api/${seg}`)).toBe(false);
      expect(isPublicApiPath(`/api/${seg}/x`)).toBe(false);
    }
  });

  it('is false for non-api paths and the bare /api root', () => {
    expect(isPublicApiPath('/console')).toBe(false);
    expect(isPublicApiPath('/api')).toBe(false);
    expect(isPublicApiPath('/api/')).toBe(false);
  });
});

describe('decideApiNamespace', () => {
  it('passes through reserved and non-api paths', () => {
    expect(decideApiNamespace('/api/plugins', [provider, other], none)).toEqual({ kind: 'pass' });
    expect(decideApiNamespace('/console/users', [provider], none)).toEqual({ kind: 'pass' });
  });

  it('rewrites to the provider serve route, preserving slug and path', () => {
    expect(decideApiNamespace('/api/blog/posts/1', [provider, other], none)).toEqual({
      kind: 'rewrite',
      target: '/api-composer/serve/blog/posts/1',
    });
    expect(decideApiNamespace('/api/blog/openapi.json', [provider], none)).toEqual({
      kind: 'rewrite',
      target: '/api-composer/serve/blog/openapi.json',
    });
    expect(decideApiNamespace('/api/blog', [provider], none)).toEqual({
      kind: 'rewrite',
      target: '/api-composer/serve/blog',
    });
  });

  it('is not-found when no provider is installed', () => {
    expect(decideApiNamespace('/api/blog', [other], none)).toEqual({ kind: 'not-found' });
  });

  it('is not-found when the provider is disabled', () => {
    expect(decideApiNamespace('/api/blog', [provider], new Set([provider.id]))).toEqual({
      kind: 'not-found',
    });
  });
});

describe('RESERVED_API_SEGMENTS parity', () => {
  it('lists every top-level directory under runtime/app/api', () => {
    // This test file lives in runtime/src/__tests__/, so walk up two levels
    // (__tests__ → src → runtime) to reach runtime/app/api.
    const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'api');
    const segments = readdirSync(apiDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(RESERVED_API_SEGMENTS.has(seg), `/api/${seg} must be reserved`).toBe(true);
    }
  });
});
