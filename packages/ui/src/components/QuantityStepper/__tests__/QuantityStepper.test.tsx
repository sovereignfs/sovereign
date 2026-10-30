// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuantityStepper } from '../QuantityStepper';

afterEach(cleanup);

const stepper = (props: Partial<Parameters<typeof QuantityStepper>[0]> = {}) => {
  const onChange = vi.fn();
  render(<QuantityStepper value={2} onChange={onChange} aria-label="Servings" {...props} />);
  return {
    onChange,
    input: screen.getByRole('spinbutton', { name: 'Servings' }) as HTMLInputElement,
    less: screen.getByRole('button', { name: 'Decrease Servings' }) as HTMLButtonElement,
    more: screen.getByRole('button', { name: 'Increase Servings' }) as HTMLButtonElement,
  };
};

describe('QuantityStepper', () => {
  it('shows the value and offers a button each way, named for what they change', () => {
    const { input } = stepper();
    expect(input.value).toBe('2');
  });

  it('steps by one unless told another step, and rounds away float noise', () => {
    const { onChange, less, more } = stepper();
    fireEvent.click(more);
    fireEvent.click(less);
    expect(onChange).toHaveBeenNthCalledWith(1, 3);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
    cleanup();
    const half = stepper({ value: 0.1, step: 0.2 });
    fireEvent.click(half.more);
    expect(half.onChange).toHaveBeenCalledWith(0.3);
  });

  it('stops at the limits: the button at a limit is disabled, and typing is clamped', () => {
    const atMin = stepper({ value: 0, min: 0 });
    expect(atMin.less.disabled).toBe(true);
    cleanup();
    const atMax = stepper({ value: 5, max: 5 });
    expect(atMax.more.disabled).toBe(true);
    cleanup();
    const typed = stepper({ min: 1, max: 10 });
    fireEvent.change(typed.input, { target: { value: '99' } });
    fireEvent.change(typed.input, { target: { value: '-4' } });
    expect(typed.onChange).toHaveBeenNthCalledWith(1, 10);
    expect(typed.onChange).toHaveBeenNthCalledWith(2, 1);
  });

  it('ignores text that is not a number', () => {
    const { input, onChange } = stepper();
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables everything when disabled', () => {
    const { input, less, more } = stepper({ disabled: true });
    expect(input.disabled).toBe(true);
    expect(less.disabled).toBe(true);
    expect(more.disabled).toBe(true);
  });

  it('shows the unit without reading it out twice, and takes the id and class it is given', () => {
    const { container } = render(
      <QuantityStepper
        value={1}
        onChange={() => {}}
        aria-label="Weight"
        unit="kg"
        id="w"
        className="mine"
      />,
    );
    expect(screen.getByText('kg').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('spinbutton').id).toBe('w');
    expect((container.firstChild as HTMLElement).className).toContain('mine');
  });
});
