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

const { getEmailTemplateCopyAction, saveEmailTemplateCopyAction, testSendEmailTemplateAction } =
  await import('../email-templates-actions');

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

function mockAdminFetch(responses: Record<string, { status: number; body?: unknown }>) {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname + new URL(url).search;
    const key = `${method} ${path}`;
    const match = responses[key] ?? responses[path];
    if (!match) return Promise.reject(new Error(`unexpected fetch: ${key}`));
    return Promise.resolve(
      new Response(match.body ? JSON.stringify(match.body) : '{}', { status: match.status }),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({
    user: { id: 'admin-1', name: 'Admin', email: 'admin@example.test' },
  });
  hasCapability.mockReturnValue(true);
});

/**
 * Regression coverage for an authorization gap found while implementing the
 * standalone hotfix workstream 0020 leg 7 (13.11/13.12) depends on:
 * getEmailTemplateCopyAction and testSendEmailTemplateAction called only
 * requireSession(), with no hasCapability check, unlike their sibling
 * saveEmailTemplateCopyAction — while still attaching SOVEREIGN_ADMIN_KEY
 * on the caller's behalf via adminFetch. Since server actions are reachable
 * by action id independent of the Console page's adminOnly gate
 * (docs/architecture-rules.md), any authenticated non-admin user could
 * previously read the password-reset/invite email copy and trigger a real
 * test-send. Fixed alongside this test — both now require
 * instance:configure, matching saveEmailTemplateCopyAction's existing gate.
 */
describe('email-templates-actions — admin-only behavior (regression)', () => {
  it('getEmailTemplateCopyAction refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    const result = await getEmailTemplateCopyAction('invite', 'en');

    expect(result).toEqual({
      ok: false,
      error: 'Insufficient privileges to view email templates.',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('getEmailTemplateCopyAction returns the copy for an authorized session', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'GET /api/admin/email-templates?templateId=invite&locale=en': {
          status: 200,
          body: { copy: { subject: 'You are invited' } },
        },
      }),
    );

    const result = await getEmailTemplateCopyAction('invite', 'en');

    expect(result).toEqual({ ok: true, copy: { subject: 'You are invited' } });
    vi.unstubAllGlobals();
  });

  it('saveEmailTemplateCopyAction refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    const result = await saveEmailTemplateCopyAction(
      null,
      formData({ templateId: 'invite', locale: 'en', subject: 'New subject' }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'Insufficient privileges to change email templates.',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('testSendEmailTemplateAction refuses a session without instance:configure', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    const result = await testSendEmailTemplateAction(
      null,
      formData({ templateId: 'invite', locale: 'en' }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'Insufficient privileges to send a test email.',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('testSendEmailTemplateAction sends a test email for an authorized session', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'POST /api/admin/email-templates/test': { status: 200, body: { status: 'sent' } },
      }),
    );

    const result = await testSendEmailTemplateAction(
      null,
      formData({ templateId: 'invite', locale: 'en' }),
    );

    expect(result).toEqual({ ok: true, message: 'Test email sent to admin@example.test.' });
    vi.unstubAllGlobals();
  });
});
