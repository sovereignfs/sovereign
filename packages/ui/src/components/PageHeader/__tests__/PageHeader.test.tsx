// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

afterEach(cleanup);

describe('PageHeader', () => {
  it('renders the title as an h1 by default', () => {
    render(<PageHeader title="Settings" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeDefined();
  });

  it('renders the title at the given heading level', () => {
    render(<PageHeader title="Settings" headingLevel={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Settings' })).toBeDefined();
  });

  it('renders the description when provided', () => {
    render(<PageHeader title="Settings" description="Manage your account preferences." />);
    expect(screen.getByText('Manage your account preferences.')).toBeDefined();
  });

  it('renders no description when omitted', () => {
    const { container } = render(<PageHeader title="Settings" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders the action slot', () => {
    render(<PageHeader title="Settings" action={<button>Save</button>} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });
});
