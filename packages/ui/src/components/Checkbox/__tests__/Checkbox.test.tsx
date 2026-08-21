// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Checkbox } from '../Checkbox';

afterEach(cleanup);

describe('Checkbox', () => {
  it('renders the label associated with the input', () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Accept terms" />);
    expect(screen.getByLabelText('Accept terms')).toBeDefined();
  });

  it('reflects the checked prop', () => {
    render(<Checkbox checked label="Accept terms" onChange={() => {}} />);
    expect((screen.getByLabelText('Accept terms') as HTMLInputElement).checked).toBe(true);
  });

  it('calls onChange with the new checked value', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Accept terms" />);
    fireEvent.click(screen.getByLabelText('Accept terms'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders no label element when label is empty', () => {
    const { container } = render(
      <Checkbox checked={false} onChange={() => {}} label="" aria-label="Select row" />,
    );
    expect(container.querySelector('label')).toBeNull();
    expect(screen.getByRole('checkbox')).toBeDefined();
  });

  it('applies the disabled attribute', () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Accept terms" disabled />);
    expect((screen.getByLabelText('Accept terms') as HTMLInputElement).disabled).toBe(true);
  });

  it('applies the struck class to the label when checked with strikeThrough', () => {
    render(<Checkbox checked onChange={() => {}} label="Buy milk" strikeThrough />);
    expect(screen.getByText('Buy milk').className).toContain('struck');
  });
});
