/**
 * The export download's name carries the instance's host, from `SV_URL`. In the image the request's own address is the one the server
 * listens on, `0.0.0.0`, which is what every download was once named after.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireCapability = vi.fn();
vi.mock('../auth/authorize', async (original) => ({
  ...(await original<typeof import('../auth/authorize')>()),
  requireSameOrigin: () => undefined,
  requireCapability: (capability: string) => requireCapability(capability) as unknown,
}));
vi.mock('../auth/settings', async (original) => ({
  ...(await original<typeof import('../auth/settings')>()),
  getAuthSettings: () => ({ baseUrl: 'https://sovereign.example.org', trustedOrigins: [] }),
}));
vi.mock('../exports/service', () => ({ getExportJobs: () => Promise.resolve({}) }));
vi.mock('../files', () => ({ coreFilesRoot: () => '/data/files' }));
const downloadExport = vi.fn();
vi.mock('@sovereignfs/export', async (original) => ({
  ...(await original<typeof import('@sovereignfs/export')>()),
  downloadExport: (input: unknown) => downloadExport(input) as unknown,
}));

const { POST } = await import('../../app/api/exports/[id]/route');

beforeEach(() => {
  requireCapability
    .mockReset()
    .mockResolvedValue({ user: { id: 'u-ada' }, session: { id: 's-1' } });
  downloadExport.mockReset().mockResolvedValue(new Response('zip'));
});

describe('downloading an export', () => {
  it('names the file after the instance’s own host, not the address the server listens on', async () => {
    const response = await POST(
      new Request('http://0.0.0.0:3000/api/exports/job-1?kind=person', { method: 'POST' }),
      { params: Promise.resolve({ id: 'job-1' }) },
    );
    expect(response.status).toBe(200);
    expect(downloadExport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'sovereign.example.org', id: 'job-1', sub: 'u-ada' }),
    );
  });
});
