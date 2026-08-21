// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Tooltip } from '../Tooltip';

afterEach(cleanup);

describe('Tooltip', () => {
  it('renders its children', () => {
    render(
      <Tooltip content="Delete this item">
        <button>Delete</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined();
  });

  it('renders the tooltip content with role="tooltip"', () => {
    render(
      <Tooltip content="Delete this item">
        <button>Delete</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip').textContent).toBe('Delete this item');
  });

  it('associates the trigger with the tooltip via aria-describedby', () => {
    render(
      <Tooltip content="Delete this item">
        <button>Delete</button>
      </Tooltip>,
    );
    const tooltip = screen.getByRole('tooltip');
    const describedBy = screen
      .getByRole('button', { name: 'Delete' })
      .closest('[aria-describedby]');
    expect(describedBy?.getAttribute('aria-describedby')).toBe(tooltip.id);
  });

  it('applies the side class', () => {
    render(
      <Tooltip content="Delete this item" side="right">
        <button>Delete</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip').className).toContain('right');
  });

  it('defaults to the top side class', () => {
    render(
      <Tooltip content="Delete this item">
        <button>Delete</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip').className).toContain('top');
  });
});
