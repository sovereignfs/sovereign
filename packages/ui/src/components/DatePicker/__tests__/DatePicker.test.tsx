// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatePicker } from '../DatePicker';

let mobile = false;
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      // useIsMobile's query is '(max-width: ...)'; Drawer's own
      // prefers-reduced-motion check defaults to false — see Menu's
      // identical test setup for why.
      matches: query.includes('max-width') ? mobile : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const JAN_15_2026 = new Date(2026, 0, 15);

describe('DatePicker', () => {
  beforeEach(() => {
    mobile = false;
    installMatchMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('shows the placeholder when no date is selected', () => {
    render(
      <DatePicker
        value={null}
        onChange={() => {}}
        placeholder="Pick a date"
        aria-label="Due date"
      />,
    );
    expect(screen.getByRole('button', { name: 'Due date' }).textContent).toContain('Pick a date');
  });

  it('shows the formatted value when a date is selected', () => {
    render(<DatePicker value={JAN_15_2026} onChange={() => {}} aria-label="Due date" />);
    expect(screen.getByRole('button', { name: 'Due date' }).textContent).toContain('Jan 15, 2026');
  });

  it('opens the calendar as a Popover on desktop', () => {
    render(<DatePicker value={null} onChange={() => {}} aria-label="Due date" />);
    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    const panel = screen.getByRole('dialog', { name: 'Due date' });
    expect(panel.getAttribute('aria-modal')).toBe('false');
    expect(screen.getByRole('grid')).toBeTruthy();
  });

  it('opens the calendar as a Drawer on mobile', () => {
    mobile = true;
    installMatchMedia();
    render(<DatePicker value={null} onChange={() => {}} aria-label="Due date" />);
    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    const panel = screen.getByRole('dialog', { name: 'Due date' });
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('grid')).toBeTruthy();
  });

  it('calls onChange and closes the picker when a date is selected', () => {
    const onChange = vi.fn();
    render(<DatePicker value={JAN_15_2026} onChange={onChange} aria-label="Due date" />);
    fireEvent.click(screen.getByRole('button', { name: 'Due date' }));
    fireEvent.click(screen.getByRole('button', { name: /January 20, 2026/ }));
    expect(onChange).toHaveBeenCalledOnce();
    const called = onChange.mock.calls[0]?.[0] as Date;
    expect(called.getDate()).toBe(20);
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('disables the trigger when disabled', () => {
    render(<DatePicker value={null} onChange={() => {}} aria-label="Due date" disabled />);
    expect((screen.getByRole('button', { name: 'Due date' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
