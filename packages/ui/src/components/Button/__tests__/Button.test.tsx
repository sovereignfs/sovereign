// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeDefined();
  });

  it('applies the variant and size classes', () => {
    render(
      <Button variant="ghost" size="sm">
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.className).toContain('ghost');
    expect(button.className).toContain('sm');
  });

  it('defaults to type="button"', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button');
  });

  it('forwards native button props', () => {
    render(<Button disabled>Nope</Button>);
    expect((screen.getByRole('button', { name: 'Nope' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('applies destructive variant class', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('destructive');
  });

  it('disables the button and sets aria-busy when loading', () => {
    render(<Button loading>Submit</Button>);
    const button = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('does not set aria-busy when not loading', () => {
    render(<Button>Continue</Button>);
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-busy')).toBeNull();
  });

  it('respects an explicit disabled prop independent of loading', () => {
    render(<Button disabled>Archive</Button>);
    const button = screen.getByRole('button', { name: 'Archive' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBeNull();
  });
});
