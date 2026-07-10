// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Calendar } from '../Calendar';

// A fixed reference date so tests are deterministic regardless of when they run.
const JAN_15_2026 = new Date(2026, 0, 15); // Thursday

describe('Calendar', () => {
  afterEach(cleanup);

  it('renders the displayed month and year', () => {
    render(<Calendar value={JAN_15_2026} onChange={() => {}} />);
    expect(screen.getByText('January 2026')).toBeTruthy();
  });

  it('marks the selected date', () => {
    render(<Calendar value={JAN_15_2026} onChange={() => {}} />);
    const button = screen.getByRole('button', { name: /Thursday, January 15, 2026/ });
    // aria-selected lives on the gridcell (the button's parent), not the
    // button itself — the button role doesn't support aria-selected.
    expect(button.parentElement?.getAttribute('aria-selected')).toBe('true');
  });

  it('calls onChange with the clicked date', () => {
    const onChange = vi.fn();
    render(<Calendar value={JAN_15_2026} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /January 20, 2026/ }));
    expect(onChange).toHaveBeenCalledOnce();
    const called = onChange.mock.calls[0]?.[0] as Date;
    expect(called.getDate()).toBe(20);
    expect(called.getMonth()).toBe(0);
    expect(called.getFullYear()).toBe(2026);
  });

  it('navigates to the next and previous month', () => {
    render(<Calendar value={JAN_15_2026} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('February 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('December 2025')).toBeTruthy();
  });

  it('disables and does not select dates outside minDate/maxDate', () => {
    const onChange = vi.fn();
    render(
      <Calendar
        value={JAN_15_2026}
        onChange={onChange}
        minDate={new Date(2026, 0, 10)}
        maxDate={new Date(2026, 0, 20)}
      />,
    );
    const outOfRange = screen.getByRole('button', { name: /January 5, 2026/ });
    expect(outOfRange.hasAttribute('disabled')).toBe(true);
    fireEvent.click(outOfRange);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes exactly one roving tabIndex=0 day at a time', () => {
    render(<Calendar value={JAN_15_2026} onChange={() => {}} />);
    const zeroTabIndex = document.querySelectorAll('[role="gridcell"] button[tabindex="0"]');
    expect(zeroTabIndex.length).toBe(1);
    expect(zeroTabIndex[0]?.getAttribute('aria-label')).toMatch(/January 15, 2026/);
  });

  it('moves the roving tabIndex with ArrowRight and selects with Enter', () => {
    const onChange = vi.fn();
    render(<Calendar value={JAN_15_2026} onChange={onChange} />);
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    const zeroTabIndex = document.querySelector('[role="gridcell"] button[tabindex="0"]');
    expect(zeroTabIndex?.getAttribute('aria-label')).toMatch(/January 16, 2026/);
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledOnce();
    const called = onChange.mock.calls[0]?.[0] as Date;
    expect(called.getDate()).toBe(16);
  });

  it('PageDown advances the focused date and displayed month by one month', () => {
    render(<Calendar value={JAN_15_2026} onChange={() => {}} />);
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'PageDown' });
    expect(screen.getByText('February 2026')).toBeTruthy();
  });

  it('marks today distinctly from an ordinary day', () => {
    const today = new Date();
    render(<Calendar value={null} onChange={() => {}} />);
    const todayLabel = screen.getByRole('button', {
      name: new RegExp(
        `${today.toLocaleDateString(undefined, { month: 'long' })} ${today.getDate()}, ${today.getFullYear()}`,
      ),
    });
    expect(todayLabel.getAttribute('aria-current')).toBe('date');
  });
});
