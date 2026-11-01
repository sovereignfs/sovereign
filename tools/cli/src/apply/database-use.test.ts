import { describe, expect, it } from 'vitest';
import { fakeHost } from '../testing/fake-host.js';
import { CONNECTIONS_SQL, readConnections } from './database-use.js';

const REPORT = {
  max: 200,
  reserved: 3,
  total: 5,
  roles: [{ role: 'core', used: 1, limit: 12 }],
};

describe('reading the connections', () => {
  it('asks one question, as the administrator, and returns what the server answers', async () => {
    const { host, docker } = fakeHost();
    docker.containers.set('sv-database', { running: true, networks: {} } as never);
    docker.connectionsReport = JSON.stringify(REPORT);
    expect(await readConnections(host)).toEqual(REPORT);
    const question = docker.calls.find((c) => c.args.includes('psql'));
    expect(question?.input).toBe(CONNECTIONS_SQL);
    expect(question?.args).toContain('sovereign');
  });

  it('leaves out its own connection, and only counts clients, so the answer does not include the question', () => {
    expect(CONNECTIONS_SQL).toContain('pid <> pg_backend_pid()');
    expect(CONNECTIONS_SQL).toContain("backend_type = 'client backend'");
  });

  it('lists the roles that have a limit, and not the superuser, which has none', () => {
    expect(CONNECTIONS_SQL).toContain('r.rolconnlimit >= 0');
  });

  it.each(['', 'not json', '{"max":"many"}', '[]'])(
    'returns nothing for the answer %j',
    async (text) => {
      const { host, docker } = fakeHost();
      docker.containers.set('sv-database', { running: true, networks: {} } as never);
      docker.connectionsReport = text;
      expect(await readConnections(host)).toBeNull();
    },
  );

  it('returns nothing when the database server is not there', async () => {
    expect(await readConnections(fakeHost().host)).toBeNull();
  });
});
