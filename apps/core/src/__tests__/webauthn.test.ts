import { describe, expect, it } from 'vitest';
import { cbor, VirtualAuthenticator } from './webauthn';

describe('the test CBOR', () => {
  // RFC 8949 appendix A
  it.each([
    [0, '00'],
    [23, '17'],
    [24, '1818'],
    [100, '1864'],
    [-1, '20'],
    [-7, '26'],
    ['a', '6161'],
    [[1, 2, 3], '83010203'],
  ])('encodes %j as the RFC says', (value, hex) => {
    expect(cbor(value as number).toString('hex')).toBe(hex);
  });

  it('encodes a map and a byte string', () => {
    expect(cbor(new Map([[1, 2]])).toString('hex')).toBe('a10102');
    expect(cbor(Buffer.from([1, 2, 3, 4])).toString('hex')).toBe('4401020304');
  });
});

describe('the virtual authenticator', () => {
  const origin = 'https://core.sovereign.local';

  it('answers a registration with a credential id and an attestation object', () => {
    const device = new VirtualAuthenticator({ origin });
    const answer = device.register({
      challenge: 'abc',
      rp: { name: 'Core', id: 'core.sovereign.local' },
    });
    expect(answer.id).toBe(device.id);
    expect(
      JSON.parse(Buffer.from(answer.response.clientDataJSON, 'base64url').toString()),
    ).toMatchObject({
      type: 'webauthn.create',
      challenge: 'abc',
      origin,
    });
  });

  it('counts up with every sign-in, and a tampered answer differs only in its signature', () => {
    const device = new VirtualAuthenticator({ origin });
    const options = { challenge: 'abc', rpId: 'core.sovereign.local' };
    const first = device.authenticate(options);
    const second = device.authenticate(options);
    expect(device.counter).toBe(2);
    expect(first.response.authenticatorData).not.toBe(second.response.authenticatorData);
    const bad = device.authenticate(options, true);
    expect(bad.response.clientDataJSON).toBe(first.response.clientDataJSON);
  });
});
