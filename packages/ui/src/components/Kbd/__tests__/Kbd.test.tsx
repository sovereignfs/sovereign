// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Kbd } from '../Kbd';

afterEach(cleanup);

describe('Kbd', () => {
  it('renders a real <kbd> element', () => {
    render(<Kbd>⌘K</Kbd>);
    const el = screen.getByText('⌘K');
    expect(el.tagName).toBe('KBD');
  });
});
