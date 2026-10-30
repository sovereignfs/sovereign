// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  it('has a heading, and nothing else when nothing else is given', () => {
    const { container } = render(<EmptyState heading="No apps yet" />);
    expect(screen.getByRole('heading', { name: 'No apps yet' }).tagName).toBe('H2');
    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('adds a description, an icon that is hidden from assistive technology, and an action', () => {
    const { container } = render(
      <EmptyState
        heading="No apps yet"
        description="Add one to get started."
        icon="layout-grid"
        action={<button>Add an app</button>}
        className="mine"
      />,
    );
    expect(screen.getByText('Add one to get started.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add an app' })).toBeDefined();
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect((container.firstChild as HTMLElement).className).toContain('mine');
  });
});
