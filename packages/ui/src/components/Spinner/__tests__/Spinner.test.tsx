// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Spinner } from '../Spinner';

afterEach(cleanup);

describe('Spinner', () => {
  it('is a status named Loading… at the medium size', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status', { name: 'Loading…' });
    expect(spinner.className).toContain('md');
  });

  it('can be named for what is loading', () => {
    render(<Spinner label="Saving your changes" />);
    expect(screen.getByRole('status', { name: 'Saving your changes' })).toBeDefined();
  });

  it('takes each size and the caller’s class', () => {
    render(<Spinner size="sm" className="mine" />);
    const spinner = screen.getByRole('status');
    expect(spinner.className).toContain('sm');
    expect(spinner.className).toContain('mine');
    cleanup();
    render(<Spinner size="lg" />);
    expect(screen.getByRole('status').className).toContain('lg');
  });
});
