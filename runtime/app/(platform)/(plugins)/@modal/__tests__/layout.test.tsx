// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ModalSlotLayout from '../layout';

// jsdom has no matchMedia implementation — Dialog (rendered by
// ModalSlotLayout whenever the slot is open) calls it via
// usePrefersReducedMotion. Mirrors packages/ui's Dialog.test.tsx own helper.
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

const back = vi.fn();
const useSelectedLayoutSegment = vi.fn<() => string | null>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back }),
  useSelectedLayoutSegment: () => useSelectedLayoutSegment(),
}));

const getInstalledPlugins = vi.fn();
vi.mock('@/src/registry', () => ({
  getInstalledPlugins: () => getInstalledPlugins(),
}));

describe('ModalSlotLayout', () => {
  beforeEach(installMatchMedia);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    cleanup();
  });

  it('renders only children, no Dialog, when the slot has no active segment', () => {
    useSelectedLayoutSegment.mockReturnValue(null);
    getInstalledPlugins.mockReturnValue([]);
    render(<ModalSlotLayout>passthrough</ModalSlotLayout>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('passthrough')).toBeTruthy();
  });

  it('renders only children when the slot shows its __DEFAULT__ fallback', () => {
    useSelectedLayoutSegment.mockReturnValue('__DEFAULT__');
    getInstalledPlugins.mockReturnValue([]);
    render(<ModalSlotLayout>passthrough</ModalSlotLayout>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("uses the matched plugin's name as the Dialog's accessible name", () => {
    useSelectedLayoutSegment.mockReturnValue('(.)console');
    getInstalledPlugins.mockReturnValue([
      { id: 'fs.sovereign.console', name: 'Console', routePrefix: '/console', shell: 'overlay' },
    ]);
    render(<ModalSlotLayout>console content</ModalSlotLayout>);
    expect(screen.getByRole('dialog', { name: 'Console' })).toBeTruthy();
    expect(screen.getByText('console content')).toBeTruthy();
  });

  // The regression this file exists to cover (9.37): a routePrefix mismatch
  // on the intercepted segment means `plugins.find(...)` misses, so `title`
  // is undefined too — without an explicit fallback, the panel would render
  // with no accessible name at all.
  it('falls back to a generic accessible name when no plugin matches the intercepted segment', () => {
    useSelectedLayoutSegment.mockReturnValue('(.)unknown-segment');
    getInstalledPlugins.mockReturnValue([
      { id: 'fs.sovereign.console', name: 'Console', routePrefix: '/console', shell: 'overlay' },
    ]);
    render(<ModalSlotLayout>content</ModalSlotLayout>);
    expect(screen.getByRole('dialog', { name: 'Dialog' })).toBeTruthy();
  });

  it('falls back to a generic accessible name when no plugins are installed at all', () => {
    useSelectedLayoutSegment.mockReturnValue('(.)console');
    getInstalledPlugins.mockReturnValue([]);
    render(<ModalSlotLayout>content</ModalSlotLayout>);
    expect(screen.getByRole('dialog', { name: 'Dialog' })).toBeTruthy();
  });
});
