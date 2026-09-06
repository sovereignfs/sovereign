import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const hasCapability = vi.fn();
const searchUsers = vi.fn();

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: {
      requireSession: () => requireSession(),
      hasCapability: (...args: unknown[]) => hasCapability(...args),
    },
    directory: { searchUsers: (...args: unknown[]) => searchUsers(...args) },
  },
}));

const { searchRecipientsAction } = await import('../recipients-actions');

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'admin-1' } });
  hasCapability.mockReturnValue(true);
});

describe('searchRecipientsAction', () => {
  it('refuses without console:access, never touching the directory', async () => {
    hasCapability.mockReturnValue(false);
    await expect(searchRecipientsAction('ada')).rejects.toThrow(
      'Insufficient privileges to search recipients.',
    );
    expect(hasCapability).toHaveBeenCalledWith(expect.anything(), 'console:access');
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it('ignores queries under two characters', async () => {
    await expect(searchRecipientsAction(' a ')).resolves.toEqual([]);
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it('trims and forwards a real query with a small limit', async () => {
    searchUsers.mockResolvedValue([{ id: 'u-1' }]);
    await expect(searchRecipientsAction(' ada ')).resolves.toEqual([{ id: 'u-1' }]);
    expect(searchUsers).toHaveBeenCalledWith({ query: 'ada', limit: 8 });
  });
});
