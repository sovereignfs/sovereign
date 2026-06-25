// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Owner</Badge>);
    expect(screen.getByText('Owner')).toBeDefined();
  });

  it('defaults to role variant', () => {
    render(<Badge>Admin</Badge>);
    expect(screen.getByText('Admin').closest('span')?.className).toContain('role');
  });

  it('applies mono variant class', () => {
    render(<Badge variant="mono">platform</Badge>);
    expect(screen.getByText('platform').closest('span')?.className).toContain('mono');
  });

  it('renders status variant with a dot element', () => {
    const { container } = render(
      <Badge variant="status" status="active">
        Active
      </Badge>,
    );
    const dots = container.querySelectorAll('[aria-hidden]');
    expect(dots.length).toBe(1);
    expect(dots.item(0).className).toContain('dotGreen');
  });

  it('uses red dot for deactivated status', () => {
    const { container } = render(
      <Badge variant="status" status="deactivated">
        Deactivated
      </Badge>,
    );
    expect(container.querySelector('[aria-hidden]')?.className).toContain('dotRed');
  });

  it('uses amber dot for invited status', () => {
    const { container } = render(
      <Badge variant="status" status="invited">
        Invited
      </Badge>,
    );
    expect(container.querySelector('[aria-hidden]')?.className).toContain('dotAmber');
  });

  it('uses grey dot for neutral status', () => {
    const { container } = render(
      <Badge variant="status" status="neutral">
        Neutral
      </Badge>,
    );
    expect(container.querySelector('[aria-hidden]')?.className).toContain('dotGrey');
  });

  it('does not render a dot for role variant', () => {
    const { container } = render(<Badge variant="role">Owner</Badge>);
    expect(container.querySelectorAll('[aria-hidden]').length).toBe(0);
  });
});
