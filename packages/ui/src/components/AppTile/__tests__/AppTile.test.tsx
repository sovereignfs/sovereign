// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('opens another site in a new tab, tells it nothing of where it came from, and says so', () => {
    render(<AppTile icon={null} name="Drive" href="https://drive.proton.me" external />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toContain('(opens in a new tab)');
  });

  it('opens in the same tab unless it is external', () => {
    render(<AppTile icon={null} name="Notes" href="/launch" />);
    expect(screen.getByRole('link').getAttribute('target')).toBeNull();
    expect(screen.getByRole('link').textContent).not.toContain('new tab');
  });

  it('marks the tile monochrome when asked, so its picture is drawn in greys', () => {
    const { container, rerender } = render(<AppTile icon={null} name="Notes" monochrome />);
    expect(container.firstElementChild?.className).toContain('monochrome');
    rerender(<AppTile icon={null} name="Notes" />);
    expect(container.firstElementChild?.className).not.toContain('monochrome');
  });

  it('lets the consumer decide how the link opens, and the browser follows it unless told not to', () => {
    const decide = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<AppTile icon={null} name="Notes" href="/launch" onClick={decide} />);
    const followed = fireEvent.click(screen.getByRole('link'));
    expect(decide).toHaveBeenCalledOnce();
    expect(followed).toBe(false);
  });
});
