// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Card } from '../Card';

afterEach(cleanup);

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>Content</Card>);
    expect(screen.getByText('Content')).toBeDefined();
  });

  it('renders as a div by default', () => {
    render(<Card data-testid="card">Content</Card>);
    expect(screen.getByTestId('card').tagName).toBe('DIV');
  });

  it('renders as the element given by `as`', () => {
    render(
      <Card as="article" data-testid="card">
        Content
      </Card>,
    );
    expect(screen.getByTestId('card').tagName).toBe('ARTICLE');
  });

  it('applies the padding class', () => {
    render(
      <Card padding="lg" data-testid="card">
        Content
      </Card>,
    );
    expect(screen.getByTestId('card').className).toContain('paddingLg');
  });

  it('defaults to md padding', () => {
    render(<Card data-testid="card">Content</Card>);
    expect(screen.getByTestId('card').className).toContain('paddingMd');
  });

  it('applies the interactive class when interactive', () => {
    render(
      <Card interactive data-testid="card">
        Content
      </Card>,
    );
    expect(screen.getByTestId('card').className).toContain('interactive');
  });

  it('forwards native HTML attributes', () => {
    render(
      <Card data-testid="card" aria-label="Summary">
        Content
      </Card>,
    );
    expect(screen.getByTestId('card').getAttribute('aria-label')).toBe('Summary');
  });
});
