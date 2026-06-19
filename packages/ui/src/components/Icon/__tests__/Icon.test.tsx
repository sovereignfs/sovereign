// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../Icon';

describe('Icon', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Icon name="house" aria-hidden />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('applies aria-hidden for decorative icons', () => {
    const { container } = render(<Icon name="house" aria-hidden />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies aria-label and role="img" for meaningful icons', () => {
    render(<Icon name="log-out" aria-label="Sign out" />);
    const svg = screen.getByRole('img', { name: 'Sign out' });
    expect(svg).toBeTruthy();
  });

  it('defaults to md size', () => {
    const { container } = render(<Icon name="settings" aria-hidden />);
    const svg = container.querySelector('svg');
    // SVG className is an SVGAnimatedString in the DOM — use getAttribute('class').
    // CSS Modules are identity-mapped in the test environment, so 'md' is literal.
    expect(svg?.getAttribute('class')).toContain('md');
  });

  it('applies the requested size class', () => {
    const { container } = render(<Icon name="settings" size="lg" aria-hidden />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('lg');
  });

  it('merges an additional className', () => {
    const { container } = render(<Icon name="x" aria-hidden className="my-class" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('my-class');
  });
});
