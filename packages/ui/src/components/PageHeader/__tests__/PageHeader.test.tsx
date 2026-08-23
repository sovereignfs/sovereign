// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

let matches = false;

function installMatchMedia() {
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

describe('PageHeader', () => {
  beforeEach(() => {
    matches = false;
    installMatchMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('web: renders title, description, and action', () => {
    render(
      <PageHeader
        title="Users"
        description="Manage who has access to this instance."
        action={<button type="button">Invite user</button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Users' })).toBeDefined();
    expect(screen.getByText('Manage who has access to this instance.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Invite user' })).toBeDefined();
  });

  it('web: renders no back button even when onBack is given', () => {
    render(<PageHeader title="Users" onBack={() => undefined} />);

    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('mobile: renders no description, no back button, no menu button by default', () => {
    matches = true;
    installMatchMedia();

    render(<PageHeader title="Users" description="Manage who has access to this instance." />);

    expect(screen.getByRole('heading', { name: 'Users' })).toBeDefined();
    expect(screen.queryByText('Manage who has access to this instance.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  });

  it('mobile: renders a back button that calls onBack when given', () => {
    matches = true;
    installMatchMedia();
    const onBack = vi.fn();

    render(<PageHeader title="Users" onBack={onBack} />);

    const back = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('mobile: renders a menu button that calls onMenuClick when given', () => {
    matches = true;
    installMatchMedia();
    const onMenuClick = vi.fn();

    render(<PageHeader title="Users" onMenuClick={onMenuClick} />);

    const menu = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(menu);
    expect(onMenuClick).toHaveBeenCalledOnce();
  });

  it('web: renders no menu button even when onMenuClick is given', () => {
    render(<PageHeader title="Users" onMenuClick={() => undefined} />);

    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  });

  it('mobile: renders the same action content as web', () => {
    matches = true;
    installMatchMedia();

    render(<PageHeader title="Users" action={<button type="button">Invite user</button>} />);

    expect(screen.getByRole('button', { name: 'Invite user' })).toBeDefined();
  });
});
