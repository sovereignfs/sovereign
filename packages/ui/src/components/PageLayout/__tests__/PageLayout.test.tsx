// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageLayout } from '../PageLayout';

afterEach(cleanup);

describe('PageLayout', () => {
  it('renders children with no header by default', () => {
    render(<PageLayout>Content</PageLayout>);

    expect(screen.getByText('Content')).toBeDefined();
    expect(screen.queryByText('Header')).toBeNull();
  });

  it('renders a page-specific header when given', () => {
    render(<PageLayout header={<span>Header</span>}>Content</PageLayout>);

    expect(screen.getByText('Header')).toBeDefined();
    expect(screen.getByText('Content')).toBeDefined();
  });

  it('applies no padding by default', () => {
    render(<PageLayout>Content</PageLayout>);

    expect(screen.getByText('Content').className).toContain('padNone');
  });

  it('applies the requested padding step', () => {
    render(<PageLayout padding="lg">Content</PageLayout>);

    expect(screen.getByText('Content').className).toContain('padLg');
  });
});
