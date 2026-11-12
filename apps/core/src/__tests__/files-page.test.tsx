// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => Promise.resolve(undefined) }));
const store = vi.hoisted(() => ({ list: vi.fn(), usage: vi.fn() }));
vi.mock('../files', () => ({
  getFileStore: () => store,
  MAX_UPLOAD_BYTES: 100 * 1024 * 1024,
}));
vi.mock('../../app/files/actions', () => ({ deleteFileAction: vi.fn() }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/files',
  redirect: (to: string) => {
    throw Object.assign(new Error('redirect'), { digest: `NEXT_REDIRECT;replace;${to}` });
  },
}));

const { default: FilesPage } = await import('../../app/files/page');
const { FilesPanel } = await import('../../app/files/files-panel');

const PHOTO = {
  id: 'abcdefghijklmnopqrstuv',
  name: 'holiday <b>photo</b>.png',
  size: 52_000,
  type: 'image/png',
  inline: true,
  createdAt: '2026-11-12T10:00:00.000Z',
};
const REPORT = {
  ...PHOTO,
  id: 'zzzzzzzzzzzzzzzzzzzzzz',
  name: 'report.pdf',
  type: 'application/pdf',
  inline: false,
};
const USAGE = { bytes: 104_000, files: 2, quota: { bytes: 200 * 1024 ** 3, files: 1000 } };

afterEach(cleanup);
beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ user: { id: 'ada', role: 'platform:user' } });
  store.list.mockReset().mockResolvedValue([PHOTO, REPORT]);
  store.usage.mockReset().mockResolvedValue(USAGE);
  refresh.mockReset();
});

describe('the Files page', () => {
  it('sends someone who is not signed in to sign in, and back here afterwards, reading nothing', async () => {
    getSession.mockResolvedValue(null);
    await expect(FilesPage()).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?returnTo=%2Ffiles'),
    });
    expect(store.list).not.toHaveBeenCalled();
  });

  it('tells someone signed in whose role may not keep files so, and reads nothing', async () => {
    const matrix = await import('../roles/matrix');
    vi.spyOn(matrix, 'getCapabilityMatrix').mockResolvedValue({
      'platform:admin': new Set(),
      'platform:user': new Set(['profile:manage']),
    } as never);
    const html = renderToStaticMarkup(await FilesPage());
    expect(html).toContain('not turned on for your account');
    expect(store.list).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('reads the session’s own files, and says who can open them', async () => {
    const html = renderToStaticMarkup(await FilesPage());
    expect(store.list).toHaveBeenCalledWith('ada');
    expect(store.usage).toHaveBeenCalledWith('ada');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Only you can open them');
  });

  it('lists each file as text, with its size, and downloads the ones a browser would otherwise run', async () => {
    const html = renderToStaticMarkup(await FilesPage());
    expect(html).toContain('holiday &lt;b&gt;photo&lt;/b&gt;.png');
    expect(html).not.toContain('<b>photo</b>');
    expect(html).toContain(`href="/api/files/${PHOTO.id}"`);
    expect(html).toMatch(new RegExp(`href="/api/files/${REPORT.id}" download="report.pdf"`));
    expect(html).toContain('51 KB');
    expect(html).toContain('2 of 1000 files');
    expect(html).toContain('of 200 GB used');
  });

  it('says there are none, rather than showing an empty list', async () => {
    store.list.mockResolvedValue([]);
    const html = renderToStaticMarkup(await FilesPage());
    expect(html).toContain('No files yet');
  });
});

describe('adding a file', () => {
  const panel = () =>
    render(<FilesPanel files={[]} usage={USAGE} maxUploadBytes={100 * 1024 * 1024} />);
  const choose = (file: File) =>
    fireEvent.change(screen.getByLabelText('A file to keep in your account'), {
      target: { files: [file] },
    });

  it('sends the file as it is, with its name beside it, and shows the new list', async () => {
    const fetched = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetched);
    panel();
    const file = new File(['hello'], 'my notes.txt', { type: 'text/plain' });
    choose(file);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetched.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/files');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-file-name']).toBe('my%20notes.txt');
    expect(init.body).toBe(file);
    vi.unstubAllGlobals();
  });

  it('shows the server’s words when it will not keep the file, and does not reload as if it had', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: 'over_quota', message: 'There is not enough room left.' },
            { status: 507 },
          ),
        ),
    );
    panel();
    choose(new File(['x'], 'big.bin'));
    expect(await screen.findByText('There is not enough room left.')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('refuses a file that is too large before sending a byte, saying how large may be sent', () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    panel();
    const huge = new File(['x'], 'huge.bin');
    Object.defineProperty(huge, 'size', { value: 101 * 1024 * 1024 });
    choose(huge);
    expect(screen.getByText(/larger than 100 MB/)).toBeTruthy();
    expect(fetched).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('says so when the connection fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    panel();
    choose(new File(['x'], 'a.txt'));
    expect(await screen.findByText(/Check your connection/)).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
