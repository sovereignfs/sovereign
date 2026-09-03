import { afterEach, describe, expect, it, vi } from 'vitest';

// Route-level test: exercises the actual GET handler (auth header gating,
// query param passthrough, response headers, size-cap enforcement, activity
// logging) with the layers it calls into mocked out — those layers
// (assembleExport, platform gather helpers) already have their own unit
// tests in this directory.
vi.mock('@sovereignfs/db', () => ({ DEFAULT_TENANT_ID: 'default' }));
vi.mock('@/src/activity', () => ({ logActivity: vi.fn() }));
vi.mock('@/src/platform-version', () => ({ getPlatformVersion: vi.fn(() => '0.45.1') }));
vi.mock('@/src/portability/assemble', () => ({ assembleExport: vi.fn() }));
vi.mock('@/src/portability/platform', () => ({
  eligibleExportPlugins: vi.fn(),
  gatherPlatformExport: vi.fn(),
  installedPluginsRoster: vi.fn(),
}));

import { logActivity } from '@/src/activity';
import { assembleExport } from '@/src/portability/assemble';
import {
  eligibleExportPlugins,
  gatherPlatformExport,
  installedPluginsRoster,
} from '@/src/portability/platform';
import { GET } from '../../../app/api/account/export/route';

function request(headers: Record<string, string> = {}, query = ''): Request {
  return new Request(`http://localhost/api/account/export${query}`, { headers });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/account/export', () => {
  it('rejects an unauthenticated request without assembling anything', async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(assembleExport).not.toHaveBeenCalled();
  });

  it('assembles and streams a zip for an authenticated user, and logs the export', async () => {
    vi.mocked(gatherPlatformExport).mockResolvedValue({
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      timezone: 'UTC',
      theme: 'system',
      vaultSecrets: [],
      avatar: null,
      e2ee: null,
      notifications: [],
      messages: [],
    });
    vi.mocked(eligibleExportPlugins).mockResolvedValue({});
    vi.mocked(installedPluginsRoster).mockResolvedValue([]);
    const zipBytes = new Uint8Array([1, 2, 3, 4]);
    vi.mocked(assembleExport).mockResolvedValue(zipBytes);

    const res = await GET(request({ 'x-sovereign-user-id': 'u1' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toContain(
      'attachment; filename="sovereign-export-',
    );
    const body = new Uint8Array(await res.arrayBuffer());
    expect([...body]).toEqual([1, 2, 3, 4]);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', action: 'account.data_exported' }),
    );
    // The exporting user's own id/tenant flow through to assembleExport.
    expect(assembleExport).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', tenantId: 'default' }),
    );
  });

  it('passes includeFiles=false through to assembleExport when requested', async () => {
    vi.mocked(gatherPlatformExport).mockResolvedValue({
      name: null,
      email: null,
      image: null,
      timezone: 'UTC',
      theme: 'system',
      vaultSecrets: [],
      avatar: null,
      e2ee: null,
      notifications: [],
      messages: [],
    });
    vi.mocked(eligibleExportPlugins).mockResolvedValue({});
    vi.mocked(installedPluginsRoster).mockResolvedValue([]);
    vi.mocked(assembleExport).mockResolvedValue(new Uint8Array([1]));

    await GET(request({ 'x-sovereign-user-id': 'u1' }, '?includeFiles=false'));

    expect(assembleExport).toHaveBeenCalledWith(
      expect.objectContaining({ options: { includeFiles: false } }),
    );
  });

  it('returns 413 without logging an export when the assembled zip exceeds the size cap', async () => {
    vi.mocked(gatherPlatformExport).mockResolvedValue({
      name: null,
      email: null,
      image: null,
      timezone: 'UTC',
      theme: 'system',
      vaultSecrets: [],
      avatar: null,
      e2ee: null,
      notifications: [],
      messages: [],
    });
    vi.mocked(eligibleExportPlugins).mockResolvedValue({});
    vi.mocked(installedPluginsRoster).mockResolvedValue([]);
    vi.mocked(assembleExport).mockResolvedValue(new Uint8Array(51 * 1024 * 1024));

    const res = await GET(request({ 'x-sovereign-user-id': 'u1' }));

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/size limit/);
    expect(logActivity).not.toHaveBeenCalled();
  });
});
