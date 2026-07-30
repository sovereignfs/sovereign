// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageContainer } from '../PageContainer';

afterEach(cleanup);

describe('PageContainer', () => {
  it('renders its children', () => {
    render(<PageContainer>content</PageContainer>);
    expect(screen.getByText('content')).toBeDefined();
  });

  it('defaults to md max-width', () => {
    render(<PageContainer>content</PageContainer>);
    expect(screen.getByText('content').className).toContain('md');
  });

  it('applies sm, lg, and full max-width classes', () => {
    const { rerender } = render(<PageContainer maxWidth="sm">content</PageContainer>);
    expect(screen.getByText('content').className).toContain('sm');
    rerender(<PageContainer maxWidth="lg">content</PageContainer>);
    expect(screen.getByText('content').className).toContain('lg');
    rerender(<PageContainer maxWidth="full">content</PageContainer>);
    expect(screen.getByText('content').className).toContain('full');
  });

  it('forwards className and other div props', () => {
    render(
      <PageContainer className="custom" data-testid="container">
        content
      </PageContainer>,
    );
    const el = screen.getByTestId('container');
    expect(el.className).toContain('custom');
  });
});
