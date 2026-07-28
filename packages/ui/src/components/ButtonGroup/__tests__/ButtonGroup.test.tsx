// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ButtonGroup } from '../ButtonGroup';

afterEach(cleanup);

describe('ButtonGroup', () => {
  it('exposes a group role with the given aria-label', () => {
    render(
      <ButtonGroup aria-label="View">
        <button type="button">Day</button>
        <button type="button">Week</button>
      </ButtonGroup>,
    );
    expect(screen.getByRole('group', { name: 'View' })).toBeDefined();
  });

  it('renders every child button', () => {
    render(
      <ButtonGroup aria-label="View">
        <button type="button">Day</button>
        <button type="button">Week</button>
        <button type="button">Month</button>
      </ButtonGroup>,
    );
    expect(screen.getAllByRole('button').length).toBe(3);
  });
});
