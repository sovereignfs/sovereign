// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders and forwards native props', () => {
    render(<Input placeholder="Email" defaultValue="a@b.c" />);
    const input = screen.getByPlaceholderText('Email') as HTMLInputElement;
    expect(input.value).toBe('a@b.c');
  });

  it('defaults to type="text"', () => {
    render(<Input aria-label="field" />);
    expect((screen.getByLabelText('field') as HTMLInputElement).type).toBe('text');
  });

  it('honours an explicit type', () => {
    render(<Input aria-label="pw" type="password" />);
    expect((screen.getByLabelText('pw') as HTMLInputElement).type).toBe('password');
  });
});
