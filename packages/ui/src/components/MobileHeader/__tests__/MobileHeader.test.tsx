// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MobileHeader } from '../MobileHeader';

afterEach(() => {
  cleanup();
});

describe('MobileHeader self-measured height', () => {
  afterEach(() => {
    document.getElementById('sv-app-shell')?.remove();
    vi.restoreAllMocks();
  });

  it('publishes its rendered height as --sv-shell-header-height on #sv-app-shell', () => {
    const shell = document.createElement('div');
    shell.id = 'sv-app-shell';
    document.body.appendChild(shell);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 60,
      width: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect);

    render(<MobileHeader bell={<span />} avatarMenu={<span />} />);

    expect(shell.style.getPropertyValue('--sv-shell-header-height')).toBe('60px');
  });

  it('removes the override on unmount', () => {
    const shell = document.createElement('div');
    shell.id = 'sv-app-shell';
    document.body.appendChild(shell);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 60,
      width: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect);

    const { unmount } = render(<MobileHeader bell={<span />} avatarMenu={<span />} />);
    expect(shell.style.getPropertyValue('--sv-shell-header-height')).toBe('60px');

    unmount();
    expect(shell.style.getPropertyValue('--sv-shell-header-height')).toBe('');
  });

  it('never throws when #sv-app-shell is absent (Storybook, unit tests, other hosts)', () => {
    expect(() => render(<MobileHeader bell={<span />} avatarMenu={<span />} />)).not.toThrow();
  });
});

describe('MobileHeader', () => {
  it('always renders the logo, bell, and avatar menu slots', () => {
    render(
      <MobileHeader
        logo={<a href="/">logo</a>}
        bell={<span data-testid="bell">bell</span>}
        avatarMenu={<span data-testid="avatar">avatar</span>}
      />,
    );

    expect(screen.getByText('logo')).toBeDefined();
    expect(screen.getByTestId('bell')).toBeDefined();
    expect(screen.getByTestId('avatar')).toBeDefined();
  });

  it('renders no title by default', () => {
    render(<MobileHeader logo={<a href="/">logo</a>} bell={<span />} avatarMenu={<span />} />);

    expect(screen.queryByText(/tasks/i)).toBeNull();
  });

  it('renders the optional title when provided', () => {
    render(
      <MobileHeader
        logo={<a href="/">logo</a>}
        title="Tasks"
        bell={<span />}
        avatarMenu={<span />}
      />,
    );

    expect(screen.getByText('Tasks')).toBeDefined();
  });

  it('renders a default "S" badge when logo is omitted', () => {
    render(<MobileHeader bell={<span />} avatarMenu={<span />} />);

    expect(screen.getByText('S')).toBeDefined();
  });

  it('renders the supplied logo instead of the default badge when provided', () => {
    render(
      <MobileHeader logo={<a href="/">custom logo</a>} bell={<span />} avatarMenu={<span />} />,
    );

    expect(screen.getByText('custom logo')).toBeDefined();
    expect(screen.queryByText('S')).toBeNull();
  });
});
