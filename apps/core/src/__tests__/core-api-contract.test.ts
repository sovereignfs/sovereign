import { describe, expect, it } from 'vitest';
import {
  contract,
  contractProblems,
  expectMatchesContract,
  operations,
  servedPaths,
} from './core-api-contract';

describe('the routes Core serves for apps, against the contract', () => {
  it('serves every operation the contract does not mark as planned, and no route the contract does not describe', () => {
    const described = [...new Set(operations.map(({ route }) => route))].sort();
    const planned = new Set(
      operations
        .filter(({ operation }) => operation['x-planned'] === true)
        .map(({ route }) => route),
    );
    const served = servedPaths();
    expect(
      described.filter((route) => !planned.has(route)),
      'a route the contract describes as served is missing',
    ).toEqual(served.filter((route) => described.includes(route)));
    expect(
      served.filter((route) => !described.includes(route.replace(/\/\[[^/]+\]/g, '/{param}'))),
      'a route that the contract does not describe',
    ).toEqual([]);
    for (const route of planned)
      expect(served, `${route} is marked planned but is served`).not.toContain(route);
  });
});

describe('holding an answer to the contract', () => {
  const user = { sub: 'abc', name: 'Ada Admin', picture: null };

  it('accepts what the contract describes', () => {
    expect(contractProblems('searchDirectoryUsers', 200, { users: [user] })).toEqual([]);
    expect(contractProblems('searchDirectoryUsers', 200, { users: [] })).toEqual([]);
    expect(
      contractProblems('resolveDirectoryUsers', 200, { users: [{ ...user, active: false }] }),
    ).toEqual([]);
    expect(
      contractProblems('findDirectoryUserByEmail', 200, {
        ...user,
        picture: 'https://c.example/p.png',
      }),
    ).toEqual([]);
    expect(
      contractProblems('getInstanceBranding', 200, {
        name: 'Acme',
        url: 'https://core.example.com',
        logo: { light: 'https://core.example.com/api/branding/logo-light?v=1', dark: null },
        favicon: null,
      }),
    ).toEqual([]);
    expect(
      contractProblems('searchDirectoryUsers', 429, {
        error: 'rate_limited',
        message: 'Slow down.',
      }),
    ).toEqual([]);
  });

  it('refuses a field that is missing, one that is not in the contract, and one of the wrong kind', () => {
    expect(
      contractProblems('searchDirectoryUsers', 200, { users: [{ sub: 'a', name: 'A' }] }).join(),
    ).toMatch(/picture/);
    expect(
      contractProblems('searchDirectoryUsers', 200, {
        users: [{ ...user, email: 'a@example.com' }],
      }).join(),
    ).toMatch(/additional/);
    expect(
      contractProblems('searchDirectoryUsers', 200, { users: [{ ...user, name: 7 }] }).join(),
    ).toMatch(/string/);
    expect(
      contractProblems('searchDirectoryUsers', 200, { users: [user], extra: true }).length,
    ).toBeGreaterThan(0);
    expect(contractProblems('resolveDirectoryUsers', 200, { users: [user] }).join()).toMatch(
      /active/,
    );
  });

  it('refuses a picture that is not an address, and an error of a kind the contract does not give', () => {
    expect(
      contractProblems('searchDirectoryUsers', 200, { users: [{ ...user, picture: 'not a uri' }] })
        .length,
    ).toBeGreaterThan(0);
    expect(
      contractProblems('searchDirectoryUsers', 403, { error: 'teapot', message: 'x' }).length,
    ).toBeGreaterThan(0);
  });

  it('refuses a status the contract gives no answer for', () => {
    expect(
      contractProblems('getInstanceBranding', 404, { error: 'not_found', message: 'x' }),
    ).toEqual(['the contract gives getInstanceBranding no JSON answer for 404']);
  });

  it('says which operation, and what differs, when it fails', () => {
    expect(() => expectMatchesContract('searchDirectoryUsers', 200, { users: [{}] })).toThrow(
      /searchDirectoryUsers 200 does not match the contract/,
    );
    expect(() => expectMatchesContract('nope', 200, {})).toThrow(/no operation nope/);
  });

  it('reads the contract it is told about', () => {
    expect(Object.keys(contract.paths).length).toBeGreaterThan(0);
  });
});
