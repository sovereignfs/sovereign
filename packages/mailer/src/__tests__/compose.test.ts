import { describe, expect, it } from 'vitest';
import { compose } from '../compose';
import { isMailError, MailError } from '../errors';

const FROM = 'Sovereign <no-reply@sovereign.local>';
const ok = { to: 'person@sovereign.local', subject: 'Hello', text: 'Hi' };

function refusal(message: Parameters<typeof compose>[0]): MailError {
  try {
    compose(message, FROM);
  } catch (error) {
    if (isMailError(error)) return error;
    throw error;
  }
  throw new Error('expected the message to be refused');
}

describe('compose', () => {
  it('settles the sender from the default, and lets a message override it', () => {
    expect(compose(ok, FROM).from).toBe(FROM);
    expect(compose({ ...ok, from: 'other@sovereign.local' }, FROM).from).toBe(
      'other@sovereign.local',
    );
  });

  it('turns one recipient into a list, and keeps several', () => {
    expect(compose(ok, FROM).to).toEqual(['person@sovereign.local']);
    expect(compose({ ...ok, to: ['a@sovereign.local', 'b@sovereign.local'] }, FROM).to).toEqual([
      'a@sovereign.local',
      'b@sovereign.local',
    ]);
  });

  it('keeps text and html as given', () => {
    const composed = compose({ ...ok, html: '<p>Hi</p>' }, FROM);
    expect(composed.text).toBe('Hi');
    expect(composed.html).toBe('<p>Hi</p>');
    expect(compose({ to: ok.to, subject: 'S', html: '<p>x</p>' }, FROM).text).toBeUndefined();
  });

  it.each([
    ['no recipient', { ...ok, to: [] }, 'it has no recipient'],
    [
      'a bad recipient',
      { ...ok, to: ['good@sovereign.local', 'bad'] },
      'a recipient is not a valid email address',
    ],
    [
      'a display name in the recipient',
      { ...ok, to: 'Name <a@sovereign.local>' },
      'a recipient is not a valid email address',
    ],
    [
      'too many recipients',
      { ...ok, to: Array.from({ length: 51 }, (_, i) => `u${i}@sovereign.local`) },
      'it has more than 50 recipients',
    ],
    ['a bad sender', { ...ok, from: 'not an address' }, 'the sender is not a valid email address'],
    ['an empty subject', { ...ok, subject: '  ' }, 'it has no subject'],
    ['a subject that is too long', { ...ok, subject: 'x'.repeat(999) }, 'the subject is too long'],
    ['no body', { to: ok.to, subject: 'S' }, 'it has no body'],
    ['a body that is too large', { ...ok, text: 'x'.repeat(1_000_001) }, 'the body is too large'],
  ])('refuses %s', (_name, message, reason) => {
    const error = refusal(message as Parameters<typeof compose>[0]);
    expect(error.code).toBe('invalid-message');
    expect(error.message).toBe(`The message cannot be sent: ${reason}.`);
  });

  it('refuses a header smuggled in through the subject, the recipient or the sender', () => {
    expect(refusal({ ...ok, subject: 'Hi\r\nBcc: victim@sovereign.local' }).message).toContain(
      'line break',
    );
    expect(refusal({ ...ok, subject: 'Hi\nBcc: victim@sovereign.local' }).message).toContain(
      'line break',
    );
    expect(refusal({ ...ok, to: 'a@sovereign.local\r\nBcc: victim@sovereign.local' }).code).toBe(
      'invalid-message',
    );
    expect(refusal({ ...ok, from: 'a@sovereign.local\r\nBcc: victim@sovereign.local' }).code).toBe(
      'invalid-message',
    );
  });

  it('counts the size of a body in bytes, not characters', () => {
    expect(refusal({ ...ok, text: '日'.repeat(400_000) }).message).toContain('too large');
  });
});

describe('the unsubscribe address', () => {
  it('is kept when it is a web address, and absent otherwise', () => {
    expect(
      compose({ ...ok, unsubscribe: 'https://core.example/preferences' }, FROM).unsubscribe,
    ).toBe('https://core.example/preferences');
    expect(compose(ok, FROM).unsubscribe).toBeUndefined();
  });

  it.each([
    'mailto:a@sovereign.local',
    'not an address',
    'https://x.example/a b',
    'https://x.example/>\r\nBcc: a@b.c',
  ])('refuses %j, since it goes into a header', (unsubscribe) => {
    expect(() => compose({ ...ok, unsubscribe }, FROM)).toThrow(/unsubscribe address/);
  });
});
