import { describe, expect, it } from 'vitest';
import type { Suite } from '../suite/types.js';
import { fakeHost } from '../testing/fake-host.js';
import { poolerFiles, readPools } from './pooler.js';

const suite = (pooler: Suite['database']['pooler'] = {}, apps: Suite['apps'] = {}): Suite => ({
  schema: 1,
  domain: 'sovereign.local',
  core: { version: '0.83.0' },
  database: { version: '18', pooler },
  server: { host: 'h' },
  secrets: { recipients: ['age1abc'] },
  apps,
});

describe('the pooler’s files', () => {
  const notes = { image: 'x/notes:1' };

  it('are transaction mode with SCRAM and nothing that identifies core, and one database for each app', () => {
    const files = poolerFiles(suite({}, { notes, 'team-wiki': { image: 'x/wiki:1' } }), [
      { name: 'notes', password: 'p1' },
      { name: 'team-wiki', password: 'p2' },
    ]);
    expect(files['pgbouncer.ini']).toContain('pool_mode = transaction');
    expect(files['pgbouncer.ini']).toContain(
      'app_notes = host=sv-database port=5432 dbname=app_notes pool_size=5',
    );
    expect(files['pgbouncer.ini']).toContain(
      'app_team_wiki = host=sv-database port=5432 dbname=app_team_wiki pool_size=5',
    );
    expect(files['pgbouncer.ini']).not.toMatch(/dbname=core/);
    expect(files['pgbouncer.ini']).toContain('max_client_conn = 200');
    expect(files['pg_hba.conf']).toContain('host all all 0.0.0.0/0 scram-sha-256');
    expect(files['userlist.txt']).toBe('"app_notes" "p1"\n"app_team_wiki" "p2"\n');
  });

  it('reach the console only through the socket, by the account of the container', () => {
    const files = poolerFiles(suite(), []);
    expect(files['pg_hba.conf']).toContain('local pgbouncer pgbouncer peer');
    expect(files['pgbouncer.ini']).toContain('unix_socket_dir = /var/run/pgbouncer');
    expect(files['pgbouncer.ini']).toContain('admin_users = pgbouncer');
    expect(files['userlist.txt']).toBe('');
  });

  it('give each app the pool the operator chose, never more than its own', () => {
    const files = poolerFiles(
      suite({ poolSize: 8 }, { notes: { ...notes, connections: 3 }, wiki: { image: 'x/w:1' } }),
      [
        { name: 'notes', password: 'p' },
        { name: 'wiki', password: 'q' },
      ],
    );
    expect(files['pgbouncer.ini']).toContain('dbname=app_notes pool_size=3');
    expect(files['pgbouncer.ini']).toContain('dbname=app_wiki pool_size=8');
  });

  it('quote a password, so none can end the line', () => {
    const files = poolerFiles(suite({}, { notes }), [{ name: 'notes', password: 'a"b' }]);
    expect(files['userlist.txt']).toBe('"app_notes" "a""b"\n');
  });
});

describe('the pools it reports', () => {
  it('are read by the names in the header, so a release that adds a column moves nothing', async () => {
    const { host, docker } = fakeHost();
    docker.containers.set('sv-pooler', {
      id: 'x',
      startedAt: 0,
      configHash: '',
      networks: {},
      health: 'healthy',
    });
    docker.poolsReport =
      'database,user,newcolumn,cl_active,cl_waiting,sv_active,sv_idle\napp_notes,app_notes,9,3,1,2,4\npgbouncer,pgbouncer,0,1,0,0,0';
    expect(await readPools(host)).toEqual([
      {
        database: 'app_notes',
        clientsActive: 3,
        clientsWaiting: 1,
        serversActive: 2,
        serversIdle: 4,
      },
    ]);
  });

  it('are null when it is not running, and when the answer is not what was expected', async () => {
    const { host, docker } = fakeHost();
    expect(await readPools(host)).toBeNull();
    docker.containers.set('sv-pooler', {
      id: 'x',
      startedAt: 0,
      configHash: '',
      networks: {},
      health: 'healthy',
    });
    docker.poolsReport = 'database,user\napp_notes,app_notes';
    expect(await readPools(host)).toBeNull();
  });
});
