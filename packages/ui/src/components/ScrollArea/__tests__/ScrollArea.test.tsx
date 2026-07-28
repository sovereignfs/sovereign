// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScrollArea } from '../ScrollArea';

afterEach(cleanup);

describe('ScrollArea', () => {
  it('renders children', () => {
    render(
      <ScrollArea>
        <div>content</div>
      </ScrollArea>,
    );
    expect(screen.getByText('content')).toBeDefined();
  });

  it('applies maxHeight/maxWidth as inline styles when given', () => {
    render(
      <ScrollArea maxHeight={200} maxWidth="100%">
        <div data-testid="child">content</div>
      </ScrollArea>,
    );
    const root = screen.getByTestId('child').parentElement;
    expect(root?.style.maxHeight).toBe('200px');
    expect(root?.style.maxWidth).toBe('100%');
  });

  it('does not set maxHeight/maxWidth styles when omitted', () => {
    render(
      <ScrollArea>
        <div data-testid="child">content</div>
      </ScrollArea>,
    );
    const root = screen.getByTestId('child').parentElement;
    expect(root?.style.maxHeight).toBe('');
    expect(root?.style.maxWidth).toBe('');
  });
});
