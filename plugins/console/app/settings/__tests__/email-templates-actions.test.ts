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
 * Regression coverage for the same class of gap Task 13.5 found and fixed
 * elsewhere in this file family (users/actions.ts, settings/actions.ts) but
 * never reached in this sibling module: getEmailTemplateCopyAction and
 * testSendEmailTemplateAction called only requireSession(), with no
 * hasCapability check, unlike their sibling saveEmailTemplateCopyAction —
 * while still attaching SOVEREIGN_ADMIN_KEY on the caller's behalf via
 * adminFetch. Since server actions are reachable by action id independent
 * of the Console page's adminOnly gate (docs/architecture-rules.md), any
 * authenticated non-admin user could previously read the password-reset/
 * invite email copy and trigger a real test-send. Fixed via a standalone
 * hotfix (workstream 0020 leg 7's own prerequisite, since 13.11/13.12 are
 * meant to lock in the corrected behavior, not encode the bug as expected)
 * — both now require instance:configure, matching saveEmailTemplateCopyAction's
 * existing gate. This file also covers the remaining success/failure
 * response branches for all three actions (task 13.12).
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

  it('getEmailTemplateCopyAction surfaces a non-OK response as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'GET /api/admin/email-templates?templateId=invite&locale=en': { status: 500 },
      }),
    );

    const result = await getEmailTemplateCopyAction('invite', 'en');

    expect(result).toEqual({ ok: false, error: 'Failed to load copy: 500' });
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

  it('saveEmailTemplateCopyAction PATCHes once per changed field', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveEmailTemplateCopyAction(
      null,
      formData({ templateId: 'invite', locale: 'en', subject: 'New subject', body: 'New body' }),
    );

    expect(result).toEqual({ ok: true, message: 'Email template copy saved.' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/email-templates'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          templateId: 'invite',
          locale: 'en',
          field: 'subject',
          value: 'New subject',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/email-templates'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          templateId: 'invite',
          locale: 'en',
          field: 'body',
          value: 'New body',
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("saveEmailTemplateCopyAction short-circuits on the first field that fails, surfacing that field's own error", async () => {
    let calls = 0;
    const fetchMock = vi.fn(() => {
      calls += 1;
      // FormData key order is insertion order -- "subject" is written first
      // below, so it succeeds; "body" (written second) fails and must stop
      // the loop before a third field would ever be attempted.
      if (calls === 1) return Promise.resolve(new Response('{}', { status: 200 }));
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'value too long' }), { status: 422 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveEmailTemplateCopyAction(
      null,
      formData({
        templateId: 'invite',
        locale: 'en',
        subject: 'New subject',
        body: 'New body',
        footer: 'New footer',
      }),
    );

    expect(result).toEqual({ ok: false, error: 'value too long' });
    expect(fetchMock).toHaveBeenCalledTimes(2); // stopped after the 2nd (failing) field
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

  it('testSendEmailTemplateAction reports SMTP as unconfigured when the send is skipped', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'POST /api/admin/email-templates/test': { status: 200, body: { status: 'skipped' } },
      }),
    );

    const result = await testSendEmailTemplateAction(
      null,
      formData({ templateId: 'invite', locale: 'en' }),
    );

    expect(result).toEqual({ ok: false, error: 'SMTP is not configured — nothing was sent.' });
    vi.unstubAllGlobals();
  });

  it('testSendEmailTemplateAction surfaces the API errorCode for a failed send', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'POST /api/admin/email-templates/test': {
          status: 200,
          body: { status: 'failed', errorCode: 'smtp_auth_failed' },
        },
      }),
    );

    const result = await testSendEmailTemplateAction(
      null,
      formData({ templateId: 'invite', locale: 'en' }),
    );

    expect(result).toEqual({ ok: false, error: 'smtp_auth_failed' });
    vi.unstubAllGlobals();
  });

  it('testSendEmailTemplateAction falls back to the HTTP status when the response is non-OK with no body', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({ 'POST /api/admin/email-templates/test': { status: 502 } }),
    );

    const result = await testSendEmailTemplateAction(
      null,
      formData({ templateId: 'invite', locale: 'en' }),
    );

    expect(result).toEqual({ ok: false, error: 'Test send failed: 502' });
    vi.unstubAllGlobals();
  });
});
