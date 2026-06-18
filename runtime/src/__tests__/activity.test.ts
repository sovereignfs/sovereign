import { afterEach, assert, describe, expect, it, vi } from 'vitest';

// Mock @sovereignfs/db before importing the module under test so the real DB
// is never opened during unit tests.
vi.mock('@sovereignfs/db', () => ({
  getPlatformDb: vi.fn(),
  recordActivity: vi.fn(),
}));

import { getPlatformDb, recordActivity } from '@sovereignfs/db';
import { logActivity } from '../activity';

const mockPdb = { dialect: 'sqlite' };

afterEach(() => {
  vi.clearAllMocks();
});

describe('logActivity', () => {
  it('calls recordActivity with a generated UUID and the supplied input', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(recordActivity).mockResolvedValue(undefined);

    await logActivity({
      actorId: 'u1',
      actorType: 'user',
      action: 'plugin.enabled',
      visibility: 'admin',
      summary: 'Plugin enabled',
    });

    expect(recordActivity).toHaveBeenCalledOnce();
    const call = vi.mocked(recordActivity).mock.calls[0];
    assert(call !== undefined, 'recordActivity was not called');
    const [pdb, input] = call;
    expect(pdb).toBe(mockPdb);
    expect(input.actorId).toBe('u1');
    expect(input.action).toBe('plugin.enabled');
    expect(input.summary).toBe('Plugin enabled');
    // id must be a non-empty string (UUID generated internally)
    expect(typeof input.id).toBe('string');
    expect(input.id.length).toBeGreaterThan(0);
  });

  it('never throws when recordActivity rejects — log failure must not block callers', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(recordActivity).mockRejectedValue(new Error('DB write failed'));

    await expect(
      logActivity({
        actorId: 'u1',
        actorType: 'user',
        action: 'plugin.enabled',
        visibility: 'admin',
      }),
    ).resolves.toBeUndefined();
  });

  it('never throws when getPlatformDb rejects', async () => {
    vi.mocked(getPlatformDb).mockRejectedValue(new Error('DB unreachable'));

    await expect(
      logActivity({
        actorId: 'u1',
        actorType: 'user',
        action: 'plugin.enabled',
        visibility: 'admin',
      }),
    ).resolves.toBeUndefined();
  });
});
