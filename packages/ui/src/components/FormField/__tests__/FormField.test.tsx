// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FormField } from '../FormField';

afterEach(cleanup);

describe('FormField', () => {
  it('associates the label with the control via htmlFor/id', () => {
    render(
      <FormField label="Email" id="email">
        {(field) => <input {...field} />}
      </FormField>,
    );
    expect(screen.getByLabelText('Email')).toBeDefined();
  });

  it('generates an id when none is provided', () => {
    render(<FormField label="Email">{(field) => <input {...field} />}</FormField>);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.id).toBeTruthy();
  });

  it('wires the hint to the control via aria-describedby', () => {
    render(
      <FormField label="Username" hint="Letters and numbers only." id="username">
        {(field) => <input {...field} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Username');
    const hint = screen.getByText('Letters and numbers only.');
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('wires the error to the control via aria-describedby and marks it invalid', () => {
    render(
      <FormField label="Password" error="Too short." id="password">
        {(field) => <input {...field} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Password');
    const error = screen.getByText('Too short.');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('renders the error with role="alert"', () => {
    render(
      <FormField label="Password" error="Too short." id="password">
        {(field) => <input {...field} />}
      </FormField>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Too short.');
  });

  it('hides the hint when an error is present', () => {
    render(
      <FormField label="Password" hint="At least 8 characters." error="Too short." id="password">
        {(field) => <input {...field} />}
      </FormField>,
    );
    expect(screen.queryByText('At least 8 characters.')).toBeNull();
  });

  it('shows a required indicator and sets required on the control', () => {
    render(
      <FormField label="Full name" required id="name">
        {(field) => <input {...field} />}
      </FormField>,
    );
    const input = screen.getByLabelText(/Full name/) as HTMLInputElement;
    expect(input.required).toBe(true);
  });

  it('does not set aria-describedby when there is no hint or error', () => {
    render(
      <FormField label="Nickname" id="nickname">
        {(field) => <input {...field} />}
      </FormField>,
    );
    expect(screen.getByLabelText('Nickname').hasAttribute('aria-describedby')).toBe(false);
  });
});
