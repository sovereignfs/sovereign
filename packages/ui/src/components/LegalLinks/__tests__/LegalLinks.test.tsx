// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LegalLinks } from '../LegalLinks';

afterEach(cleanup);

describe('LegalLinks', () => {
  it('renders default privacy and tos links', () => {
    render(<LegalLinks />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe(
      '/tos',
    );
  });

  it('uses custom hrefs when provided', () => {
    render(<LegalLinks privacyHref="/legal/privacy" tosHref="/legal/tos" />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/legal/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe(
      '/legal/tos',
    );
  });

  it('uses renderLink when provided instead of a plain anchor', () => {
    render(
      <LegalLinks
        renderLink={(href, label) => (
          <a href={href} data-custom="true">
            {label}
          </a>
        )}
      />,
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('data-custom')).toBe(
      'true',
    );
  });
});
