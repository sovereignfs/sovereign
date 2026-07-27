// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { RadioGroup } from '../RadioGroup';

afterEach(cleanup);

const items = [
  { label: 'Small', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
];

describe('RadioGroup', () => {
  it('renders all items as radio inputs', () => {
    render(<RadioGroup items={items} value="sm" onChange={() => {}} aria-label="Size" />);
    expect(screen.getAllByRole('radio').length).toBe(3);
  });

  it('marks the matching item as checked', () => {
    render(<RadioGroup items={items} value="md" onChange={() => {}} aria-label="Size" />);
    expect(screen.getByRole('radio', { name: 'Medium' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: 'Small' })).toHaveProperty('checked', false);
  });

  it('calls onChange with the selected value', () => {
    const onChange = vi.fn();
    render(<RadioGroup items={items} value="sm" onChange={onChange} aria-label="Size" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
    expect(onChange).toHaveBeenCalledWith('lg');
  });

  it('exposes a radiogroup with the given aria-label', () => {
    render(<RadioGroup items={items} value="sm" onChange={() => {}} aria-label="Size" />);
    expect(screen.getByRole('radiogroup', { name: 'Size' })).toBeDefined();
  });

  it('shares one name across all items so native radio semantics apply', () => {
    render(
      <RadioGroup items={items} value="sm" onChange={() => {}} aria-label="Size" name="size" />,
    );
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
  });

  it('disables an individual item via items[].disabled', () => {
    const withDisabled = [...items, { label: 'X-Large', value: 'xl', disabled: true }];
    render(<RadioGroup items={withDisabled} value="sm" onChange={() => {}} aria-label="Size" />);
    expect(screen.getByRole('radio', { name: 'X-Large' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('radio', { name: 'Small' })).toHaveProperty('disabled', false);
  });

  it('disables every item when the group-level disabled prop is set', () => {
    render(<RadioGroup items={items} value="sm" onChange={() => {}} aria-label="Size" disabled />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveProperty('disabled', true);
    }
  });
});
