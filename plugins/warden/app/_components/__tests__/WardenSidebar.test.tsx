// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@sovereignfs/ui';
import type { SessionView } from '../../_lib/sessions';
import { WardenSidebar } from '../WardenSidebar';

const renameSessionAction = vi.fn();
const pinSessionAction = vi.fn();
const unpinSessionAction = vi.fn();
const deleteSessionAction = vi.fn();
vi.mock('../../actions', () => ({
  renameSessionAction: (...args: unknown[]) => renameSessionAction(...args),
  pinSessionAction: (...args: unknown[]) => pinSessionAction(...args),
  unpinSessionAction: (...args: unknown[]) => unpinSessionAction(...args),
  deleteSessionAction: (...args: unknown[]) => deleteSessionAction(...args),
}));

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
const usePathnameMock = vi.fn(() => '/warden');
const useSearchParamsMock = vi.fn(() => new URLSearchParams());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh }),
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

/** The sidebar reads `?session=` itself now (it renders from a layout,
 *  which gets no searchParams), so "which row is active" is set through the
 *  URL rather than a prop. */
function setUrlSession(id: string) {
  useSearchParamsMock.mockReturnValue(new URLSearchParams(`session=${id}`));
}

// Menu forks Popover/Drawer via useIsMobile (matchMedia) and Popover uses
// pointer capture — same fixture setup as Menu's own test suite
// (packages/ui/src/components/Menu/__tests__/Menu.test.tsx).
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function installPointerCapture() {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
}

// jsdom does not implement HTMLDialogElement.showModal()/close() — same
// minimal polyfill as ConfirmDialog's own test suite
// (packages/ui/src/components/ConfirmDialog/__tests__/ConfirmDialog.test.tsx),
// enough for the `open` attribute and the native 'close' event ConfirmDialog
// listens for.
function installDialogPolyfill() {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` clears call history but not a `mockReturnValue`, so an
  // active session set by one test would otherwise leak into the next.
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  usePathnameMock.mockReturnValue('/warden');
  installMatchMedia();
  installPointerCapture();
  installDialogPolyfill();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function session(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: 's-1',
    title: 'A chat',
    pinnedAt: null,
    lastActiveAt: 1,
    createdAt: 1,
    ...overrides,
  };
}

function renderSidebar(props: Partial<Parameters<typeof WardenSidebar>[0]> = {}) {
  return render(
    <ToastProvider>
      <WardenSidebar
        pinnedSessions={[]}
        recentSessions={[]}
        orderedSessionIds={[]}
        settingsModels={[]}
        settingsDefaultModelKey={null}
        {...props}
      />
    </ToastProvider>,
  );
}

function openMenuFor(label: string) {
  fireEvent.click(screen.getByRole('button', { name: `Options for "${label}"` }));
}

describe('WardenSidebar — groups', () => {
  it('shows an empty message when there are no sessions at all', () => {
    renderSidebar();
    expect(screen.getByText('No sessions yet — start one above.')).toBeDefined();
  });

  it('renders a Pinned group above a Recent group, each with their own sessions', () => {
    renderSidebar({
      pinnedSessions: [session({ id: 'p-1', title: 'Pinned chat', pinnedAt: 2 })],
      recentSessions: [session({ id: 'r-1', title: 'Recent chat' })],
    });
    expect(screen.getByText('Pinned')).toBeDefined();
    expect(screen.getByText('Recent')).toBeDefined();
    expect(screen.getByText('Pinned chat')).toBeDefined();
    expect(screen.getByText('Recent chat')).toBeDefined();
  });

  it('omits the Pinned heading (and group) entirely when nothing is pinned', () => {
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: 'Recent chat' })] });
    expect(screen.queryByText('Pinned')).toBeNull();
    expect(screen.queryByText('Recent')).toBeNull();
    expect(screen.getByText('Recent chat')).toBeDefined();
  });

  it('falls back to "New chat" for a session with no title yet', () => {
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: null })] });
    // Two "New chat" links now exist: the primary-nav action (href
    // /warden/new) and this session's own untitled fallback (href
    // /warden?session=r-1).
    const links = screen.getAllByRole('link', { name: 'New chat' });
    expect(links.some((link) => link.getAttribute('href') === '/warden?session=r-1')).toBe(true);
  });

  it('highlights the active session distinctly from the others', () => {
    setUrlSession('r-2');
    renderSidebar({
      recentSessions: [session({ id: 'r-1', title: 'One' }), session({ id: 'r-2', title: 'Two' })],
      orderedSessionIds: ['r-1', 'r-2'],
    });
    const activeRow = screen.getByRole('link', { name: 'Two' }).closest('div');
    const inactiveRow = screen.getByRole('link', { name: 'One' }).closest('div');
    expect(activeRow?.className).not.toBe(inactiveRow?.className);
  });

  it('links each row to its own session id, and the primary-nav "New chat" to /warden/new', () => {
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: 'One' })] });
    expect(screen.getByRole('link', { name: 'One' }).getAttribute('href')).toBe(
      '/warden?session=r-1',
    );
    // Two "New chat" links exist once a session fixture has no title of its
    // own (see the fallback-label test below) — this fixture's session is
    // titled, so only the primary-nav action matches here.
    expect(screen.getByRole('link', { name: 'New chat' }).getAttribute('href')).toBe('/warden/new');
  });

  it('marks the primary-nav "New chat" link active when on /warden/new', () => {
    usePathnameMock.mockReturnValueOnce('/warden/new');
    renderSidebar();
    expect(screen.getByRole('link', { name: 'New chat' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('does not mark "New chat" active on plain /warden', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'New chat' }).getAttribute('aria-current')).toBeNull();
  });

  it('opens General settings in a dialog rather than navigating to a page', () => {
    renderSidebar();
    // A button, not a link — General settings is small enough that leaving
    // the chat for it was the wrong trade.
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeDefined();
  });

  it('places Providers and Models links under New chat, in the primary nav', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Providers' }).getAttribute('href')).toBe(
      '/warden/providers',
    );
    expect(screen.getByRole('link', { name: 'Models' }).getAttribute('href')).toBe(
      '/warden/models',
    );
  });

  it('marks the Providers row active on its own route', () => {
    usePathnameMock.mockReturnValue('/warden/providers');
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Providers' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Models' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('WardenSidebar — collapse control', () => {
  it('renders no collapse button when onToggleCollapse is omitted', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'Hide sessions sidebar' })).toBeNull();
  });

  it('renders a collapse button that calls onToggleCollapse when provided', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ onToggleCollapse });
    fireEvent.click(screen.getByRole('button', { name: 'Hide sessions sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });
});

describe('WardenSidebar — rename', () => {
  it('replaces the row with an input pre-filled with the current title, commits on Enter', async () => {
    renameSessionAction.mockResolvedValue({ ok: true, message: 'Renamed.' });
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: 'Old title' })] });

    openMenuFor('Old title');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByLabelText('Rename "Old title"') as HTMLInputElement;
    expect(input.value).toBe('Old title');
    fireEvent.change(input, { target: { value: 'New title' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(renameSessionAction).toHaveBeenCalledWith('r-1', 'New title'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('also commits on blur (iOS keyboard-accessory Done never fires a keydown)', async () => {
    renameSessionAction.mockResolvedValue({ ok: true, message: 'Renamed.' });
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: 'Old title' })] });

    openMenuFor('Old title');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByLabelText('Rename "Old title"');
    fireEvent.change(input, { target: { value: 'Blurred title' } });
    fireEvent.blur(input);

    await waitFor(() => expect(renameSessionAction).toHaveBeenCalledWith('r-1', 'Blurred title'));
  });

  it('shows a toast and still refreshes when the rename fails', async () => {
    renameSessionAction.mockResolvedValue({ ok: false, error: 'Could not rename this session.' });
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: 'Old title' })] });

    openMenuFor('Old title');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.blur(screen.getByLabelText('Rename "Old title"'));

    expect(await screen.findByText('Could not rename this session.')).toBeDefined();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('WardenSidebar — pin/unpin', () => {
  it('shows "Pin" for an unpinned session and calls pinSessionAction', async () => {
    pinSessionAction.mockResolvedValue({ ok: true, message: 'Session pinned.' });
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: 'One', pinnedAt: null })] });

    openMenuFor('One');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }));

    await waitFor(() => expect(pinSessionAction).toHaveBeenCalledWith('r-1'));
    expect(unpinSessionAction).not.toHaveBeenCalled();
  });

  it('shows "Unpin" for a pinned session and calls unpinSessionAction', async () => {
    unpinSessionAction.mockResolvedValue({ ok: true, message: 'Session unpinned.' });
    renderSidebar({ pinnedSessions: [session({ id: 'p-1', title: 'Pinned', pinnedAt: 5 })] });

    openMenuFor('Pinned');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unpin' }));

    await waitFor(() => expect(unpinSessionAction).toHaveBeenCalledWith('p-1'));
    expect(pinSessionAction).not.toHaveBeenCalled();
  });

  it('surfaces the pin-limit error as a toast instead of a silent no-op', async () => {
    pinSessionAction.mockResolvedValue({
      ok: false,
      error: 'You can pin at most 5 sessions. Unpin one first.',
    });
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: 'One' })] });

    openMenuFor('One');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }));

    expect(
      await screen.findByText('You can pin at most 5 sessions. Unpin one first.'),
    ).toBeDefined();
  });

  it('renders no per-row pin icon — the Pinned/Recent grouping alone conveys pinned status', () => {
    renderSidebar({
      pinnedSessions: [session({ id: 'p-1', title: 'Pinned chat', pinnedAt: 5 })],
      recentSessions: [session({ id: 'r-1', title: 'Unpinned chat' })],
    });
    const pinnedRow = screen.getByRole('link', { name: 'Pinned chat' }).closest('div');
    const unpinnedRow = screen.getByRole('link', { name: 'Unpinned chat' }).closest('div');
    // Each row's only icon is its "⋯" options-menu trigger — no leading pin
    // icon on either, pinned or not. Both rows' labels start at the same x
    // position as a result, without needing a hidden-but-space-reserving
    // icon to keep them aligned.
    expect(pinnedRow?.querySelectorAll('svg').length).toBe(1);
    expect(unpinnedRow?.querySelectorAll('svg').length).toBe(1);
  });
});

describe('WardenSidebar — delete', () => {
  it('opens a confirm dialog naming the session before deleting anything', () => {
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: 'Doomed chat' })] });

    openMenuFor('Doomed chat');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(screen.getByRole('heading', { name: 'Delete session' })).toBeDefined();
    expect(screen.getByText('Doomed chat', { selector: 'strong' })).toBeDefined();
    expect(deleteSessionAction).not.toHaveBeenCalled();
  });

  it('deletes on confirm and navigates home when the active session was deleted', async () => {
    deleteSessionAction.mockResolvedValue({ ok: true, message: 'Session deleted.' });
    setUrlSession('r-1');
    renderSidebar({
      recentSessions: [session({ id: 'r-1', title: 'Doomed chat' })],
      orderedSessionIds: ['r-1'],
    });

    openMenuFor('Doomed chat');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteSessionAction).toHaveBeenCalledWith('r-1'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/warden'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('deletes on confirm and refreshes (no navigation) when a non-active session was deleted', async () => {
    deleteSessionAction.mockResolvedValue({ ok: true, message: 'Session deleted.' });
    setUrlSession('r-2');
    renderSidebar({
      recentSessions: [session({ id: 'r-1', title: 'Doomed chat' })],
      orderedSessionIds: ['r-2', 'r-1'],
    });

    openMenuFor('Doomed chat');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteSessionAction).toHaveBeenCalledWith('r-1'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the dialog reachable for retry and shows a toast when delete fails', async () => {
    deleteSessionAction.mockResolvedValue({ ok: false, error: 'Could not delete this session.' });
    renderSidebar({ recentSessions: [session({ id: 'r-1', title: 'Doomed chat' })] });

    openMenuFor('Doomed chat');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Could not delete this session.')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });
});
