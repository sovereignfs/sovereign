import { describe, expect, it } from 'vitest';
import { scopeProblems, textProblem, urlListProblems, urlProblem } from '../clients/validate';

describe('an address an app may use (core-app §3.7.1)', () => {
  it.each([
    'https://app.sovereign.local/callback',
    'https://app.sovereign.local:8443/cb?x=1',
    'https://localhost/cb',
    'https://sub.localhost:3000/cb',
  ])('accepts %s on any instance', (value) => {
    expect(urlProblem(value, false)).toBeUndefined();
    expect(urlProblem(value, true)).toBeUndefined();
  });

  it.each([
    'http://localhost:4000/cb',
    'http://localhost/cb',
    'http://app.localhost:3000/cb',
    'http://a.b.localhost/cb',
  ])('accepts %s on a development instance only', (value) => {
    expect(urlProblem(value, true)).toBeUndefined();
    expect(urlProblem(value, false)).toMatch(/not a development instance/);
  });

  it.each([
    'http://sovereign.local/cb',
    'http://127.0.0.1:4000/cb',
    'http://[::1]:4000/cb',
    'http://localhost.evil.com/cb',
    'http://notlocalhost/cb',
    'http://evil.com/.localhost',
  ])('refuses %s even on a development instance: only localhost is local', (value) => {
    expect(urlProblem(value, true)).toBeDefined();
  });

  it.each([
    ['ftp://sovereign.local/cb', 'must be https'],
    ['javascript:alert(1)', 'must be https'],
    ['data:text/html,x', 'must be https'],
    ['myapp://callback', 'must be https'],
    ['https://user:pass@sovereign.local/cb', 'user name'],
    ['https://user@sovereign.local/cb', 'user name'],
    ['https://sovereign.local/cb#frag', 'fragment'],
    ['https://sovereign.local/cb#', 'fragment'],
    ['https://*.sovereign.local/cb', 'plain address'],
    ['https://sovereign.local/*', 'plain address'],
    [' https://sovereign.local/cb', 'plain address'],
    ['https://sovereign.local/cb ', 'plain address'],
    ['https://sovereign.local/\ncb', 'plain address'],
    ['https://sovereign.local/\tcb', 'plain address'],
    ['not an address', 'not an address'],
    ['sovereign.local/cb', 'not an address'],
    ['', 'required'],
  ])('refuses %j', (value, why) => {
    expect(urlProblem(value, true)).toMatch(new RegExp(why));
  });

  it.each([undefined, null, 5, {}, ['https://a.example']])(
    'refuses %j, which is not text',
    (value) => {
      expect(urlProblem(value, true)).toBeDefined();
    },
  );

  it('refuses an address that is too long', () => {
    expect(urlProblem(`https://sovereign.local/${'a'.repeat(2100)}`, true)).toMatch(/too long/);
  });
});

describe('a list of addresses', () => {
  const list = (value: unknown, required = true) =>
    urlListProblems('redirectUris', value, false, { required });

  it('is the addresses, once each, in order', () => {
    expect(list(['https://a.example/1', 'https://b.example/2']).list).toEqual([
      'https://a.example/1',
      'https://b.example/2',
    ]);
  });

  it('needs at least one when required, and nothing when it is optional', () => {
    expect(list([]).problems).toHaveLength(1);
    expect(list(undefined).problems).toHaveLength(1);
    expect(list(null).problems).toHaveLength(1);
    expect(list([], false).problems).toEqual([]);
    expect(list(undefined, false).problems).toEqual([]);
  });

  it('says which address is wrong, and which is listed twice, each beside the field', () => {
    const { problems } = list(['https://a.example/1', 'http://b.example/2', 'https://a.example/1']);
    expect(problems).toEqual([
      { field: 'redirectUris', message: expect.stringContaining('address 2') },
      { field: 'redirectUris', message: 'address 3 is listed twice' },
    ]);
  });

  it('refuses a long list, and anything that is not a list', () => {
    const many = Array.from({ length: 21 }, (_, i) => `https://a.example/${i}`);
    expect(list(many).problems[0]?.message).toMatch(/no more than 20/);
    expect(list('https://a.example/1').problems[0]?.message).toMatch(/must be a list/);
    expect(list({}).problems[0]?.message).toMatch(/must be a list/);
  });
});

describe('a line of text', () => {
  it.each([
    ['Notes', 100, true, undefined],
    ['  Notes  ', 100, true, undefined],
    ['', 100, true, 'required'],
    ['   ', 100, true, 'required'],
    [undefined, 100, true, 'required'],
    [null, 100, true, 'required'],
    ['', 100, false, undefined],
    [undefined, 100, false, undefined],
    ['x'.repeat(101), 100, true, 'at most 100'],
    ['two\nlines', 100, true, 'line breaks'],
    ['bell\u0007', 100, true, 'control'],
    ['sep arator', 100, true, 'line breaks'],
    [5, 100, true, 'must be text'],
    [{}, 100, false, 'must be text'],
  ])('reads %j (max %s, required %s) as: %s', (value, max, required, problem) => {
    const found = textProblem(value, max as number, required as boolean);
    if (problem === undefined) expect(found).toBeUndefined();
    else expect(found).toMatch(new RegExp(problem));
  });
});

describe('the scopes an app may be allowed', () => {
  it('are scopes core offers, once each, with openid among them', () => {
    expect(
      scopeProblems('scopes', ['openid', 'profile', 'profile', 'offline_access'], false),
    ).toEqual({
      problems: [],
      list: ['openid', 'profile', 'offline_access'],
    });
  });

  it('keep roles for a trusted app and refuse it for any other', () => {
    expect(scopeProblems('scopes', ['openid', 'roles'], true).problems).toEqual([]);
    expect(scopeProblems('scopes', ['openid', 'roles'], false).problems).toEqual([
      { field: 'scopes', message: 'roles is only for a trusted app' },
    ]);
  });

  it.each([
    [[], 'at least one'],
    [undefined, 'at least one'],
    ['openid', 'at least one'],
    [['profile'], 'must include openid'],
    [['openid', 'admin'], 'not a scope core offers'],
    [['openid', 5], 'not a scope core offers'],
  ])('refuse %j: %s', (value, why) => {
    const { problems } = scopeProblems('scopes', value, true);
    expect(problems[0]?.message).toMatch(new RegExp(why));
  });
});
