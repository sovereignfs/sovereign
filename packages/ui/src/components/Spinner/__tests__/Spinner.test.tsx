// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Spinner } from '../Spinner';

afterEach(cleanup);

describe('Spinner', () => {
  it('renders with role="status"', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('defaults the accessible label to "Loading…"', () => {
    render(<Spinner />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Loading…');
  });

  it('uses a custom label when provided', () => {
    render(<Spinner label="Saving…" />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Saving…');
  });

  it('applies the size class', () => {
    render(<Spinner size="lg" />);
    expect(screen.getByRole('status').className).toContain('lg');
  });

  it('defaults to the md size class', () => {
    render(<Spinner />);
    expect(screen.getByRole('status').className).toContain('md');
  });
});
