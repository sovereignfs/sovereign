import { describe, expect, it } from 'vitest';
import { isEmailAddress, isSender } from '../address';

describe('isEmailAddress', () => {
  it.each([
    'a@sovereign.local',
    'first.last@example.co.uk',
    'user+tag@sub.example.org',
    "o'brien@sovereign.local",
    'x@a-b.sovereign.local',
  ])('accepts %s', (address) => {
    expect(isEmailAddress(address)).toBe(true);
  });

  it.each([
    '',
    'plain',
    '@sovereign.local',
    'a@',
    'a@example',
    'a b@sovereign.local',
    'a@exa mple.com',
    'a@@sovereign.local',
    '.a@sovereign.local',
    'a.@sovereign.local',
    'a..b@sovereign.local',
    'a@-example.com',
    'a@example-.com',
    'a@example..com',
    'a@sovereign.local\r\nBcc: victim@sovereign.local',
    'a@sovereign.local, b@sovereign.local',
    'Name <a@sovereign.local>',
    '"quoted"@sovereign.local',
    'a@exämple.com',
    `${'a'.repeat(65)}@sovereign.local`,
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
    'no-reply@sovereign.local',
    'Sovereign <no-reply@sovereign.local>',
    'Acme Identity <id@acme.test>',
  ])('accepts %s', (sender) => {
    expect(isSender(sender)).toBe(true);
  });

  it.each([
    '',
    'Name <>',
    'Name <a@sovereign.local',
    'Name a@sovereign.local>',
    '<<a@sovereign.local>>',
    'A <b@sovereign.local> <c@sovereign.local>',
    'Evil\r\nBcc: x@sovereign.local <a@sovereign.local>',
    'Name "quoted" <a@sovereign.local>',
    'Name <not an address>',
    `${'n'.repeat(400)} <a@sovereign.local>`,
  ])('refuses %j', (sender) => {
    expect(isSender(sender)).toBe(false);
  });
});
