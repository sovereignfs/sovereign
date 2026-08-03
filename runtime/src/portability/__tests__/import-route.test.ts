import { afterEach, describe, expect, it, vi } from 'vitest';

// Route-level test: exercises the actual POST handler (auth header gating,
// multipart parsing, size-cap enforcement, error mapping, session-cache
// cookie clearing) with applyImport/applyPlatformImport mocked out — those
// already have their own unit tests in this directory.
vi.mock('@sovereignfs/db', () => ({ DEFAULT_TENANT_ID: 'default' }));
vi.mock('@/src/activity', () => ({ logActivity: vi.fn() }));
vi.mock('@/src/portability/platform', () => ({
  applyPlatformImport: vi.fn(),
  eligiblePluginIds: vi.fn(),
}));
vi.mock('@/src/portability/restore', () => ({ applyImport: vi.fn() }));

import { logActivity } from '@/src/activity';
import { eligiblePluginIds } from '@/src/portability/platform';
import { applyImport } from '@/src/portability/restore';
import { POST } from '../../../app/api/account/import/route';

function requestWithBundle(
  file: File | null,
  headers: Record<string, string> = { 'x-sovereign-user-id': 'u1' },
): Request {
  const form = new FormData();
  if (file) form.append('bundle', file);
  return new Request('http://localhost/api/account/import', {
    method: 'POST',
    headers,
    body: form,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/account/import', () => {
  it('rejects an unauthenticated request without touching applyImport', async () => {
    const res = await POST(requestWithBundle(new File(['x'], 'b.zip'), {}));

    expect(res.status).toBe(401);
    expect(applyImport).not.toHaveBeenCalled();
  });

  it('rejects a request with no bundle field', async () => {
    const res = await POST(requestWithBundle(null));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/no bundle/);
  });

  it('rejects an oversized bundle before calling applyImport', async () => {
    vi.mocked(eligiblePluginIds).mockResolvedValue([]);
    const big = new File([new Uint8Array(51 * 1024 * 1024)], 'b.zip');

    const res = await POST(requestWithBundle(big));

    expect(res.status).toBe(413);
    expect(applyImport).not.toHaveBeenCalled();
  });

  it('applies a valid bundle, logs the import, and clears both session-cache cookies', async () => {
    vi.mocked(eligiblePluginIds).mockResolvedValue(['test.plugin']);
    const summary = {
      formatVersion: 2,
      sourceInstance: null,
      sections: [{ pluginId: 'platform', status: 'imported' as const }],
    };
    vi.mocked(applyImport).mockResolvedValue(summary);

    const res = await POST(requestWithBundle(new File(['zip-bytes'], 'b.zip')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summary);
    expect(applyImport).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', tenantId: 'default' }),
    );
    // importPlugins is derived from the data:import allow-list, scoped by user.
    expect(vi.mocked(applyImport).mock.calls[0]?.[0].importPlugins).toEqual(
      new Set(['test.plugin']),
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', action: 'account.data_imported' }),
    );
    const setCookie = res.headers.getSetCookie?.() ?? [];
    expect(setCookie.some((c) => c.startsWith('better-auth.session_data=;'))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('__Secure-better-auth.session_data=;'))).toBe(true);
  });

  it('maps a thrown validation error to a 400 with its message', async () => {
    vi.mocked(eligiblePluginIds).mockResolvedValue([]);
    vi.mocked(applyImport).mockRejectedValue(
      new Error('Invalid bundle: manifest.json is missing.'),
    );

    const res = await POST(requestWithBundle(new File(['not-a-zip'], 'b.zip')));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid bundle: manifest.json is missing.');
  });
});
