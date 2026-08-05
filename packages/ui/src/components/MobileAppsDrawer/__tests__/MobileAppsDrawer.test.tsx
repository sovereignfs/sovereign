// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MobileAppsDrawer } from '../MobileAppsDrawer';

// Drawer's exit animation reads prefers-reduced-motion via matchMedia, which
// jsdom does not implement — see Drawer's own test for the full rationale.
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
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
}

const items = [
  { key: 'home', icon: <span>icon</span>, label: 'Home', href: '/home' },
  { key: 'notes', icon: <span>icon</span>, label: 'Notes', onClick: vi.fn() },
];

describe('MobileAppsDrawer', () => {
  beforeEach(() => {
    installMatchMedia();
    installPointerCapture();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders nothing when closed', () => {
    render(
      <MobileAppsDrawer open={false} onClose={() => {}} aria-label="Sections" items={items} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders every item when open, with no header title or close button', () => {
    render(<MobileAppsDrawer open onClose={() => {}} aria-label="Sections" items={items} />);

    expect(screen.getByRole('dialog', { name: 'Sections' })).toBeDefined();
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Notes')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('renders an href item as a link and an onClick item as a button', () => {
    render(<MobileAppsDrawer open onClose={() => {}} aria-label="Sections" items={items} />);

    const link = screen.getByText('Home').closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/home');

    const button = screen.getByText('Notes').closest('button');
    expect(button).not.toBeNull();
  });

  it('calls the item onClick handler when pressed', () => {
    render(<MobileAppsDrawer open onClose={() => {}} aria-label="Sections" items={items} />);

    fireEvent.click(screen.getByText('Notes'));
    expect(items[1]?.onClick).toHaveBeenCalledTimes(1);
  });
});
