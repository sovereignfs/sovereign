import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Route-level test: exercises the actual DELETE handler (auth gating,
// password re-verification, sole-owner guard, activity logging) with the
// layers it calls into mocked out.
vi.mock('@sovereignfs/db', () => ({ DEFAULT_TENANT_ID: 'default' }));
vi.mock('@/src/activity', () => ({ logActivity: vi.fn() }));
vi.mock('@/src/user-deletion', () => ({ deleteUser: vi.fn() }));
vi.mock('@/src/platform-email', () => ({ sendPlatformEmail: vi.fn() }));

import { logActivity } from '@/src/activity';
import { sendPlatformEmail } from '@/src/platform-email';
import { deleteUser } from '@/src/user-deletion';
import { DELETE } from '../../app/api/account/route';

function request(
  headers: Record<string, string> = {},
  body: Record<string, unknown> = { password: 'correct-horse' },
): Request {
  return new Request('http://localhost/api/account', {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  });
}

const AUTH_HEADERS = {
  'x-sovereign-user-id': 'u1',
  'x-sovereign-user-email': 'ada@example.com',
};

function mockFetchSequence(responses: Array<{ ok: boolean; json?: unknown }>): void {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce({ ok: r.ok, json: async () => r.json } as Response);
  }
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DELETE /api/account', () => {
  it('rejects an unauthenticated request without logging or deleting anything', async () => {
    const res = await DELETE(request());

    expect(res.status).toBe(401);
    expect(logActivity).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password without logging or deleting anything', async () => {
    mockFetchSequence([{ ok: false }]);

    const res = await DELETE(request(AUTH_HEADERS));

    expect(res.status).toBe(403);
    expect(logActivity).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('blocks the sole platform:owner from self-deleting', async () => {
    mockFetchSequence([{ ok: true }, { ok: true, json: [{ id: 'u1', role: 'platform:owner' }] }]);

    const res = await DELETE(request(AUTH_HEADERS));

    expect(res.status).toBe(409);
    expect(logActivity).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('logs deletion under a system actor, not the deleted user, so the record survives the activity_log cascade', async () => {
    mockFetchSequence([
      { ok: true },
      {
        ok: true,
        json: [
          { id: 'u1', role: 'platform:owner' },
          { id: 'u2', role: 'platform:owner' },
        ],
      },
    ]);

    const res = await DELETE(request(AUTH_HEADERS));

    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith('u1', 'default');
    expect(sendPlatformEmail).toHaveBeenCalled();

    // The regression this test guards: deleteUserData() purges activity_log
    // rows WHERE actor_id = userId. Logging this entry under the deleted
    // user's own actorId (the pre-fix behavior) means the one record that a
    // self-service deletion ever happened gets erased along with everything
    // else. actorId must be null/system, with subjectUserId carrying "who
    // was deleted" instead — mirroring the admin-initiated deletion path,
    // whose entry already survives for the same reason.
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        actorType: 'system',
        action: 'account.self_deleted',
        subjectUserId: 'u1',
        targetType: 'user',
        targetId: 'u1',
        visibility: 'admin',
      }),
    );
  });
});
