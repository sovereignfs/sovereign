// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders the heading', () => {
    render(<EmptyState heading="No lists yet" />);
    expect(screen.getByText('No lists yet')).toBeDefined();
  });

  it('renders the description when provided', () => {
    render(
      <EmptyState heading="No lists yet" description="Create your first list to get started." />,
    );
    expect(screen.getByText('Create your first list to get started.')).toBeDefined();
  });

  it('renders no description paragraph when omitted', () => {
    const { container } = render(<EmptyState heading="No lists yet" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders the icon when provided', () => {
    const { container } = render(<EmptyState heading="No lists yet" icon="package" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the action slot', () => {
    render(<EmptyState heading="No lists yet" action={<button>Create list</button>} />);
    expect(screen.getByRole('button', { name: 'Create list' })).toBeDefined();
  });
});
