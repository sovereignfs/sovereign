import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock @sovereignfs/db and ./db before importing the module under test so the
// real DB is never opened during unit tests.
vi.mock('@sovereignfs/db', () => ({
  hasUserCapabilityGrant: vi.fn(),
}));
vi.mock('../db', () => ({
  getPlatformDb: vi.fn(),
}));

import { hasUserCapabilityGrant } from '@sovereignfs/db';
import { getPlatformDb } from '../db';
import { hasUserCapability } from '../user-capabilities';

const mockPdb = { dialect: 'sqlite' };

afterEach(() => {
  vi.clearAllMocks();
});

describe('hasUserCapability', () => {
  it('returns true from the role preset without touching the DB', async () => {
    const result = await hasUserCapability({ id: 'u1', role: 'platform:admin' }, 'console:access');
    expect(result).toBe(true);
    expect(getPlatformDb).not.toHaveBeenCalled();
    expect(hasUserCapabilityGrant).not.toHaveBeenCalled();
  });

  it('falls back to a per-user grant for an allowlisted capability the role lacks', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(hasUserCapabilityGrant).mockResolvedValue(true);

    const result = await hasUserCapability(
      { id: 'u1', role: 'platform:user' },
      'plugins:self-manage',
    );

    expect(result).toBe(true);
    expect(hasUserCapabilityGrant).toHaveBeenCalledWith(mockPdb, 'u1', 'plugins:self-manage');
  });

  it('returns false when no grant exists for an allowlisted capability', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(hasUserCapabilityGrant).mockResolvedValue(false);

    const result = await hasUserCapability(
      { id: 'u1', role: 'platform:user' },
      'plugins:self-manage',
    );

    expect(result).toBe(false);
  });

  it('never queries the DB for a non-grantable capability the role lacks', async () => {
    const result = await hasUserCapability({ id: 'u1', role: 'platform:user' }, 'role:assign');

    expect(result).toBe(false);
    expect(getPlatformDb).not.toHaveBeenCalled();
    expect(hasUserCapabilityGrant).not.toHaveBeenCalled();
  });
});
