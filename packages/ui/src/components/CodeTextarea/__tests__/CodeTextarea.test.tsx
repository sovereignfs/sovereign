// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CodeTextarea } from '../CodeTextarea';

afterEach(cleanup);

describe('CodeTextarea', () => {
  it('renders a textarea', () => {
    render(<CodeTextarea aria-label="Config" />);
    expect(screen.getByRole('textbox', { name: 'Config' })).toBeDefined();
  });

  it('defaults to 12 rows', () => {
    render(<CodeTextarea aria-label="Config" />);
    expect(screen.getByRole('textbox', { name: 'Config' }).getAttribute('rows')).toBe('12');
  });

  it('defaults spellCheck to false', () => {
    render(<CodeTextarea aria-label="Config" />);
    expect(screen.getByRole('textbox', { name: 'Config' }).getAttribute('spellcheck')).toBe(
      'false',
    );
  });

  it('defaults wrap to off', () => {
    render(<CodeTextarea aria-label="Config" />);
    expect(screen.getByRole('textbox', { name: 'Config' }).getAttribute('wrap')).toBe('off');
  });

  it('sets aria-invalid when invalid', () => {
    render(<CodeTextarea aria-label="Config" invalid />);
    expect(screen.getByRole('textbox', { name: 'Config' }).getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  it('calls onChange when edited', () => {
    const onChange = vi.fn();
    render(<CodeTextarea aria-label="Config" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Config' }), {
      target: { value: '{}' },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it('forwards native textarea props', () => {
    render(<CodeTextarea aria-label="Config" rows={4} />);
    expect(screen.getByRole('textbox', { name: 'Config' }).getAttribute('rows')).toBe('4');
  });
});
