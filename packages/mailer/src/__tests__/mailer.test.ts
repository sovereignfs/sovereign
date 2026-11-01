import { describe, expect, it } from 'vitest';
import { isMailError, MailError } from '../errors';
import { createMailer, createUnavailableMailer } from '../mailer';
import { createMemoryTransport } from '../memory';

const FROM = 'Sovereign <no-reply@sovereign.local>';

describe('a mailer over the memory transport', () => {
  it('delivers a message and lets a test read it back', async () => {
    const transport = createMemoryTransport();
    const mailer = createMailer(transport, { from: FROM });
    const result = await mailer.send({
      to: 'person@sovereign.local',
      subject: 'Welcome',
      text: 'Hello',
      html: '<p>Hello</p>',
    });

    expect(result).toEqual({ accepted: ['person@sovereign.local'], rejected: [] });
    expect(transport.sent).toHaveLength(1);
    expect(transport.last).toEqual({
      from: FROM,
      to: ['person@sovereign.local'],
      subject: 'Welcome',
      text: 'Hello',
      html: '<p>Hello</p>',
    });
  });

  it('keeps messages in order, and can be cleared', async () => {
    const transport = createMemoryTransport();
    const mailer = createMailer(transport, { from: FROM });
    await mailer.send({ to: 'a@sovereign.local', subject: 'One', text: 'x' });
    await mailer.send({ to: 'b@sovereign.local', subject: 'Two', text: 'x' });
    expect(transport.sent.map((m) => m.subject)).toEqual(['One', 'Two']);
    transport.clear();
    expect(transport.sent).toEqual([]);
    expect(transport.last).toBeUndefined();
  });

  it('never sends a message that is invalid, and says why', async () => {
    const transport = createMemoryTransport();
    const mailer = createMailer(transport, { from: FROM });
    await expect(mailer.send({ to: 'nope', subject: 'x', text: 'x' })).rejects.toMatchObject({
      code: 'invalid-message',
    });
    expect(transport.sent).toEqual([]);
  });

  it('turns a failure of the transport into a MailError without its own text', async () => {
    const transport = createMemoryTransport();
    transport.failNextWith(new Error('connect ECONNREFUSED 10.0.0.5:587 for user hunter2'));
    const mailer = createMailer(transport, { from: FROM });
    const error = await mailer
      .send({ to: 'a@sovereign.local', subject: 'x', text: 'x' })
      .catch((e: unknown) => e);
    expect(isMailError(error)).toBe(true);
    expect((error as MailError).code).toBe('send-failed');
    expect((error as MailError).message).not.toContain('hunter2');
    expect((error as MailError).message).not.toContain('10.0.0.5');
  });

  it('passes a MailError from the transport on unchanged', async () => {
    const transport = createMemoryTransport();
    const failure = new MailError(
      'authentication-failed',
      'The mail server refused the SMTP user name or password.',
      535,
    );
    transport.failNextWith(failure);
    const mailer = createMailer(transport, { from: FROM });
    await expect(mailer.send({ to: 'a@sovereign.local', subject: 'x', text: 'x' })).rejects.toBe(
      failure,
    );
  });

  it('fails the next send once only', async () => {
    const transport = createMemoryTransport();
    const mailer = createMailer(transport, { from: FROM });
    transport.failNextWith(new Error('boom'));
    await expect(
      mailer.send({ to: 'a@sovereign.local', subject: 'x', text: 'x' }),
    ).rejects.toBeInstanceOf(MailError);
    await expect(
      mailer.send({ to: 'a@sovereign.local', subject: 'x', text: 'x' }),
    ).resolves.toBeDefined();
  });
});

describe('an unavailable mailer', () => {
  it('fails every send, saying email is not set up, instead of dropping the message', async () => {
    const mailer = createUnavailableMailer('Email is not set up: no SMTP server is set.');
    const error = await mailer
      .send({ to: 'a@sovereign.local', subject: 'x', text: 'x' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailError);
    expect(error).toMatchObject({
      code: 'not-configured',
      message: 'Email is not set up: no SMTP server is set.',
    });
  });
});
