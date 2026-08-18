import { afterEach, describe, expect, it } from 'vitest';
import type { GrantCheck } from '@sovereignfs/sdk';
import { clearAuthzRegistry, getGrantResolver, registerGrantResolver } from '../authz-registry';

afterEach(() => {
  clearAuthzRegistry();
});

describe('authz-registry (RFC 0054)', () => {
  it('returns undefined for a plugin with no registered resolver', () => {
    expect(getGrantResolver('com.example.unregistered')).toBeUndefined();
  });

  it('returns the resolver a plugin registered', async () => {
    const check: GrantCheck = {
      capability: 'project-edit',
      resource: { type: 'project', id: 'p1' },
    };
    registerGrantResolver('com.example.projects', async (userId, c) => {
      expect(userId).toBe('u1');
      expect(c).toEqual(check);
      return true;
    });

    const resolver = getGrantResolver('com.example.projects');
    expect(resolver).toBeDefined();
    await expect(resolver?.('u1', check)).resolves.toBe(true);
  });

  it('does not leak one plugin resolver to another plugin id', async () => {
    registerGrantResolver('com.example.projects', async () => true);
    expect(getGrantResolver('com.example.other-plugin')).toBeUndefined();
  });

  it('a later registration for the same plugin replaces the earlier one', async () => {
    registerGrantResolver('com.example.projects', async () => false);
    registerGrantResolver('com.example.projects', async () => true);
    const resolver = getGrantResolver('com.example.projects');
    await expect(resolver?.('u1', { capability: 'x' })).resolves.toBe(true);
  });

  it('clearAuthzRegistry() removes every registration', () => {
    registerGrantResolver('com.example.projects', async () => true);
    clearAuthzRegistry();
    expect(getGrantResolver('com.example.projects')).toBeUndefined();
  });
});
