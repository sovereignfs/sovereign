// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AppTile } from '../AppTile';

afterEach(cleanup);

describe('AppTile', () => {
  it('shows the name, the description and the tags', () => {
    render(<AppTile icon={<i>pic</i>} name="Notes" description="Journal" tags={<b>journal</b>} />);
    expect(screen.getByText('Notes')).toBeDefined();
    expect(screen.getByText('Journal')).toBeDefined();
    expect(screen.getByText('journal')).toBeDefined();
  });

  it('is one link to the address when it has one, and a plain box when it has not', () => {
    const { container, rerender } = render(<AppTile icon={null} name="Notes" href="/launch" />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/launch');
    expect(screen.getByRole('link').textContent).toContain('Notes');
    rerender(<AppTile icon={null} name="Notes" />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('draws no divider or footer without tags, and hides the picture from assistive tech', () => {
    const { container } = render(<AppTile icon={<i>pic</i>} name="Notes" />);
    expect(container.querySelector('[class*="tags"]')).toBeNull();
    expect(screen.getByText('pic').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });
});
