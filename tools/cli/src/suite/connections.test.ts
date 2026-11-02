import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_CONNECTIONS,
  DIRECT_POOL,
  ROLE_HEADROOM,
  SUPERUSER_RESERVE,
  appPool,
  appRoleLimit,
  connectionBudget,
  corePool,
  describeBudget,
  describeClients,
  maxConnectionsOf,
  poolerClients,
  poolerPool,
  roleLimit,
  setsConnections,
} from './connections.js';
import type { Suite } from './types.js';

const suite = (extra: Partial<Suite> = {}): Suite => ({
  schema: 1,
  domain: 'sovereign.local',
  core: { version: '0.83.0' },
  database: { version: '18' },
  server: { host: 'h' },
  secrets: { recipients: ['age1abc'] },
  ...extra,
});
const apps = (n: number): NonNullable<Suite['apps']> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`app${i}`, { image: `x/app${i}:1` }]));

describe('what an instance that says nothing has', () => {
  it('is what core and the template already do: pools of 10, and PostgreSQL’s own 100', () => {
    const s = suite();
    expect(maxConnectionsOf(s)).toBe(DEFAULT_MAX_CONNECTIONS);
    expect(DEFAULT_MAX_CONNECTIONS).toBe(100);
    expect(corePool(s)).toBe(10);
    expect(appPool(s, 'notes')).toBe(10);
    expect(setsConnections(s)).toBe(false);
  });

  it('gives a role its pool and two more, so a connection left by a killed container does not keep the next one out', () => {
    expect(ROLE_HEADROOM).toBe(2);
    expect(roleLimit(10)).toBe(12);
    expect(roleLimit(2)).toBe(4);
  });
});

describe('what the operator sets', () => {
  it('is core’s, every app’s, and one app’s own, which wins for that app', () => {
    const s = suite({
      database: { version: '18', maxConnections: 300, connections: { core: 25, app: 6 } },
      apps: { notes: { image: 'x/notes:1', connections: 3 }, wiki: { image: 'x/wiki:1' } },
    });
    expect(maxConnectionsOf(s)).toBe(300);
    expect(corePool(s)).toBe(25);
    expect(appPool(s, 'notes')).toBe(3);
    expect(appPool(s, 'wiki')).toBe(6);
    expect(setsConnections(s)).toBe(true);
  });

  it('counts as setting connections when only one app has a number', () => {
    expect(setsConnections(suite({ apps: { notes: { image: 'x/n:1', connections: 4 } } }))).toBe(
      true,
    );
  });

  it('ignores a number on an external app, which has no role', () => {
    const s = suite({
      apps: { wiki: { external: true, name: 'Wiki', redirect: ['https://w.sovereign.local/cb'] } },
    });
    expect(appPool(s, 'wiki')).toBe(10);
    expect(setsConnections(s)).toBe(false);
  });
});

describe('the budget', () => {
  it('is core and each app with a database, against max_connections less what the superuser keeps', () => {
    const s = suite({ apps: apps(3) });
    const budget = connectionBudget(s, () => true);
    expect(SUPERUSER_RESERVE).toBe(3);
    expect(budget.roles.map((r) => r.name)).toEqual(['core', 'app0', 'app1', 'app2']);
    expect(budget.used).toBe(4 * 12);
    expect(budget.available).toBe(97);
    expect(budget.exceeded).toBe(false);
  });

  it('leaves out an app with no database, since it has no role', () => {
    const budget = connectionBudget(suite({ apps: apps(3) }), (name) => name === 'app1');
    expect(budget.roles.map((r) => r.name)).toEqual(['core', 'app1']);
  });

  it('is exceeded by eight apps at the defaults, and is then only said, since the operator set nothing', () => {
    const budget = connectionBudget(suite({ apps: apps(8) }), () => true);
    expect(budget.used).toBe(9 * 12);
    expect(budget.exceeded).toBe(true);
    expect(budget.explicit).toBe(false);
  });

  it('is exceeded and explicit when the operator set a number that does not fit', () => {
    const budget = connectionBudget(
      suite({ database: { version: '18', maxConnections: 20 }, apps: apps(1) }),
      () => true,
    );
    expect(budget.available).toBe(17);
    expect(budget.used).toBe(24);
    expect(budget.exceeded).toBe(true);
    expect(budget.explicit).toBe(true);
  });

  it('is exactly met without being exceeded', () => {
    // core 12 + 7 apps of 12 = 96; 100 less 3 allows 97.
    expect(connectionBudget(suite({ apps: apps(7) }), () => true).exceeded).toBe(false);
  });

  it('says where the connections go', () => {
    const budget = connectionBudget(
      suite({ database: { version: '18', maxConnections: 20 }, apps: apps(1) }),
      () => true,
    );
    expect(describeBudget(budget, 20)).toBe(
      'The connection limits add up to 24 (core 12, app0 12), and the server allows 17 (max_connections 20, less 3 kept for the superuser).',
    );
  });
});

describe('the pooler', () => {
  const pooled = suite({ database: { version: '18', pooler: {} }, apps: apps(3) });

  it('has the numbers it has when the operator says nothing, and the ones they set', () => {
    expect([poolerPool(pooled), poolerClients(pooled)]).toEqual([5, 200]);
    const set = suite({ database: { version: '18', pooler: { poolSize: 3, maxClients: 50 } } });
    expect([poolerPool(set), poolerClients(set)]).toEqual([3, 50]);
  });

  it('limits a pooled app’s role to what the pooler may open for it, the direct address and the headroom', () => {
    expect(appRoleLimit(pooled, 'app0', true)).toBe(5 + DIRECT_POOL + ROLE_HEADROOM);
    expect(appRoleLimit(pooled, 'app0', false)).toBe(roleLimit(10));
  });

  it('never gives the pooler more of an app than the app’s own pool', () => {
    const small = suite({
      database: { version: '18', pooler: { poolSize: 50 } },
      apps: { app0: { image: 'x/a:1', connections: 3 } },
    });
    expect(appRoleLimit(small, 'app0', true)).toBe(3 + DIRECT_POOL + ROLE_HEADROOM);
  });

  it('counts pooled apps at that, and the rest as before, and only while the pooler is on', () => {
    const always = () => true;
    const on = connectionBudget(pooled, always, always);
    expect(on.roles.map((r) => r.limit)).toEqual([12, 9, 9, 9]);
    const off = connectionBudget(suite({ apps: apps(3) }), always, always);
    expect(off.roles.map((r) => r.limit)).toEqual([12, 12, 12, 12]);
    expect(off.clients).toBeUndefined();
    const some = connectionBudget(pooled, always, (name) => name === 'app1');
    expect(some.roles.map((r) => r.limit)).toEqual([12, 12, 9, 12]);
  });

  it('is explicit as soon as it is on, since the operator turned it on', () => {
    expect(
      connectionBudget(suite({ database: { version: '18', pooler: {} } }), () => true).explicit,
    ).toBe(true);
  });

  it('is exceeded when the pooled apps’ own pools may open more than it takes, and not otherwise', () => {
    const tight = suite({
      database: { version: '18', pooler: { maxClients: 20 }, connections: { app: 10 } },
      apps: apps(3),
    });
    const budget = connectionBudget(
      tight,
      () => true,
      () => true,
    );
    expect(budget.clients).toEqual({ used: 30, available: 20 });
    expect(budget.clientsExceeded).toBe(true);
    expect(describeClients(budget)).toBe(
      'The apps that go through the pooler may open 30 connections to it, and it takes 20.',
    );
    const unpooled = connectionBudget(
      tight,
      () => true,
      () => false,
    );
    expect(unpooled.clients?.used).toBe(0);
    expect(unpooled.clientsExceeded).toBe(false);
  });

  it('lets more apps fit the server than without it', () => {
    const many = (pooler: boolean) =>
      connectionBudget(
        suite({
          database: { version: '18', ...(pooler ? { pooler: { poolSize: 2 } } : {}) },
          apps: apps(12),
        }),
        () => true,
        () => true,
      );
    expect(many(false).exceeded).toBe(true);
    expect(many(true).exceeded).toBe(false);
  });
});
