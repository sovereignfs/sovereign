// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColorPicker } from '../ColorPicker';

afterEach(cleanup);

const SWATCHES = [
  { label: 'Sky', value: '#b5c9e8' },
  { label: 'Sage', value: '#c9e0c4' },
];

describe('ColorPicker', () => {
  it('renders a swatch button per entry', () => {
    render(<ColorPicker swatches={SWATCHES} value={null} onChange={() => {}} aria-label="Color" />);
    expect(screen.getByRole('radio', { name: 'Sky' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Sage' })).toBeTruthy();
  });

  it('marks the swatch matching value as checked', () => {
    render(
      <ColorPicker swatches={SWATCHES} value="#c9e0c4" onChange={() => {}} aria-label="Color" />,
    );
    expect(screen.getByRole('radio', { name: 'Sage' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Sky' }).getAttribute('aria-checked')).toBe('false');
  });

  it('matches swatches case-insensitively', () => {
    render(
      <ColorPicker swatches={SWATCHES} value="#C9E0C4" onChange={() => {}} aria-label="Color" />,
    );
    expect(screen.getByRole('radio', { name: 'Sage' }).getAttribute('aria-checked')).toBe('true');
  });

  it('calls onChange with the swatch value when clicked', () => {
    const onChange = vi.fn();
    render(<ColorPicker swatches={SWATCHES} value={null} onChange={onChange} aria-label="Color" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sky' }));
    expect(onChange).toHaveBeenCalledWith('#b5c9e8');
  });

  it('does not render a "no color" option by default', () => {
    render(<ColorPicker swatches={SWATCHES} value={null} onChange={() => {}} aria-label="Color" />);
    expect(screen.queryByRole('radio', { name: 'No color' })).toBeNull();
  });

  it('renders and wires up the "no color" option when allowNone is set', () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        swatches={SWATCHES}
        value="#b5c9e8"
        onChange={onChange}
        allowNone
        aria-label="Color"
      />,
    );
    const noneOption = screen.getByRole('radio', { name: 'No color' });
    expect(noneOption.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(noneOption);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('marks "no color" as checked when value is null', () => {
    render(
      <ColorPicker
        swatches={SWATCHES}
        value={null}
        onChange={() => {}}
        allowNone
        aria-label="Color"
      />,
    );
    expect(screen.getByRole('radio', { name: 'No color' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('renders the native color input trigger for custom colors', () => {
    render(<ColorPicker swatches={SWATCHES} value={null} onChange={() => {}} aria-label="Color" />);
    const custom = screen.getByLabelText('Custom color') as HTMLInputElement;
    expect(custom.type).toBe('color');
  });

  it('shows the custom value on the native input when it matches no swatch', () => {
    render(
      <ColorPicker swatches={SWATCHES} value="#7a3fd6" onChange={() => {}} aria-label="Color" />,
    );
    const custom = screen.getByLabelText('Custom color') as HTMLInputElement;
    expect(custom.value).toBe('#7a3fd6');
    // Neither curated swatch should read as checked once a custom color is active.
    expect(screen.getByRole('radio', { name: 'Sky' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: 'Sage' }).getAttribute('aria-checked')).toBe('false');
  });

  it('calls onChange with the picked value when the custom input changes', () => {
    const onChange = vi.fn();
    render(<ColorPicker swatches={SWATCHES} value={null} onChange={onChange} aria-label="Color" />);
    const custom = screen.getByLabelText('Custom color') as HTMLInputElement;
    fireEvent.change(custom, { target: { value: '#123456' } });
    expect(onChange).toHaveBeenCalledWith('#123456');
  });

  it('disables every swatch and the custom input when disabled', () => {
    render(
      <ColorPicker
        swatches={SWATCHES}
        value={null}
        onChange={() => {}}
        disabled
        aria-label="Color"
      />,
    );
    expect((screen.getByRole('radio', { name: 'Sky' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Custom color') as HTMLInputElement).disabled).toBe(true);
  });
});
