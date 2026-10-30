// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Avatar } from '../Avatar';

afterEach(cleanup);

describe('Avatar', () => {
  it('shows the initials of a first and last name', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByLabelText('Ada Lovelace').textContent).toBe('AL');
  });

  it('uses the first and last words of a longer name, and two letters of a single one', () => {
    render(<Avatar name="Augusta Ada King Lovelace" />);
    expect(screen.getByLabelText('Augusta Ada King Lovelace').textContent).toBe('AL');
    cleanup();
    const { container } = render(<Avatar name="  grace  " />);
    expect(container.textContent).toBe('GR');
  });

  it('shows the picture, named for the person, when there is one', () => {
    render(<Avatar name="Ada Lovelace" src="/ada.png" />);
    const img = screen.getByRole('img', { name: 'Ada Lovelace' });
    expect(img.getAttribute('src')).toBe('/ada.png');
  });

  it('falls back to the initials when the picture does not load', () => {
    render(<Avatar name="Ada Lovelace" src="/gone.png" />);
    fireEvent.error(screen.getByRole('img', { name: 'Ada Lovelace' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByLabelText('Ada Lovelace').textContent).toBe('AL');
  });

  it('applies the size and the caller’s class', () => {
    render(<Avatar name="Ada Lovelace" size="lg" className="mine" />);
    const avatar = screen.getByLabelText('Ada Lovelace');
    expect(avatar.className).toContain('lg');
    expect(avatar.className).toContain('mine');
  });
});
