// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Marker } from '../Marker';

afterEach(cleanup);

describe('Marker', () => {
  it('renders as a static span with an accessible label when no onClick is given', () => {
    render(<Marker index={1} label="Source: Notes" />);
    const el = screen.getByLabelText('Source: Notes');
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('1');
  });

  it('renders as a button and fires onClick when given', () => {
    const onClick = vi.fn();
    render(<Marker index={2} label="Source: Tasks" onClick={onClick} />);
    const el = screen.getByRole('button', { name: 'Source: Tasks' });
    el.click();
    expect(onClick).toHaveBeenCalled();
  });
});
