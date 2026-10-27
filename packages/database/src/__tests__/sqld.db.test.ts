/** What only sqld has: namespaces, and the header every request must carry. */
import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { connect, createNamespace, createSqldClient, dropNamespace } from '../index.js';
import { dialect } from './support.js';

const url = process.env.SV_SQLD_URL ?? '';
const admin = process.env.SV_SQLD_ADMIN_URL ?? '';
const namespaces: string[] = [];
const fresh = () => {
  const name = `n_${randomBytes(4).toString('hex')}`;
  namespaces.push(name);
  return name;
};

describe.skipIf(dialect !== 'sqld')('sqld', () => {
  afterAll(async () => {
    for (const name of namespaces) await dropNamespace(admin, name).catch(() => undefined);
  });

  it('keeps namespaces apart through the client', async () => {
    const a = fresh();
    const b = fresh();
    await createNamespace(admin, a);
    await createNamespace(admin, b);
    const first = await connect({ dialect: 'sqld', url, adminUrl: admin, namespace: a });
    const second = await connect({ dialect: 'sqld', url, adminUrl: admin, namespace: b });
    try {
      await first.run('create table only_in_a (id integer primary key)');
      expect(
        (await first.run("select name from sqlite_master where name = 'only_in_a'")).rows,
      ).toHaveLength(1);
      expect(
        (await second.run("select name from sqlite_master where name = 'only_in_a'")).rows,
      ).toHaveLength(0);
    } finally {
      await first.close();
      await second.close();
    }
  });

  it('works through a host whose first label is not a namespace, because every request names one', async () => {
    // 127.0.0.1 would be read by sqld as the namespace "127" without the header.
    expect(new URL(url).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    const db = await connect({ dialect: 'sqld', url, adminUrl: admin, namespace: 'default' });
    try {
      await expect(db.ping()).resolves.toBeUndefined();
    } finally {
      await db.close();
    }
  });

  it('sends x-namespace on every request it makes, default included', async () => {
    const seen: (string | null)[] = [];
    const client = await createSqldClient(url, 'default', (request) => {
      seen.push(request.headers.get('x-namespace'));
      return fetch(request);
    });
    try {
      await client.execute('select 1');
      await client.execute('select 2');
    } finally {
      client.close();
    }
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(new Set(seen)).toEqual(new Set(['default']));
  });

  it('creates a missing namespace on connect when asked to, and repeats safely', async () => {
    const name = fresh();
    const settings = { dialect: 'sqld' as const, url, adminUrl: admin, namespace: name };
    const db = await connect(settings, { createNamespace: true });
    await db.close();
    const again = await connect(settings, { createNamespace: true });
    try {
      await expect(again.ping()).resolves.toBeUndefined();
    } finally {
      await again.close();
    }
  });

  it('fails clearly when a namespace does not exist and was not created', async () => {
    const db = await connect({ dialect: 'sqld', url, adminUrl: admin, namespace: fresh() });
    try {
      await expect(db.run('select 1')).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  it('refuses to create a namespace without the admin address', async () => {
    await expect(
      connect(
        { dialect: 'sqld', url, adminUrl: undefined, namespace: fresh() },
        { createNamespace: true },
      ),
    ).rejects.toThrow(/SQLD_ADMIN_URL/);
  });
});
