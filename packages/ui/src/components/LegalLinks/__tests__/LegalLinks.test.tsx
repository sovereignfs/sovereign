// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LegalLinks } from '../LegalLinks';

afterEach(cleanup);

describe('LegalLinks', () => {
  it('links to the privacy policy and the terms at the usual addresses', () => {
    render(<LegalLinks />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe(
      '/tos',
    );
  });

  it('links where it is told to', () => {
    render(<LegalLinks privacyHref="/legal/privacy" tosHref="https://sovereign.local/terms" />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/legal/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe(
      'https://sovereign.local/terms',
    );
  });

  it('hides the separator from assistive technology', () => {
    const { container } = render(<LegalLinks />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('·');
  });

  it('lets the app draw the links, as a router’s link component', () => {
    render(
      <LegalLinks
        renderLink={(href, label) => (
          <a href={href} data-router="yes">
            {label}
          </a>
        )}
        className="mine"
      />,
    );
    const link = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(link.getAttribute('data-router')).toBe('yes');
    expect(link.parentElement?.className).toContain('mine');
  });
});
