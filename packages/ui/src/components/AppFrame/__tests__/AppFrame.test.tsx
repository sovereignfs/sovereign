// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppFrame } from '../AppFrame';
import type { AppSidebarBlock } from '../../AppSidebar/AppSidebar';

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

const blocks: AppSidebarBlock[] = [
  { id: 'places', items: [{ id: 'home', label: 'Home', icon: 'house', href: '/', active: true }] },
  {
    id: 'mine',
    heading: 'My lists',
    items: [{ id: 'a', label: 'Groceries', icon: 'shopping-cart', href: '/l/a' }],
  },
];

function frame(extra: Partial<Parameters<typeof AppFrame>[0]> = {}) {
  return (
    <AppFrame
      appId="shopper"
      name="Shopper"
      brand={<a href="/">shopper.</a>}
      pageKind="page"
      blocks={blocks}
      avatarMenu={<button type="button">Account</button>}
      footer={{
        leftIcons: [{ icon: <span />, label: 'Home', href: '/' }],
        rightIcons: [{ icon: <span />, label: 'Cards', href: '/cards' }],
        launcherLabel: 'Lists',
      }}
      {...extra}
    >
      <p>The page</p>
    </AppFrame>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
});

describe('AppFrame on a wide screen', () => {
  it('draws the header with the brand, the sidebar and the content, in the shell root', () => {
    installMatchMedia(false);
    const { container } = render(frame());
    expect(container.querySelector('#sv-app-shell')).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'shopper.' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Shopper' })).toBeTruthy();
    expect(screen.getByText('The page')).toBeTruthy();
    // No phone's footer beside the sidebar.
    expect(screen.queryByRole('button', { name: 'Lists' })).toBeNull();
  });

  it("hides the sidebar from the header's button and shows it again, kept on the device", () => {
    installMatchMedia(false);
    render(frame());
    fireEvent.click(screen.getByRole('button', { name: 'Hide the sidebar' }));
    expect(screen.queryByRole('navigation', { name: 'Shopper' })).toBeNull();
    expect(window.localStorage.getItem('sv.sidebar.shopper')).toContain('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Show the sidebar' }));
    expect(screen.getByRole('navigation', { name: 'Shopper' })).toBeTruthy();
  });

  it('draws the right column beside the content when given', () => {
    installMatchMedia(false);
    render(frame({ detail: <p>An item</p> }));
    expect(screen.getByRole('complementary').textContent).toBe('An item');
    expect(screen.getByText('The page')).toBeTruthy();
  });
});

describe('AppFrame on a phone', () => {
  it('draws the footer, no sidebar, and opens the same blocks in a drawer from the header and the middle button', async () => {
    installMatchMedia(true);
    render(frame());
    await act(async () => {});
    expect(screen.queryByRole('navigation', { name: 'Shopper' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the navigation' }));
    const drawer = await screen.findByRole('dialog', { name: 'Shopper' });
    expect(within(drawer).getByRole('link', { name: 'Groceries' }).getAttribute('href')).toBe(
      '/l/a',
    );
    fireEvent.click(within(drawer).getByRole('link', { name: 'Groceries' }));
    expect(screen.getByRole('button', { name: 'Lists' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lists' }));
    expect(screen.getByRole('button', { name: 'Lists' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('leaves the middle button to the app when it says what it opens', async () => {
    installMatchMedia(true);
    const onOpenApps = vi.fn();
    render(
      frame({
        footer: {
          leftIcons: [{ icon: <span />, label: 'Home', href: '/' }],
          rightIcons: [{ icon: <span />, label: 'Cards', href: '/cards' }],
          onOpenApps,
        },
      }),
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Apps' }));
    expect(onOpenApps).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
