import { describe, expect, it } from 'vitest';
import type { Connections } from '../apply/database-use.js';
import type { Suite } from '../suite/types.js';
import { describeUse, serviceOfRole } from './budget.js';

const suite: Suite = {
  schema: 1,
  domain: 'sovereign.local',
  core: { version: '0.83.0' },
  database: { version: '18' },
  server: { host: 'h' },
  secrets: { recipients: ['age1abc'] },
  apps: {
    'my-notes': { image: 'x/n:1' },
    wiki: { external: true, name: 'Wiki', redirect: ['https://w.sovereign.local/cb'] },
  },
};
const connections = (extra: Partial<Connections> = {}): Connections => ({
  max: 100,
  reserved: 3,
  total: 3,
  roles: [
    { role: 'app_my_notes', used: 1, limit: 12 },
    { role: 'core', used: 2, limit: 12 },
  ],
  ...extra,
});

describe('which service a role is', () => {
  it('is core, or the app the role was made for, hyphens and all', () => {
    expect(serviceOfRole(suite, 'core')).toBe('core');
    expect(serviceOfRole(suite, 'app_my_notes')).toBe('my-notes');
    expect(serviceOfRole(suite, 'app_removed')).toBe('app_removed');
  });
});

describe('what the connections say', () => {
  it('names each service with what it holds against what it may, and the total', () => {
    const use = describeUse(suite, connections());
    expect(use.summary).toBe('3 open of 100 (my-notes 1/12, core 2/12)');
    expect(use.pressure).toEqual([]);
  });

  it('says a role is near its limit from four fifths of it', () => {
    // 80% of 12 is 9.6, so 10 is near and 9 is not.
    expect(
      describeUse(suite, connections({ roles: [{ role: 'core', used: 9, limit: 12 }] })).pressure,
    ).toEqual([]);
    expect(
      describeUse(suite, connections({ roles: [{ role: 'core', used: 10, limit: 12 }] })).pressure,
    ).toEqual(['core holds 10 of 12']);
  });

  it('says the server is near what it leaves for the roles, from four fifths of it', () => {
    // 100 less 3 is 97, and 80% of that is 77.6, so 78 is near.
    expect(describeUse(suite, connections({ total: 77 })).pressure).toEqual([]);
    expect(describeUse(suite, connections({ total: 78 })).pressure).toEqual([
      '78 are open of the 97 the server leaves for them',
    ]);
  });

  it('says nothing about roles when there are none', () => {
    expect(describeUse(suite, connections({ roles: [], total: 1 })).summary).toBe('1 open of 100');
  });
});
