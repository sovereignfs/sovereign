// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Progress } from '../Progress';

afterEach(cleanup);

describe('Progress', () => {
  it('exposes progressbar ARIA attributes for the given value', () => {
    render(<Progress value={40} label="Upload progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Upload progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('clamps a value above 100', () => {
    render(<Progress value={140} label="Upload progress" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('clamps a negative value to 0', () => {
    render(<Progress value={-10} label="Upload progress" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });

  it('renders without an accessible name when label is omitted', () => {
    render(<Progress value={40} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBeNull();
  });
});
