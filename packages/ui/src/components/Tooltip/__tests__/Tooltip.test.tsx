// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Tooltip } from '../Tooltip';

afterEach(cleanup);

describe('Tooltip', () => {
  it('shows its content as a tooltip, tied to what it describes', () => {
    render(
      <Tooltip content="Copies the link">
        <button>Copy</button>
      </Tooltip>,
    );
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip.textContent).toBe('Copies the link');
    const describedBy = screen
      .getByRole('button', { name: 'Copy' })
      .parentElement?.getAttribute('aria-describedby');
    expect(describedBy).toBe(tip.id);
    expect(tip.id).not.toBe('');
  });

  it('is on top by default and takes each side', () => {
    render(
      <Tooltip content="Hint">
        <button>One</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip', { hidden: true }).className).toContain('top');
    for (const side of ['bottom', 'left', 'right'] as const) {
      cleanup();
      render(
        <Tooltip content="Hint" side={side}>
          <button>One</button>
        </Tooltip>,
      );
      expect(screen.getByRole('tooltip', { hidden: true }).className).toContain(side);
    }
  });

  it('gives two tooltips two ids', () => {
    render(
      <>
        <Tooltip content="A">
          <button>A</button>
        </Tooltip>
        <Tooltip content="B">
          <button>B</button>
        </Tooltip>
      </>,
    );
    const [a, b] = screen.getAllByRole('tooltip', { hidden: true });
    expect(a?.id).not.toBe(b?.id);
  });
});
