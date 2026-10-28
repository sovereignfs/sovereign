// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateUser = vi.fn();
vi.mock('../auth/client', () => ({
  authClient: { updateUser: (input: unknown) => updateUser(input) as unknown },
}));

const { ProfilePanel } = await import('../../app/profile/profile-panel');
const { AvatarPrepareError } = await import('../../app/profile/avatar-image');

const fetchMock = vi.fn();
const prepare = vi.fn();
const preview = vi.fn(() => 'blob:preview-1');
const revoke = vi.fn();

beforeEach(() => {
  updateUser.mockReset();
  fetchMock.mockReset();
  prepare.mockReset().mockResolvedValue(new Blob(['small'], { type: 'image/webp' }));
  preview.mockClear();
  revoke.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: preview, revokeObjectURL: revoke }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const chooseFile = () =>
  fireEvent.change(screen.getByLabelText('Choose a picture', { selector: 'input' }), {
    target: { files: [new File(['x'], 'me.png', { type: 'image/png' })] },
  });
const render9 = (image: string | null = null) =>
  render(
    <ProfilePanel name="Ada Lovelace" email="ada@example.com" image={image} prepare={prepare} />,
  );

describe('the profile panel', () => {
  it('shows the email address as text, with no way to change it', () => {
    render9();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText(/cannot be changed here/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Email/)).toBeNull();
  });

  it('shows the initial where there is no picture', () => {
    render9();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose a picture' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove picture' })).toBeNull();
  });

  it('shows the picture where there is one, with the way to change or remove it', () => {
    render9('/api/avatars/u1?v=abc');
    expect(screen.getByRole('img', { name: 'Ada Lovelace' }).getAttribute('src')).toBe(
      '/api/avatars/u1?v=abc',
    );
    expect(screen.getByRole('button', { name: 'Change picture' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove picture' })).toBeTruthy();
  });
});

describe('the name', () => {
  it('is saved, and says so', async () => {
    updateUser.mockResolvedValue({ data: { status: true }, error: null });
    render9();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: '  Ada King ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Your name is saved.')).toBeTruthy();
    expect(updateUser).toHaveBeenCalledWith({ name: '  Ada King ' });
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Ada King');
  });

  it('shows the server’s words when it is refused, and keeps what was typed', async () => {
    updateUser.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_NAME', message: 'A name is 1 to 100 characters.' },
    });
    render9();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('A name is 1 to 100 characters.')).toBeTruthy();
    expect(screen.queryByText('Your name is saved.')).toBeNull();
  });

  it('says to wait when the limit is reached, and plainly for anything else', async () => {
    updateUser.mockResolvedValueOnce({ data: null, error: { status: 429 } });
    render9();
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
    updateUser.mockResolvedValueOnce({
      data: null,
      error: { status: 500, message: 'SQLITE_BUSY' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Your name could not be saved. Try again.')).toBeTruthy();
    expect(screen.queryByText(/SQLITE/)).toBeNull();
  });
});

describe('the picture', () => {
  it('is prepared and previewed before anything is sent, and can be dropped', async () => {
    render9();
    chooseFile();
    expect(await screen.findByRole('button', { name: 'Use this picture' })).toBeTruthy();
    expect(prepare).toHaveBeenCalledOnce();
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:preview-1');
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Use this picture' })).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:preview-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is sent as the prepared picture itself, then shown from the address core gives back', async () => {
    fetchMock.mockReturnValue(reply(200, { image: '/api/avatars/u1?v=new' }));
    render9();
    chooseFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Use this picture' }));
    await waitFor(() =>
      expect(screen.getByRole('img').getAttribute('src')).toBe('/api/avatars/u1?v=new'),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/profile/avatar');
    expect(init.method).toBe('POST');
    expect((init.body as Blob).type).toBe('image/webp');
    expect(screen.getByRole('button', { name: 'Change picture' })).toBeTruthy();
  });

  it('shows what core says when it refuses the picture, and keeps the preview to try again', async () => {
    fetchMock.mockReturnValue(
      reply(413, { error: 'too-large', message: 'That picture is larger than 1 MB.' }),
    );
    render9();
    chooseFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Use this picture' }));
    expect((await screen.findByRole('alert')).textContent).toContain('larger than 1 MB');
    expect(screen.getByRole('button', { name: 'Use this picture' })).toBeTruthy();
  });

  it('says plainly when the connection fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render9();
    chooseFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Use this picture' }));
    expect((await screen.findByRole('alert')).textContent).toContain('connection');
  });

  it('says so when the browser cannot read the file, and sends nothing', async () => {
    prepare.mockRejectedValue(
      new AvatarPrepareError(
        'unreadable',
        'That picture could not be read. Use a PNG, JPEG or WebP picture.',
      ),
    );
    render9();
    chooseFile();
    expect((await screen.findByRole('alert')).textContent).toContain('could not be read');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Use this picture' })).toBeNull();
  });

  it('is removed, and the initial comes back', async () => {
    fetchMock.mockReturnValue(reply(200, { image: null }));
    render9('/api/avatars/u1?v=abc');
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull());
    expect(screen.getByText('A')).toBeTruthy();
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe('DELETE');
  });
});
