import { describe, expect, it, vi } from 'vitest';
import { SCOPE_COPY, readConsentRequest, type ConsentClient } from '../oauth/consent';
import { OAUTH_SCOPES } from '../oauth/provider';
import { queryOf, signedQueryOf } from '../oauth/signed-query';
import { isTrusted, scopesAllowedFor } from '../oauth/trust';

const SIGNED = (extra: Record<string, string> = {}) =>
  new URLSearchParams({
    client_id: 'abc',
    redirect_uri: 'https://rp.sovereign.local/cb',
    scope: 'openid profile email',
    state: 'xyz',
    ...extra,
  }).toString();

const deps = (client: ConsentClient | null | undefined = { name: 'Notes' }, valid = true) => ({
  verify: vi.fn(() => Promise.resolve(valid)),
  findClient: vi.fn(() => Promise.resolve(client)),
});

describe('what is trusted', () => {
  it.each([
    [{ skipConsent: true }, true],
    [{ skipConsent: false }, false],
    [{ skipConsent: null }, false],
    [{}, false],
    [null, false],
    [undefined, false],
  ])('treats %j as trusted: %s', (client, expected) => {
    expect(isTrusted(client)).toBe(expected);
  });

  it('keeps roles for a trusted client and takes it from every other', () => {
    const scopes = ['openid', 'roles', 'profile'];
    expect(scopesAllowedFor({ skipConsent: true }, scopes)).toEqual(scopes);
    expect(scopesAllowedFor({ skipConsent: false }, scopes)).toEqual(['openid', 'profile']);
    expect(scopesAllowedFor(null, scopes)).toEqual(['openid', 'profile']);
  });

  it('does not change the list it is given', () => {
    const scopes = ['openid', 'roles'];
    scopesAllowedFor({}, scopes);
    expect(scopes).toEqual(['openid', 'roles']);
  });
});

describe('the signed part of an address', () => {
  const signed =
    'client_id=abc&scope=openid&ba_param=client_id&ba_param=scope&ba_param=ba_param&sig=s';

  it('keeps what the provider signed and drops what it did not', () => {
    const query = new URLSearchParams(`${signed}&returnTo=%2Fx&utm=1`);
    const kept = new URLSearchParams(signedQueryOf(query));
    expect([...kept.keys()].sort()).toEqual(
      ['ba_param', 'ba_param', 'ba_param', 'client_id', 'scope', 'sig'].sort(),
    );
    expect(kept.get('returnTo')).toBeNull();
  });

  it.each([
    'client_id=abc&scope=openid',
    'client_id=abc&ba_param=client_id',
    'sig=s&client_id=abc',
  ])('is nothing when there is no signature or no list of what was signed: %s', (search) => {
    expect(signedQueryOf(new URLSearchParams(search))).toBeUndefined();
  });

  it('keeps a repeated name, since the list of signed names is repeated', () => {
    expect(queryOf({ ba_param: ['a', 'b'], sig: 's', x: undefined }).getAll('ba_param')).toEqual([
      'a',
      'b',
    ]);
    expect(queryOf({ x: undefined }).toString()).toBe('');
  });
});

describe('reading an app’s request for the consent page', () => {
  it('gives the app, where the answer goes, what it would get and what that means, in words', async () => {
    const request = await readConsentRequest(SIGNED(), deps({ name: ' Notes ' }));
    expect(request).toEqual({
      appName: 'Notes',
      returnHost: 'rp.sovereign.local',
      scopes: ['openid', 'profile', 'email'],
      permissions: [SCOPE_COPY.openid, SCOPE_COPY.profile, SCOPE_COPY.email],
    });
  });

  it('says nothing unless the provider signed the request and it has not expired', async () => {
    const d = deps({ name: 'Notes' }, false);
    expect(await readConsentRequest(SIGNED(), d)).toBeUndefined();
    expect(d.findClient).not.toHaveBeenCalled();
    expect(await readConsentRequest(undefined, deps())).toBeUndefined();
    expect(await readConsentRequest('', deps())).toBeUndefined();
  });

  it.each([
    ['no client', SIGNED({ client_id: '' })],
    ['no redirect address', SIGNED({ redirect_uri: '' })],
    ['a redirect address that is not one', SIGNED({ redirect_uri: 'not a url' })],
    ['no openid scope', SIGNED({ scope: 'profile email' })],
    ['only scopes core does not know', SIGNED({ scope: 'admin' })],
  ])('says nothing for %s', async (_name, signed) => {
    expect(await readConsentRequest(signed, deps())).toBeUndefined();
  });

  it.each([
    ['one that does not exist', null],
    ['one that is switched off', { name: 'Notes', disabled: true }],
  ])('says nothing for a client %s', async (_name, client) => {
    expect(await readConsentRequest(SIGNED(), deps(client))).toBeUndefined();
  });

  it('offers an untrusted app nothing about roles, whatever it asked', async () => {
    const request = await readConsentRequest(SIGNED({ scope: 'openid roles profile' }), deps());
    expect(request?.scopes).toEqual(['openid', 'profile']);
    expect(request?.permissions.join(' ')).not.toMatch(/role/i);
  });

  it('keeps roles in what a trusted app would be granted, and still does not describe it', async () => {
    const request = await readConsentRequest(
      SIGNED({ scope: 'openid roles' }),
      deps({ name: 'Notes', skipConsent: true }),
    );
    expect(request?.scopes).toEqual(['openid', 'roles']);
    expect(request?.permissions).toEqual([SCOPE_COPY.openid]);
  });

  it('takes a scope once, drops one core does not know, and has no name for an app that has none', async () => {
    const request = await readConsentRequest(
      SIGNED({ scope: 'openid profile profile made-up' }),
      deps({ name: '   ' }),
    );
    expect(request?.scopes).toEqual(['openid', 'profile']);
    expect(request?.appName).toBeUndefined();
  });

  it('has plain words for every scope a person can be asked about, and none that sounds like the protocol', () => {
    const askable = OAUTH_SCOPES.filter((scope) => scope !== 'roles');
    for (const scope of askable) expect(SCOPE_COPY[scope], scope).toBeTruthy();
    for (const words of Object.values(SCOPE_COPY)) {
      expect(words).not.toMatch(/scope|token|oauth|openid|claim|client/i);
    }
    expect(SCOPE_COPY.roles).toBeUndefined();
  });
});
