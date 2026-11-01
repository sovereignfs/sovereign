import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_CONNECTIONS,
  ROLE_HEADROOM,
  SUPERUSER_RESERVE,
  appPool,
  connectionBudget,
  corePool,
  describeBudget,
  maxConnectionsOf,
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
