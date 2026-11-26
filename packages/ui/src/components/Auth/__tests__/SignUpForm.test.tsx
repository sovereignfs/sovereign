// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillUnannounced } from '../../../__tests__/fill-unannounced';
import { SignUpForm } from '../SignUpForm';

afterEach(cleanup);

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('SignUpForm', () => {
  it('hands over what was typed, with the terms box', () => {
    const onSubmit = vi.fn();
    render(
      <SignUpForm
        appName="Acme"
        passwordHint="At least 8."
        terms={{ privacyHref: '/privacy', tosHref: '/tos' }}
        onSubmit={onSubmit}
        signInHref="/sign-in"
      />,
    );
    fill('Name', 'Ada');
    fill('Email', 'ada@acme.test');
    fill('Password', 'one');
    fill('Confirm password', 'one');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@acme.test',
      password: 'one',
      confirm: 'one',
      agreed: true,
    });
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('target')).toBe(
      '_blank',
    );
  });

  it('hands over what is in the boxes when they were filled without a word to the page, and leaves it there', () => {
    const onSubmit = vi.fn();
    const form = (pending: boolean) => (
      <SignUpForm
        appName="Acme"
        passwordHint=""
        pending={pending}
        onSubmit={onSubmit}
        signInHref="/sign-in"
      />
    );
    const { rerender } = render(form(false));
    const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
    fillUnannounced(box('Name'), 'Ada');
    fillUnannounced(box('Email'), 'ada@acme.test');
    fillUnannounced(box('Password'), 'one');
    fillUnannounced(box('Confirm password'), 'one');
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@acme.test',
      password: 'one',
      confirm: 'one',
      agreed: true,
    });
    rerender(form(true));
    rerender(form(false));
    expect(
      [box('Name'), box('Email'), box('Password'), box('Confirm password')].map((b) => b.value),
    ).toEqual(['Ada', 'ada@acme.test', 'one', 'one']);
  });

  it('keeps an invitation’s address, asks no terms of an app with none, and waits for the link once sent', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <SignUpForm
        appName="Acme"
        passwordHint=""
        invitedEmail="ada@acme.test"
        onSubmit={onSubmit}
        signInHref="/sign-in"
      />,
    );
    expect((screen.getByLabelText('Email') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText('Invited to join Acme')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.submit(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ email: 'ada@acme.test', agreed: true });
    rerender(
      <SignUpForm
        appName="Acme"
        passwordHint=""
        waitingFor="ada@acme.test"
        renderWaiting={() => <button type="button">Send again</button>}
        onSubmit={onSubmit}
        signInHref="/sign-in"
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'We have sent a link to ada@acme.test',
    );
    expect(screen.getByRole('button', { name: 'Send again' })).toBeTruthy();
  });
});
