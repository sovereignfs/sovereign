// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Card } from '../Card';

afterEach(cleanup);

describe('Card', () => {
  it('renders its children in a div with medium padding by default', () => {
    render(<Card data-testid="card">Hello</Card>);
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card.textContent).toBe('Hello');
    expect(card.className).toContain('paddingMd');
    expect(card.className).not.toContain('interactive');
  });

  it('renders the element it is asked to', () => {
    render(
      <ul>
        <Card as="li" data-testid="card">
          Row
        </Card>
      </ul>,
    );
    expect(screen.getByTestId('card').tagName).toBe('LI');
    cleanup();
    render(
      <Card as="article" data-testid="card">
        Story
      </Card>,
    );
    expect(screen.getByTestId('card').tagName).toBe('ARTICLE');
  });

  it('applies the padding, the interactive style and the caller’s class', () => {
    render(
      <Card padding="lg" interactive className="mine" data-testid="card">
        x
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('paddingLg');
    expect(card.className).toContain('interactive');
    expect(card.className).toContain('mine');
  });

  it('passes native attributes through', () => {
    render(
      <Card aria-label="Summary" id="c1">
        x
      </Card>,
    );
    expect(screen.getByLabelText('Summary').id).toBe('c1');
  });
});
