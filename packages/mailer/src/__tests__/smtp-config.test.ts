import { describe, expect, it } from 'vitest';
import { describeSmtpProblem, resolveSmtp } from '../smtp-config';

const complete = { host: 'smtp.example.com', from: 'Sovereign <no-reply@example.com>' };

describe('resolveSmtp', () => {
  it('is not configured when nothing is set: email is simply off', () => {
    expect(resolveSmtp({})).toEqual({
      state: 'not-configured',
      reasons: ['no SMTP server is set'],
    });
    expect(resolveSmtp({ host: '  ', from: '' })).toMatchObject({ state: 'not-configured' });
  });

  it('is configured with a host and a from address, on the submission port by default', () => {
    expect(resolveSmtp(complete)).toEqual({
      state: 'configured',
      settings: { host: 'smtp.example.com', port: 587, from: 'Sovereign <no-reply@example.com>' },
    });
  });

  it('keeps the port, user and password it is given, and trims them', () => {
    expect(
      resolveSmtp({
        ...complete,
        host: ' smtp.example.com ',
        port: 465,
        user: ' me ',
        password: 'pw',
      }),
    ).toEqual({
      state: 'configured',
      settings: {
        host: 'smtp.example.com',
        port: 465,
        user: 'me',
        password: 'pw',
        from: 'Sovereign <no-reply@example.com>',
      },
    });
  });

  it.each([
    [{ host: 'smtp.example.com' }, ['the "from" address is missing']],
    [{ from: 'a@example.com' }, ['the SMTP server (host) is missing']],
    [{ port: 25 }, ['the SMTP server (host) is missing', 'the "from" address is missing']],
    [{ ...complete, from: 'nope' }, ['the "from" address is not a valid email address']],
    [{ ...complete, user: 'me' }, ['the SMTP user and password must be set together']],
    [{ ...complete, password: 'pw' }, ['the SMTP user and password must be set together']],
    [
      { ...complete, user: 'me', passwordUnreadable: true },
      ['the saved SMTP password cannot be decrypted; enter it again'],
    ],
    [
      { ...complete, passwordUnreadable: true },
      ['the saved SMTP password cannot be decrypted; enter it again'],
    ],
  ])('is incomplete, and says what is wrong: %j', (input, reasons) => {
    expect(resolveSmtp(input)).toEqual({ state: 'incomplete', reasons });
  });

  it('calls a half-set configuration incomplete, not not-configured', () => {
    expect(resolveSmtp({ user: 'me' }).state).toBe('incomplete');
  });
});

describe('describeSmtpProblem', () => {
  it('names the variables and the Console, so the operator knows what to do', () => {
    const status = resolveSmtp({ host: 'smtp.example.com' });
    if (status.state === 'configured') throw new Error('expected a problem');
    const text = describeSmtpProblem(status);
    expect(text).toContain('Email is not set up: the "from" address is missing.');
    expect(text).toContain('SV_SMTP_HOST');
    expect(text).toContain('SV_SMTP_FROM');
    expect(text).toContain('Console');
  });
});
