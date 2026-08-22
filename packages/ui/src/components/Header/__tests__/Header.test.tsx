// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Header } from '../Header';

afterEach(() => {
  cleanup();
});

describe('Header', () => {
  it('always renders the brand badge, launcher, notifications, and avatar menu slots', () => {
    render(
      <Header
        instanceName="Sovereign"
        homeHref="/launcher"
        launcher={<span data-testid="launcher">launcher</span>}
        notifications={<span data-testid="bell">bell</span>}
        avatarMenu={<span data-testid="avatar">avatar</span>}
      />,
    );

    expect(screen.getByText('S')).toBeDefined();
    expect(screen.getByTestId('launcher')).toBeDefined();
    expect(screen.getByTestId('bell')).toBeDefined();
    expect(screen.getByTestId('avatar')).toBeDefined();
  });

  it('derives the brand badge initial from instanceName, uppercased', () => {
    render(
      <Header
        instanceName="acme"
        homeHref="/launcher"
        launcher={<span />}
        notifications={<span />}
        avatarMenu={<span />}
      />,
    );

    expect(screen.getByText('A')).toBeDefined();
  });

  it('links the brand badge to homeHref', () => {
    render(
      <Header
        instanceName="Sovereign"
        homeHref="/launcher"
        launcher={<span />}
        notifications={<span />}
        avatarMenu={<span />}
      />,
    );

    expect(screen.getByRole('link', { name: 'Sovereign home' })).toHaveProperty(
      'href',
      expect.stringContaining('/launcher'),
    );
  });

  it('renders no plugin by default', () => {
    render(
      <Header
        instanceName="Sovereign"
        homeHref="/launcher"
        launcher={<span />}
        notifications={<span />}
        avatarMenu={<span />}
      />,
    );

    expect(screen.queryByText('Notes')).toBeNull();
  });

  it('renders the active plugin as a link when href is provided', () => {
    render(
      <Header
        instanceName="Sovereign"
        homeHref="/launcher"
        plugin={{ name: 'Notes', icon: <span>icon</span>, href: '/notes' }}
        launcher={<span />}
        notifications={<span />}
        avatarMenu={<span />}
      />,
    );

    const link = screen.getByRole('link', { name: /Notes/ });
    expect(link).toHaveProperty('href', expect.stringContaining('/notes'));
  });

  it('renders the active plugin as plain text when href is omitted', () => {
    render(
      <Header
        instanceName="Sovereign"
        homeHref="/launcher"
        plugin={{ name: 'Notes' }}
        launcher={<span />}
        notifications={<span />}
        avatarMenu={<span />}
      />,
    );

    expect(screen.getByText('Notes')).toBeDefined();
    expect(screen.queryByRole('link', { name: /Notes/ })).toBeNull();
  });
});
