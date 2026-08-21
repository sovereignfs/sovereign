// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';

afterEach(cleanup);

describe('StatusBadge', () => {
  it('renders the default label for a status', () => {
    render(<StatusBadge status="draft" />);
    expect(screen.getByText('Draft')).toBeDefined();
  });

  it('renders custom children instead of the default label', () => {
    render(<StatusBadge status="draft">Unsaved</StatusBadge>);
    expect(screen.getByText('Unsaved')).toBeDefined();
    expect(screen.queryByText('Draft')).toBeNull();
  });

  it('applies the status-specific class', () => {
    const { container } = render(<StatusBadge status="conflict" />);
    expect(container.querySelector('span')?.className).toContain('error');
  });

  it('applies the success class for the synced status', () => {
    const { container } = render(<StatusBadge status="synced" />);
    expect(container.querySelector('span')?.className).toContain('success');
  });

  it('forwards an explicit aria-label', () => {
    render(
      <StatusBadge status="warning" aria-label="Pending review">
        !
      </StatusBadge>,
    );
    expect(screen.getByLabelText('Pending review')).toBeDefined();
  });
});
