// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

afterEach(cleanup);
import { SegmentedControl } from '../SegmentedControl';

const options = [
  { label: 'User', value: 'user' as const },
  { label: 'Admin', value: 'admin' as const },
  { label: 'Owner', value: 'owner' as const },
];

describe('SegmentedControl', () => {
  it('renders all options as radio buttons', () => {
    render(
      <SegmentedControl value="user" onChange={() => {}} options={options} aria-label="Role" />,
    );
    expect(screen.getAllByRole('radio').length).toBe(3);
  });

  it('marks the active option as checked', () => {
    render(
      <SegmentedControl value="admin" onChange={() => {}} options={options} aria-label="Role" />,
    );
    expect(screen.getByRole('radio', { name: 'Admin' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'User' }).getAttribute('aria-checked')).toBe('false');
  });

  it('calls onChange with the selected value on click', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl value="user" onChange={onChange} options={options} aria-label="Role" />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Admin' }));
    expect(onChange).toHaveBeenCalledWith('admin');
  });

  it('exposes a radiogroup with the given aria-label', () => {
    render(
      <SegmentedControl
        value="user"
        onChange={() => {}}
        options={options}
        aria-label="Select role"
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Select role' })).toBeDefined();
  });

  it('applies size class to the track', () => {
    const { container } = render(
      <SegmentedControl
        value="user"
        onChange={() => {}}
        options={options}
        size="sm"
        aria-label="Role"
      />,
    );
    expect((container.firstChild as HTMLElement).className).toContain('sm');
  });
});
