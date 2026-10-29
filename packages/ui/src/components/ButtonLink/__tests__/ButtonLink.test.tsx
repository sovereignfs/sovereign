// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ButtonLink } from '../ButtonLink';

describe('ButtonLink', () => {
  it('is a link to its address, named by its children', () => {
    render(<ButtonLink href="/console/apps/new">Add an app</ButtonLink>);
    const link = screen.getByRole('link', { name: 'Add an app' });
    expect(link.getAttribute('href')).toBe('/console/apps/new');
  });

  it('wears the button classes for its variant and size, and its own', () => {
    render(
      <ButtonLink href="/x" variant="secondary" size="sm" className="mine">
        Go
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link.className).toContain('secondary');
    expect(link.className).toContain('sm');
    expect(link.className).toContain('mine');
  });

  it('makes its element with the one it is given, and hands it everything', () => {
    render(
      <ButtonLink
        href="/x"
        renderLink={(props) => (
          <a data-router="yes" {...props}>
            {props.children}
          </a>
        )}
        aria-label="Open x"
      >
        Go
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'Open x' });
    expect(link.getAttribute('data-router')).toBe('yes');
    expect(link.className).toContain('primary');
    expect(link.textContent).toBe('Go');
  });
});
