// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Input } from '../../Input/Input';
import { AuthCard } from '../AuthCard';
import { AuthCodeInput } from '../AuthCodeInput';
import { AuthField } from '../AuthField';
import { AuthError, AuthNotice } from '../AuthNotice';
import { AuthButton, AuthDivider, AuthForm } from '../AuthForm';
import { BrandBadge } from '../BrandBadge';

afterEach(cleanup);

describe('AuthCard', () => {
  it('shows the mark, the title, the lead and the legal links', () => {
    render(
      <AuthCard brand={<BrandBadge name="fjord" />} title="Sign in to Fjord" lead="Welcome back.">
        <p>body</p>
      </AuthCard>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign in to Fjord');
    expect(screen.getByText('Welcome back.')).toBeDefined();
    expect(screen.getByText('F')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeDefined();
  });

  it('leaves the legal links out when asked', () => {
    render(<AuthCard title="Sign in" legal={false} />);
    expect(screen.queryByRole('link', { name: 'Privacy Policy' })).toBeNull();
  });

  it('points the legal links where it is told to', () => {
    render(<AuthCard title="Sign in" legal={{ privacyHref: '/legal/privacy' }} />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/legal/privacy',
    );
  });
});

describe('BrandBadge', () => {
  it('is the first letter of the name, capitalised, and hidden from a screen reader', () => {
    const { container } = render(<BrandBadge name="  sovereign" />);
    expect(container.textContent).toBe('S');
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('BrandBadge mark', () => {
  it('shows the letters it is given, as they are, instead of the first letter of the name', () => {
    const { container } = render(<BrandBadge name="Fjord" mark="Fj" />);
    expect(container.textContent).toBe('Fj');
  });

  it('falls back to the first letter of the name when the mark is empty', () => {
    const { container } = render(<BrandBadge name="Fjord" mark=" " />);
    expect(container.textContent).toBe('F');
  });
});

describe('AuthField', () => {
  it('ties the label, the hint and the control together, with no asterisk', () => {
    render(
      <AuthField label="Password" hint="At least 12 characters.">
        {(control) => <Input {...control} />}
      </AuthField>,
    );
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('aria-describedby')).toBe(`${input.id}-hint`);
    expect(document.body.textContent).not.toContain('*');
  });

  it('says the error instead of the hint, and marks the control invalid', () => {
    render(
      <AuthField label="Email" hint="A hint." error="Enter a valid email address.">
        {(control) => <Input {...control} />}
      </AuthField>,
    );
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid email address.');
    expect(screen.queryByText('A hint.')).toBeNull();
  });

  it('shows what is put beside the label', () => {
    render(
      <AuthField label="Password" aside={<a href="/forgot-password">Forgot password?</a>}>
        {(control) => <Input {...control} />}
      </AuthField>,
    );
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeDefined();
  });
});

describe('AuthNotice and AuthError', () => {
  it('announce a notice politely and an error at once', () => {
    render(
      <>
        <AuthNotice>Signed out.</AuthNotice>
        <AuthError>Wrong password.</AuthError>
      </>,
    );
    expect(screen.getByRole('status').textContent).toBe('Signed out.');
    expect(screen.getByRole('alert').textContent).toBe('Wrong password.');
  });
});

describe('AuthForm, AuthButton and AuthDivider', () => {
  it('submits the form from a submit button', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <AuthForm onSubmit={onSubmit}>
        <AuthButton type="submit">Sign in</AuthButton>
      </AuthForm>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('does not submit a form from a button that is not a submit button', () => {
    const onSubmit = vi.fn();
    render(
      <AuthForm onSubmit={onSubmit}>
        <AuthButton>Sign in with a passkey</AuthButton>
      </AuthForm>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('hides the divider from assistive technology', () => {
    const { container } = render(<AuthDivider />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe('or');
  });
});

describe('AuthCodeInput', () => {
  function Harness({ onChange }: { onChange?: (value: string) => void }) {
    const [value, setValue] = useState('');
    return (
      <AuthCodeInput
        label="Authenticator code"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }
  const boxes = () => screen.getAllByRole('textbox') as HTMLInputElement[];

  it('has a box for each digit, in a group named by its label', () => {
    render(<Harness />);
    expect(boxes()).toHaveLength(6);
    expect(screen.getByRole('group', { name: 'Authenticator code' })).toBeDefined();
    expect(boxes()[0]?.autocomplete).toBe('one-time-code');
    expect(boxes()[1]?.autocomplete).toBe('off');
  });

  it('keeps one digit a box and moves on to the next', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(boxes()[0] as HTMLInputElement, { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith('4');
    expect(document.activeElement).toBe(boxes()[1]);
  });

  it('ignores what is not a digit', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(boxes()[0] as HTMLInputElement, { target: { value: 'x' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('fills every box from a pasted code, spaces and all', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.paste(boxes()[0] as HTMLInputElement, {
      clipboardData: { getData: () => '123 456' },
    });
    expect(onChange).toHaveBeenLastCalledWith('123456');
    expect(
      boxes()
        .map((box) => box.value)
        .join(''),
    ).toBe('123456');
  });

  it('selects a box when it is focused, so a digit typed over a full box replaces it', () => {
    render(<Harness />);
    const box = boxes()[0] as HTMLInputElement;
    fireEvent.change(box, { target: { value: '7' } });
    const select = vi.spyOn(box, 'select');
    fireEvent.focus(box);
    expect(select).toHaveBeenCalled();
  });

  it('goes back a box on backspace in an empty one', () => {
    render(<Harness />);
    boxes()[1]?.focus();
    fireEvent.keyDown(boxes()[1] as HTMLInputElement, { key: 'Backspace' });
    expect(document.activeElement).toBe(boxes()[0]);
  });
});
