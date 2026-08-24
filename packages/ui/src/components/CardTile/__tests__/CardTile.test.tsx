// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

afterEach(cleanup);
import { CardTile, CardTileGrid, NewCardTile } from '../CardTile';

describe('CardTile', () => {
  it('renders the footer content', () => {
    render(<CardTile>Q4 Planning</CardTile>);
    expect(screen.getByText('Q4 Planning')).toBeDefined();
  });

  it('renders optional banner content', () => {
    render(<CardTile banner={<span>icon</span>}>Q4 Planning</CardTile>);
    expect(screen.getByText('icon')).toBeDefined();
  });

  it('applies bannerColor as an inline background-color', () => {
    const { container } = render(<CardTile bannerColor="#c7d8ff">Q4 Planning</CardTile>);
    const banner = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(banner.style.backgroundColor).toBe('rgb(199, 216, 255)');
  });

  it('hides the banner from assistive tech', () => {
    const { container } = render(<CardTile>Q4 Planning</CardTile>);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('CardTileGrid', () => {
  it('renders its children', () => {
    render(
      <CardTileGrid>
        <CardTile>One</CardTile>
        <CardTile>Two</CardTile>
      </CardTileGrid>,
    );
    expect(screen.getByText('One')).toBeDefined();
    expect(screen.getByText('Two')).toBeDefined();
  });
});

describe('NewCardTile', () => {
  it('renders the given label', () => {
    render(<NewCardTile label="New project" />);
    expect(screen.getByRole('button', { name: /New project/ })).toBeDefined();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<NewCardTile label="New project" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /New project/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
