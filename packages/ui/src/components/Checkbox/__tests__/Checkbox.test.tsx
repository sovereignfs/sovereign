// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Checkbox } from '../Checkbox';

afterEach(cleanup);

describe('Checkbox', () => {
  it('is a native checkbox named by its label', () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Remember me" />);
    const box = screen.getByRole('checkbox', { name: 'Remember me' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it('reports the new state to onChange when the box or the label is clicked', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Remember me" />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Remember me'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, true);
  });

  it('shows its state', () => {
    render(<Checkbox checked onChange={() => {}} label="Remember me" />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('strikes the label through only when asked to and checked', () => {
    const { rerender } = render(
      <Checkbox checked onChange={() => {}} label="Buy milk" strikeThrough />,
    );
    expect(screen.getByText('Buy milk').className).toContain('struck');
    rerender(<Checkbox checked={false} onChange={() => {}} label="Buy milk" strikeThrough />);
    expect(screen.getByText('Buy milk').className).not.toContain('struck');
    rerender(<Checkbox checked onChange={() => {}} label="Buy milk" />);
    expect(screen.getByText('Buy milk').className).not.toContain('struck');
  });

  it('is disabled and does not report a change', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Locked" disabled />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    // A browser does not activate a disabled control through its label either.
    fireEvent.click(screen.getByText('Locked'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Locked').className).toContain('disabled');
  });

  it('uses the id it is given, or one made from the label, and passes other attributes on', () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Two words" name="terms" />);
    const box = screen.getByRole('checkbox');
    expect(box.id).toBe('checkbox-two-words');
    expect(box.getAttribute('name')).toBe('terms');
    cleanup();
    render(<Checkbox checked={false} onChange={() => {}} label="Two words" id="mine" />);
    expect(screen.getByRole('checkbox').id).toBe('mine');
  });
});
