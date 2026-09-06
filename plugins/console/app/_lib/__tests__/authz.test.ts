import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const hasCapability = vi.fn();

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: {
      requireSession: () => requireSession(),
      hasCapability: (...args: unknown[]) => hasCapability(...args),
    },
  },
}));

const { CapabilityError, requireCapability } = await import('../authz');

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'admin-1' } });
});

describe('requireCapability', () => {
  it('returns the session when the capability is held, checking that capability specifically', async () => {
    hasCapability.mockReturnValue(true);
    await expect(requireCapability('user:manage')).resolves.toEqual({ user: { id: 'admin-1' } });
    expect(hasCapability).toHaveBeenCalledWith({ user: { id: 'admin-1' } }, 'user:manage');
  });

  it('throws a CapabilityError with the conventional message for a known capability', async () => {
    hasCapability.mockReturnValue(false);
    const error = await requireCapability('plugin:manage').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CapabilityError);
    expect((error as Error).message).toBe('Insufficient privileges to manage apps.');
    expect((error as InstanceType<typeof CapabilityError>).capability).toBe('plugin:manage');
  });

  it('uses a caller-supplied message and a generic one for an unknown capability', async () => {
    hasCapability.mockReturnValue(false);
    await expect(requireCapability('user:manage', 'Custom.')).rejects.toThrow('Custom.');
    await expect(requireCapability('made:up')).rejects.toThrow(
      'Insufficient privileges (made:up).',
    );
  });

  it('propagates a missing session before consulting capabilities', async () => {
    requireSession.mockRejectedValue(new Error('unauthenticated'));
    await expect(requireCapability('user:manage')).rejects.toThrow('unauthenticated');
    expect(hasCapability).not.toHaveBeenCalled();
  });
});
