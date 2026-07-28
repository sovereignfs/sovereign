// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Item } from '../Item';

afterEach(cleanup);

describe('Item', () => {
  it('renders as a plain row when no onClick is given', () => {
    render(<Item title="Notifications" description="Manage email and push alerts" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Notifications')).toBeDefined();
    expect(screen.getByText('Manage email and push alerts')).toBeDefined();
  });

  it('renders as a button and fires onClick when given', () => {
    const onClick = vi.fn();
    render(<Item title="Notifications" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders leading and trailing slots', () => {
    render(
      <Item
        title="Notifications"
        leading={<span data-testid="leading">icon</span>}
        trailing={<span data-testid="trailing">chevron</span>}
      />,
    );
    expect(screen.getByTestId('leading')).toBeDefined();
    expect(screen.getByTestId('trailing')).toBeDefined();
  });

  it('disables the button when disabled is set', () => {
    render(<Item title="Notifications" onClick={() => {}} disabled />);
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });
});
