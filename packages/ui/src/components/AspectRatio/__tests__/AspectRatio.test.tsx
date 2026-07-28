// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AspectRatio } from '../AspectRatio';

afterEach(cleanup);

describe('AspectRatio', () => {
  it('applies the ratio as inline CSS aspect-ratio', () => {
    render(
      <AspectRatio ratio={16 / 9}>
        <img src="/x.png" alt="Preview" />
      </AspectRatio>,
    );
    const root = screen.getByRole('img').parentElement;
    expect(root?.style.aspectRatio).toContain(String(16 / 9));
  });

  it('renders children', () => {
    render(
      <AspectRatio ratio={1}>
        <div>content</div>
      </AspectRatio>,
    );
    expect(screen.getByText('content')).toBeDefined();
  });
});
