import { readFileSync } from 'node:fs';
import path from 'node:path';
import { operations } from '@sovereignfs/api-client';
import { describe, expect, it } from 'vitest';
import { createSovereign } from '../index';
import { createFakeCore } from '../testing';
import {
  checkedAgainstContract,
  clock,
  contractProblems,
  memoryStore,
  servedOperationIds,
  settingsFor,
} from './helpers';

const root = path.join(import.meta.dirname, '../..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, string | Record<string, string>>;
};

describe('server only (sdk §3)', () => {
  it('has a browser entry that throws on import, saying the SDK runs on a server', async () => {
    await expect(import('../browser')).rejects.toThrow(/runs on a server/);
  });

  it('gives a browser that entry, and a server the real one', () => {
    expect(manifest.exports['.']).toEqual({
      browser: './src/browser.ts',
      default: './src/index.ts',
    });
  });
});

describe('every method of the capabilities (sdk §8) is checked against the contract', () => {
  const time = clock();
  const core = createFakeCore({ now: time.environment.now });
  core.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
  core.addPerson({ sub: 'u2', name: 'Grace Hopper', active: false });
  const stored = memoryStore();
  stored.tokens.set('u1', core.signIn('u1'));
  const sv = createSovereign({
    ...settingsFor(core),
    tokenStore: stored.store,
    fetch: checkedAgainstContract(core.fetch),
    environment: time.environment,
  });
  const directory = sv.as({ sub: 'u1' }).directory;

  it('directory.searchUsers is searchDirectoryUsers', async () => {
    expect((await directory.searchUsers({ q: 'ada', limit: 5 })).users).toHaveLength(1);
  });

  it('directory.resolveUsers is resolveDirectoryUsers', async () => {
    const { users } = await directory.resolveUsers({ subs: ['u2', 'u1', 'gone'] });
    expect(users.map((user) => [user.sub, user.active])).toEqual([
      ['u2', false],
      ['u1', true],
    ]);
  });

  it('directory.findUserByEmail is findDirectoryUserByEmail', async () => {
    await expect(directory.findUserByEmail({ email: 'ada@example.test' })).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('instance.getBranding is getInstanceBranding', async () => {
    expect((await sv.instance.getBranding()).url).toBe(core.url);
  });

  it('covers every operation core serves, so a new one cannot be left out unnoticed', () => {
    const covered = [
      'searchDirectoryUsers',
      'resolveDirectoryUsers',
      'findDirectoryUserByEmail',
      'getInstanceBranding',
    ];
    expect(servedOperationIds()).toEqual([...covered].sort());
  });

  it('knows the planned operations, which the SDK offers when core serves them', () => {
    expect(Object.keys(operations)).toEqual(
      expect.arrayContaining(['sendNotification', 'listNotifications']),
    );
  });

  it('holds the fake’s failures to the contract too: an error body has the one shape', () => {
    expect(
      contractProblems('searchDirectoryUsers', 401, { error: 'invalid_token', message: 'x' }),
    ).toEqual([]);
    expect(contractProblems('searchDirectoryUsers', 401, { oops: true })).not.toEqual([]);
  });
});
