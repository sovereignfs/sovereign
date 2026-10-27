import { describe, expect, it } from 'vitest';
import { isEmailAddress, isSender } from '../address';

describe('isEmailAddress', () => {
  it.each([
    'a@example.com',
    'first.last@example.co.uk',
    'user+tag@sub.example.org',
    "o'brien@example.com",
    'x@a-b.example.com',
  ])('accepts %s', (address) => {
    expect(isEmailAddress(address)).toBe(true);
  });

  it.each([
    '',
    'plain',
    '@example.com',
    'a@',
    'a@example',
    'a b@example.com',
    'a@exa mple.com',
    'a@@example.com',
    '.a@example.com',
    'a.@example.com',
    'a..b@example.com',
    'a@-example.com',
    'a@example-.com',
    'a@example..com',
    'a@example.com\r\nBcc: victim@example.com',
    'a@example.com, b@example.com',
    'Name <a@example.com>',
    '"quoted"@example.com',
    'a@exämple.com',
    `${'a'.repeat(65)}@example.com`,
    `a@${'b'.repeat(64)}.com`,
    `a@${'b.'.repeat(130)}com`,
  ])('refuses %j', (address) => {
    expect(isEmailAddress(address)).toBe(false);
  });

  it('refuses a very long hostile value in linear time', () => {
    const started = performance.now();
    expect(isEmailAddress(`${'a'.repeat(200_000)}@${'b-'.repeat(100_000)}`)).toBe(false);
    expect(isEmailAddress(`a@${'a-'.repeat(100_000)}`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('isSender', () => {
  it.each([
    'no-reply@example.com',
    'Sovereign <no-reply@example.com>',
    'Acme Identity <id@acme.test>',
  ])('accepts %s', (sender) => {
    expect(isSender(sender)).toBe(true);
  });

  it.each([
    '',
    'Name <>',
    'Name <a@example.com',
    'Name a@example.com>',
    '<<a@example.com>>',
    'A <b@example.com> <c@example.com>',
    'Evil\r\nBcc: x@example.com <a@example.com>',
    'Name "quoted" <a@example.com>',
    'Name <not an address>',
    `${'n'.repeat(400)} <a@example.com>`,
  ])('refuses %j', (sender) => {
    expect(isSender(sender)).toBe(false);
  });
});
