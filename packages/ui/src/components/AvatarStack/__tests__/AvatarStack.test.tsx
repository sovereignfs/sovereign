// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AvatarStack } from '../AvatarStack';

afterEach(cleanup);

const people = [
  { name: 'Ada Lovelace' },
  { name: 'Grace Hopper' },
  { name: 'Sam Rivera' },
  { name: 'Noor Khan' },
  { name: 'Leila Haddad' },
  { name: 'Tomás Silva' },
];

describe('AvatarStack', () => {
  it('is one image, named for everyone in it', () => {
    render(<AvatarStack people={people.slice(0, 3)} />);
    expect(
      screen.getByRole('img', { name: 'Ada Lovelace, Grace Hopper and Sam Rivera' }),
    ).toBeTruthy();
  });

  it('says what the stack is before the names, when it is told', () => {
    render(<AvatarStack people={people.slice(0, 2)} label="Going" />);
    expect(screen.getByRole('img', { name: 'Going: Ada Lovelace and Grace Hopper' })).toBeTruthy();
  });

  it('names a single person, and renders nothing for nobody', () => {
    const { container, rerender } = render(<AvatarStack people={people.slice(0, 1)} />);
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toBeTruthy();
    rerender(<AvatarStack people={[]} />);
    expect(container.textContent).toBe('');
    expect(container.firstChild).toBeNull();
  });

  it('shows "+N" for the people beyond the limit, and still names every one', () => {
    const { container } = render(<AvatarStack people={people} max={3} />);
    expect(container.textContent).toContain('+3');
    expect(container.textContent).toContain('AL');
    expect(container.textContent).not.toContain('NK');
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    for (const person of people) expect(label).toContain(person.name);
  });

  it('shows everyone when the count would replace only one avatar', () => {
    const { container } = render(<AvatarStack people={people.slice(0, 4)} max={3} />);
    expect(container.textContent).not.toContain('+');
    expect(container.textContent).toContain('NK');
  });

  it('hides the drawn avatars and the count from assistive technology', () => {
    const { container } = render(<AvatarStack people={people} max={2} />);
    const items = container.querySelectorAll('[aria-hidden="true"]');
    expect(items.length).toBe(3);
  });

  it('takes the size and the caller’s class', () => {
    render(<AvatarStack people={people.slice(0, 2)} size="sm" className="mine" />);
    const stack = screen.getByRole('img');
    expect(stack.className).toContain('sm');
    expect(stack.className).toContain('mine');
  });
});
