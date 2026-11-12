// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateRangePicker } from '../DateRangePicker';
import { RangeCalendar } from '../RangeCalendar';
import { formatDateLabel } from '../../Calendar/dateUtils';

let mobile = false;
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
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
beforeEach(() => {
  mobile = false;
  installMatchMedia();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const day = (y: number, m: number, d: number) =>
  screen.getByRole('button', { name: formatDateLabel(new Date(y, m - 1, d)) });
const MAY = { start: '2026-05-10', end: '2026-05-12' };

describe('DateRangePicker', () => {
  it('shows the placeholder, and then the two dates and the nights between', () => {
    const { rerender } = render(
      <DateRangePicker
        value={{ start: null, end: null }}
        onChange={() => {}}
        placeholder="Pick dates"
        aria-label="Stay"
      />,
    );
    expect(screen.getByRole('button', { name: 'Stay' }).textContent).toContain('Pick dates');
    rerender(<DateRangePicker value={MAY} onChange={() => {}} aria-label="Stay" />);
    const text = screen.getByRole('button', { name: 'Stay' }).textContent ?? '';
    expect(text).toContain('2 nights');
    expect(text).toContain('–');
    rerender(
      <DateRangePicker
        value={{ start: '2026-05-10', end: '2026-05-11' }}
        onChange={() => {}}
        aria-label="Stay"
      />,
    );
    expect(screen.getByRole('button', { name: 'Stay' }).textContent).toContain('1 night');
    // A value that is not a date is no value.
    rerender(
      <DateRangePicker
        value={{ start: '2026-02-30', end: '2026-03-02' }}
        onChange={() => {}}
        placeholder="Pick dates"
        aria-label="Stay"
      />,
    );
    expect(screen.getByRole('button', { name: 'Stay' }).textContent).toContain('Pick dates');
  });

  it('opens on the start’s month; the first pick starts a range and the second completes it, in YYYY-MM-DD, and closes', () => {
    const onChange = vi.fn();
    render(<DateRangePicker value={MAY} onChange={onChange} aria-label="Stay" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    fireEvent.click(day(2026, 5, 20));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Now choose the last day.');
    fireEvent.click(day(2026, 5, 23));
    expect(onChange).toHaveBeenCalledWith({ start: '2026-05-20', end: '2026-05-23' });
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('makes the earlier date the start when the second is before the first, and one day twice is a day with no nights', () => {
    const onChange = vi.fn();
    render(<DateRangePicker value={MAY} onChange={onChange} aria-label="Stay" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    fireEvent.click(day(2026, 5, 20));
    fireEvent.click(day(2026, 5, 15));
    expect(onChange).toHaveBeenLastCalledWith({ start: '2026-05-15', end: '2026-05-20' });
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    fireEvent.click(day(2026, 5, 4));
    fireEvent.click(day(2026, 5, 4));
    expect(onChange).toHaveBeenLastCalledWith({ start: '2026-05-04', end: '2026-05-04' });
  });

  it('disables the days outside min and max, and does not pick them', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        value={MAY}
        onChange={onChange}
        min="2026-05-08"
        max="2026-05-16"
        aria-label="Stay"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect((day(2026, 5, 7) as HTMLButtonElement).disabled).toBe(true);
    expect((day(2026, 5, 17) as HTMLButtonElement).disabled).toBe(true);
    expect((day(2026, 5, 8) as HTMLButtonElement).disabled).toBe(false);
    expect((day(2026, 5, 16) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(day(2026, 5, 7));
    fireEvent.click(day(2026, 5, 17));
    expect(screen.getByRole('status').textContent).toBe('2 nights');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works in a bottom sheet on a narrow screen', () => {
    mobile = true;
    installMatchMedia();
    const onChange = vi.fn();
    render(<DateRangePicker value={MAY} onChange={onChange} aria-label="Stay" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    fireEvent.click(day(2026, 5, 11));
    fireEvent.click(day(2026, 5, 13));
    expect(onChange).toHaveBeenCalledWith({ start: '2026-05-11', end: '2026-05-13' });
  });

  it('is not opened when disabled', () => {
    render(<DateRangePicker value={MAY} onChange={() => {}} disabled aria-label="Stay" />);
    expect((screen.getByRole('button', { name: 'Stay' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('RangeCalendar', () => {
  const range = { start: new Date(2026, 4, 10), end: new Date(2026, 4, 12) };

  it('marks the ends pressed and the days between selected, and says the nights', () => {
    render(<RangeCalendar value={range} onChange={() => {}} aria-label="Stay" />);
    expect(day(2026, 5, 10).getAttribute('aria-pressed')).toBe('true');
    expect(day(2026, 5, 12).getAttribute('aria-pressed')).toBe('true');
    expect(day(2026, 5, 11).getAttribute('aria-pressed')).toBe('false');
    expect(day(2026, 5, 11).closest('[role="gridcell"]')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(day(2026, 5, 13).closest('[role="gridcell"]')?.getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(screen.getByRole('status').textContent).toBe('2 nights');
  });

  it('is reached by the keyboard: arrows move, Enter picks the first and the last day, Escape drops a range being chosen', () => {
    const onChange = vi.fn();
    render(<RangeCalendar value={range} onChange={onChange} aria-label="Stay" />);
    const grid = screen.getByRole('grid');
    day(2026, 5, 10).focus();
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toBe('Now choose the last day.');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    // The range being chosen is shaded as focus moves: 10 to 19 is nine nights.
    expect(screen.getByRole('status').textContent).toBe('Now choose the last day.');
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(screen.getByRole('status').textContent).toBe('2 nights');
    fireEvent.keyDown(grid, { key: 'Enter' });
    fireEvent.keyDown(grid, { key: ' ' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const picked = onChange.mock.calls[0]?.[0] as { start: Date; end: Date };
    expect(picked.start).toEqual(picked.end);
  });

  it('moves between months by the buttons and PageUp and PageDown', () => {
    render(<RangeCalendar value={range} onChange={() => {}} aria-label="Stay" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain('June');
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    day(2026, 5, 10).focus();
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'PageDown' });
    expect(screen.getByRole('grid').getAttribute('aria-label')).toContain('June');
  });
});
