// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UserMenu } from '../UserMenu';

afterEach(() => {
  cleanup();
});

const items = [
  { label: 'Account', icon: 'user' as const, href: '/account' },
  { label: 'Preferences', icon: 'sliders-horizontal' as const, href: '/account/preferences' },
  { label: 'Sign out', icon: 'log-out' as const, destructive: true, onSelect: vi.fn() },
];

describe('UserMenu', () => {
  it('renders a closed trigger by default, showing initials from name', () => {
    render(<UserMenu name="Jamie Doe" email="jamie@example.com" items={items} />);
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy();
    expect(screen.getByText('JD')).toBeTruthy();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('opens the panel on trigger click, showing name, email, and items', () => {
    render(<UserMenu name="Jamie Doe" email="jamie@example.com" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));

    expect(screen.getByText('Jamie Doe')).toBeTruthy();
    expect(screen.getByText('jamie@example.com')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Account/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Preferences/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Sign out/ })).toBeTruthy();
  });

  it('renders href items as links', () => {
    render(<UserMenu name="Jamie Doe" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    const accountLink = screen.getByRole('menuitem', { name: /Account/ });
    expect(accountLink.tagName).toBe('A');
    expect(accountLink.getAttribute('href')).toBe('/account');
  });

  it('closes and calls onSelect when a plain item is clicked', () => {
    const onSelect = vi.fn();
    render(
      <UserMenu name="Jamie Doe" items={[{ label: 'Sign out', icon: 'log-out', onSelect }]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('renders no user header block when neither name nor email is provided', () => {
    render(<UserMenu items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.queryByText('Jamie Doe')).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Account/ })).toBeTruthy();
  });

  it('falls back to email initials when name is omitted', () => {
    render(<UserMenu email="jamie@example.com" items={items} />);
    expect(screen.getByText('JA')).toBeTruthy();
  });

  it('defaults to the md (36px sidebar) trigger size', () => {
    render(<UserMenu name="Jamie Doe" items={items} />);
    const trigger = screen.getByRole('button', { name: 'Account' });
    expect(trigger.className).not.toMatch(/triggerSm/);
  });

  it('applies the sm (32px, Header top-bar) trigger size when requested', () => {
    render(<UserMenu name="Jamie Doe" items={items} size="sm" />);
    const trigger = screen.getByRole('button', { name: 'Account' });
    expect(trigger.className).toMatch(/triggerSm/);
  });
});
