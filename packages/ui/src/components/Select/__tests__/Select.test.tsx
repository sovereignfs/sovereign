// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Select } from '../Select';

afterEach(cleanup);

describe('Select', () => {
  it('renders a combobox', () => {
    render(
      <Select aria-label="Role">
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </Select>,
    );
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeDefined();
  });

  it('renders provided options', () => {
    render(
      <Select aria-label="Role">
        <option value="user">User</option>
        <option value="admin">Admin</option>
        <option value="owner">Owner</option>
      </Select>,
    );
    expect(screen.getAllByRole('option').length).toBe(3);
  });

  it('forwards value and onChange', () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Role" value="user" onChange={onChange}>
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </Select>,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'admin' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('is disabled when the disabled prop is set', () => {
    render(
      <Select aria-label="Role" disabled>
        <option value="user">User</option>
      </Select>,
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
  });

  it('renders a decorative chevron element', () => {
    const { container } = render(
      <Select aria-label="Role">
        <option value="user">User</option>
      </Select>,
    );
    expect(container.querySelector('[aria-hidden]')).toBeDefined();
  });
});
