// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SettingsDialog, type SettingsGroup } from '../SettingsDialog';

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

const groups: SettingsGroup[] = [
  {
    id: 'you',
    sections: [
      { id: 'profile', label: 'Profile', icon: 'user', content: <p>Your name</p> },
      { id: 'security', label: 'Security', icon: 'shield', content: <p>Your password</p> },
    ],
  },
  {
    id: 'app',
    sections: [
      {
        id: 'data',
        label: 'Data',
        icon: 'download',
        content: <p>Your export</p>,
        href: '/settings/data',
      },
    ],
  },
];

describe('SettingsDialog', () => {
  beforeEach(installMatchMedia);
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('is a dialog named by its title, with the sections in a navigation of groups', () => {
    render(
      <SettingsDialog
        open
        onClose={() => {}}
        groups={groups}
        active="profile"
        onSelect={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const nav = within(dialog).getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getAllByRole('list')).toHaveLength(2);
    expect(within(nav).getByRole('button', { name: 'Profile' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(dialog).getByText('Your name')).toBeTruthy();
    expect(within(dialog).queryByText('Your password')).toBeNull();
  });

  it('shows the first section when none is chosen, and marks none as current', () => {
    render(
      <SettingsDialog open onClose={() => {}} groups={groups} active={null} onSelect={() => {}} />,
    );
    expect(screen.getByText('Your name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profile' }).getAttribute('aria-current')).toBeNull();
  });

  it('asks the app to show a section, and to go back to the sections', () => {
    const onSelect = vi.fn();
    render(
      <SettingsDialog
        open
        onClose={() => {}}
        groups={groups}
        active="profile"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Security' }));
    expect(onSelect).toHaveBeenLastCalledWith('security');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('renders a section with an address as a link, through renderLink when given', () => {
    const onSelect = vi.fn();
    const { unmount } = render(
      <SettingsDialog open onClose={() => {}} groups={groups} active="data" onSelect={onSelect} />,
    );
    const link = screen.getByRole('link', { name: 'Data' });
    expect(link.getAttribute('href')).toBe('/settings/data');
    fireEvent.click(link);
    expect(onSelect).toHaveBeenLastCalledWith('data');
    unmount();

    render(
      <SettingsDialog
        open
        onClose={() => {}}
        groups={groups}
        active="data"
        onSelect={onSelect}
        renderLink={(_section, props) => (
          <a
            data-app-link
            href={props.href}
            className={props.className}
            aria-current={props['aria-current']}
          >
            {props.children}
          </a>
        )}
      />,
    );
    expect(screen.getByRole('link', { name: 'Data' }).hasAttribute('data-app-link')).toBe(true);
  });

  it('filters the sections by label when search is on, and hides a group left empty', () => {
    render(
      <SettingsDialog
        open
        onClose={() => {}}
        groups={groups}
        active="profile"
        onSelect={() => {}}
        search
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
      target: { value: 'sec' },
    });
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getAllByRole('list')).toHaveLength(1);
    expect(within(nav).getByRole('button', { name: 'Security' })).toBeTruthy();
    expect(within(nav).queryByRole('button', { name: 'Profile' })).toBeNull();
  });

  it('has no search box unless asked for', () => {
    render(
      <SettingsDialog
        open
        onClose={() => {}}
        groups={groups}
        active="profile"
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('closes on its close button', () => {
    const onClose = vi.fn();
    render(
      <SettingsDialog
        open
        onClose={onClose}
        groups={groups}
        active="profile"
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
