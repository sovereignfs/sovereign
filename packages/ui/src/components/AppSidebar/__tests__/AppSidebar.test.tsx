// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { AppSidebar, type AppSidebarBlock } from '../AppSidebar';
import { useAppSidebar } from '../useAppSidebar';

function installMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const newList = vi.fn();

const blocks: AppSidebarBlock[] = [
  {
    id: 'places',
    items: [
      { id: 'home', label: 'Home', icon: 'house', href: '/', active: true },
      { id: 'cards', label: 'Cards', icon: 'wallet-cards', href: '/cards' },
    ],
  },
  {
    id: 'mine',
    heading: 'My lists',
    items: [
      {
        id: 'a',
        label: 'Groceries',
        icon: 'shopping-cart',
        iconColor: '#1d4ed8',
        count: 4,
        href: '/l/a',
      },
      { id: 'b', label: 'Hardware', href: '/l/b', description: 'Sam’s' },
    ],
    action: { label: 'New list', onClick: newList },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
});

describe('AppSidebar', () => {
  it('draws its blocks, headings, rows, counts and the trailing action, marking the current row', () => {
    render(<AppSidebar blocks={blocks} state="full" aria-label="Shopper" />);
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('title')).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Shopper' });
    expect(within(nav).getByRole('heading', { name: 'My lists' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).getByRole('link', { name: /Groceries/ }).textContent).toContain('4');
    expect(within(nav).getByText('Sam’s')).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'New list' })).toBeTruthy();
  });

  it('colours only the icon', () => {
    render(<AppSidebar blocks={blocks} state="full" aria-label="Shopper" />);
    const link = screen.getByRole('link', { name: /Groceries/ });
    const coloured = link.querySelector('[style]') as HTMLElement;
    expect(coloured.style.color).toBe('rgb(29, 78, 216)');
    expect(coloured.querySelector('svg')).toBeTruthy();
    expect(link.getAttribute('style')).toBeNull();
  });

  it('on a rail, names each row by its label and shows a letter for a row with no icon', () => {
    render(<AppSidebar blocks={blocks} state="rail" aria-label="Shopper" />);
    expect(screen.getByRole('link', { name: 'Hardware' }).textContent).toContain('H');
    expect(screen.getByRole('link', { name: 'Groceries' }).getAttribute('title')).toBe('Groceries');
  });

  it('draws nothing when hidden', () => {
    const { container } = render(
      <AppSidebar blocks={blocks} state="hidden" aria-label="Shopper" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('calls the action, tells the app a row was followed, and uses its links', () => {
    const onNavigate = vi.fn();
    render(
      <AppSidebar
        blocks={blocks}
        state="full"
        aria-label="Shopper"
        onNavigate={onNavigate}
        renderLink={(_item, props) => (
          <a data-app-link href={props.href} className={props.className} onClick={props.onClick}>
            {props.children}
          </a>
        )}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'New list' }));
    expect(newList).toHaveBeenCalled();
    const cards = screen.getByRole('link', { name: 'Cards' });
    expect(cards.hasAttribute('data-app-link')).toBe(true);
    fireEvent.click(cards);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('has the rail button only when given, named for what it does', () => {
    const onToggleRail = vi.fn();
    const { rerender } = render(<AppSidebar blocks={blocks} state="full" aria-label="Shopper" />);
    expect(screen.queryByRole('button', { name: 'Narrow the sidebar' })).toBeNull();
    rerender(
      <AppSidebar blocks={blocks} state="full" aria-label="Shopper" onToggleRail={onToggleRail} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Narrow the sidebar' }));
    expect(onToggleRail).toHaveBeenCalled();
    rerender(
      <AppSidebar blocks={blocks} state="rail" aria-label="Shopper" onToggleRail={onToggleRail} />,
    );
    expect(screen.getByRole('button', { name: 'Widen the sidebar' })).toBeTruthy();
  });
});

describe('useAppSidebar', () => {
  beforeEach(() => installMatchMedia(false));

  it('starts at the default and keeps a choice per app and per kind of page', () => {
    const { result, unmount } = renderHook(() => useAppSidebar('shopper', 'page'));
    expect(result.current.state).toBe('full');
    act(() => result.current.toggleRail());
    expect(result.current.state).toBe('rail');
    act(() => result.current.toggleHidden());
    expect(result.current.state).toBe('hidden');
    unmount();

    expect(JSON.parse(window.localStorage.getItem('sv.sidebar.shopper') ?? '{}')).toEqual({
      page: { state: 'hidden', shown: 'rail' },
    });
    // Read back on the next page view, after the first paint.
    const again = renderHook(() => useAppSidebar('shopper', 'page'));
    expect(again.result.current.state).toBe('hidden');
    again.unmount();
    expect(renderHook(() => useAppSidebar('shopper', 'home')).result.current.state).toBe('full');
    expect(renderHook(() => useAppSidebar('tusk', 'page')).result.current.state).toBe('full');
  });

  it('is never shown on a phone', () => {
    installMatchMedia(true);
    window.localStorage.setItem('sv.sidebar.shopper', '{"page":{"state":"full","shown":"full"}}');
    const { result } = renderHook(() => useAppSidebar('shopper', 'page'));
    expect(result.current.state).toBe('hidden');
    expect(result.current.available).toBe(false);
  });
});
