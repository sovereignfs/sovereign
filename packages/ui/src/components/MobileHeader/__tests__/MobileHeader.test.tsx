// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MobileHeader } from '../MobileHeader';

afterEach(() => {
  cleanup();
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
