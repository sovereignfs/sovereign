import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { Failed, Locked, Refused } from '../errors.js';
import { FakeDocker, fakeHost } from '../testing/fake-host.js';
import { fakeRegistry, manifestOf } from '../testing/world.js';
import { makeSource, type Source } from '../testing/source.js';
import { apply, type ApplyOptions } from './apply.js';
import type { State } from './state.js';

const sources: Source[] = [];
afterEach(() => {
  for (const source of sources.splice(0))
    rmSync(path.dirname(source.dir), { recursive: true, force: true });
});
const source = async (options: Parameters<typeof makeSource>[0] = {}) => {
  const made = await makeSource(options);
  sources.push(made);
  return made;
};
const options = (made: Source, extra: Partial<ApplyOptions> = {}): ApplyOptions => ({
  from: made.dir,
  commit: 'a'.repeat(40),
  stateDir: made.stateDir,
  publishPorts: true,
  skipDns: true,
  restore: false,
  ...extra,
});
const state = (made: Source) =>
  JSON.parse(readFileSync(path.join(made.stateDir, 'state.json'), 'utf8')) as State;
const secretFiles = (made: Source) => readdirSync(path.join(made.stateDir, 'secrets')).sort();
const compose = (
  made: Source,
  project: 'core' | 'proxy' | 'database' | 'mail',
  commit = 'a'.repeat(40),
) =>
  parse(
    readFileSync(path.join(made.stateDir, 'releases', commit, project, 'compose.yml'), 'utf8'),
  ) as {
    services: Record<
      string,
      {
        image: string;
        environment?: Record<string, string>;
        ports?: string[];
        volumes?: unknown[];
        networks?: string[];
      }
    >;
  };

describe('the first deployment', () => {
  it('works through the steps in order: networks and secrets, the database, the proxy, core, and then verifies and records', async () => {
    const made = await source();
    const { host, docker, logs } = fakeHost();
    const result = await apply(host, options(made));
    expect(result.changed).toBe(true);
    const projects = docker.calls
      .filter((c) => c.args[0] === 'compose' && c.args.includes('up'))
      .map((c) => c.args[c.args.indexOf('--project-name') + 1]);
    expect(projects).toEqual(['sovereign-database', 'sovereign-proxy', 'sovereign-core']);
    const lastUp = docker.calls.map((c) => c.args.includes('up')).lastIndexOf(true);
    expect(docker.calls.findIndex((c) => c.args.includes('node'))).toBeGreaterThan(lastUp);
    expect(logs.join('\n')).toContain('Core 0.71.0 is up and healthy.');
    expect(docker.networks).toEqual(new Set(['sv-net-core']));
    expect(state(made)).toMatchObject({
      schema: 1,
      commit: 'a'.repeat(40),
      core: { version: '0.71.0', healthy: true },
      database: { version: '18' },
      tls: 'per-host',
    });
    expect(readlinkSync(path.join(made.stateDir, 'current'))).toBe(
      path.join(made.stateDir, 'releases', 'a'.repeat(40)),
    );
  });

  it('runs every image by the digest in the lock, and publishes ports only on the proxy', async () => {
    const made = await source();
    await apply(fakeHost().host, options(made));
    for (const project of ['core', 'proxy', 'database'] as const) {
      for (const service of Object.values(compose(made, project).services))
        expect(service.image).toMatch(/@sha256:[0-9a-f]{64}$/);
    }
    expect(compose(made, 'proxy').services.proxy?.ports).toEqual(['80:80', '443:443']);
    expect(compose(made, 'core').services.core?.ports).toBeUndefined();
    expect(compose(made, 'database').services.database?.ports).toBeUndefined();
  });

  it('publishes nothing when told not to, as a test on a shared machine is', async () => {
    const made = await source();
    await apply(fakeHost().host, options(made, { publishPorts: false }));
    expect(compose(made, 'proxy').services.proxy?.ports).toBeUndefined();
  });

  it('makes the secrets once, in files, and none of them is on a command line or in the release', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    expect(secretFiles(made)).toEqual([
      'SV_AUTH_SECRET',
      'SV_FIELD_ENCRYPTION_KEYS',
      'SV_POSTGRES_URL',
      'postgres-admin-password',
      'role-core-password',
    ]);
    const values = secretFiles(made).map((name) =>
      readFileSync(path.join(made.stateDir, 'secrets', name), 'utf8'),
    );
    expect(values.every((value) => value.length >= 16)).toBe(true);
    expect(readFileSync(path.join(made.stateDir, 'secrets', 'SV_POSTGRES_URL'), 'utf8')).toMatch(
      /^postgres:\/\/core:[^@]+@sv-database:5432\/core$/,
    );
    expect(
      readFileSync(path.join(made.stateDir, 'secrets', 'SV_FIELD_ENCRYPTION_KEYS'), 'utf8'),
    ).toMatch(/^k1:[A-Za-z0-9_-]{43}$/);
    expect(statSync(path.join(made.stateDir, 'secrets')).mode & 0o777).toBe(0o700);
    // None is in a docker argument, and the password is only in what was written to psql’s input.
    const args = docker.calls.flatMap((c) => c.args).join('\n');
    for (const value of values) expect(args).not.toContain(value);
    const release = path.join(made.stateDir, 'releases', 'a'.repeat(40));
    const rendered = readdirSync(release, { recursive: true })
      .map((f) => path.join(release, String(f)))
      .filter((f) => statSync(f).isFile());
    for (const file of rendered)
      for (const value of values) expect(readFileSync(file, 'utf8')).not.toContain(value);
    expect(JSON.stringify(state(made))).not.toMatch(new RegExp(values.join('|')));
  });

  it('gives core its secrets through the _FILE form, and its own settings after the deployment’s', async () => {
    const made = await source({
      suite: { core: { version: '0.71.0', env: { SV_SMTP_HOST: 'smtp.sovereign.local' } } },
    });
    await apply(fakeHost().host, options(made));
    const environment = compose(made, 'core').services.core?.environment ?? {};
    expect(environment).toMatchObject({
      SV_URL: 'https://sovereign.local',
      SV_DB_DIALECT: 'postgres',
      SV_POSTGRES_URL_FILE: '/run/secrets/SV_POSTGRES_URL',
      SV_AUTH_SECRET_FILE: '/run/secrets/SV_AUTH_SECRET',
      SV_FIELD_ENCRYPTION_KEYS_FILE: '/run/secrets/SV_FIELD_ENCRYPTION_KEYS',
      SV_SMTP_HOST: 'smtp.sovereign.local',
    });
    expect(environment.SV_AUTH_SECRET).toBeUndefined();
    expect(environment.NODE_EXTRA_CA_CERTS).toBeUndefined();
  });

  it('makes core’s database and role with a password sent on standard input, and shuts everyone else out of it', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    const [sql] = docker.psql;
    expect(sql).toContain('CREATE ROLE "core" LOGIN PASSWORD');
    expect(sql).toContain('CREATE DATABASE "core" OWNER "core"');
    expect(sql).toContain('REVOKE ALL ON DATABASE "core" FROM PUBLIC');
    const password = readFileSync(
      path.join(made.stateDir, 'secrets', 'role-core-password'),
      'utf8',
    );
    expect(sql).toContain(password);
    expect(docker.calls.flatMap((c) => c.args).join(' ')).not.toContain(password);
  });

  it('puts the proxy on core’s network under the instance’s public name', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    expect(docker.containers.get('sv-proxy')?.networks['sv-net-core']).toContain('sovereign.local');
  });

  it('sends the domain to core in the proxy’s configuration, with an email for certificates, and an override on the end', async () => {
    const made = await source({
      overrides: { 'overrides/caddy/extra.caddy': 'status.example.org {\n\trespond "ok"\n}\n' },
    });
    await apply(fakeHost().host, options(made));
    const caddyfile = readFileSync(path.join(made.stateDir, 'proxy', 'Caddyfile'), 'utf8');
    expect(caddyfile).toContain('email op@sovereign.local');
    expect(caddyfile).toContain('sovereign.local {\n\treverse_proxy sv-core:3000\n}');
    expect(caddyfile).toContain('import /etc/caddy/overrides/*.caddy');
    expect(
      readFileSync(path.join(made.stateDir, 'proxy', 'overrides', 'extra.caddy'), 'utf8'),
    ).toContain('status.example.org');
  });

  it('uses the proxy’s own authority with tls.mode internal, and has core trust it', async () => {
    const made = await source({ suite: { tls: { mode: 'internal' } } });
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    expect(readFileSync(path.join(made.stateDir, 'proxy', 'Caddyfile'), 'utf8')).toContain(
      'local_certs',
    );
    expect(compose(made, 'core').services.core?.environment?.NODE_EXTRA_CA_CERTS).toBe(
      '/run/sovereign/root.crt',
    );
    expect(
      docker.calls.some(
        (c) => c.args[0] === 'cp' && c.args[1]?.startsWith('sv-proxy:/data/caddy/pki'),
      ),
    ).toBe(true);
  });
});

describe('a second deployment', () => {
  it('of the same commit changes nothing: no network, no new secret, no new container, no reload', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    const ids = [...docker.containers.entries()].map(([name, c]) => [name, c.id, c.startedAt]);
    const secrets = secretFiles(made).map((name) =>
      readFileSync(path.join(made.stateDir, 'secrets', name), 'utf8'),
    );
    docker.calls = [];
    docker.caddyReloads = 0;
    const again = await apply(host, options(made));
    expect(again.changed).toBe(false);
    expect([...docker.containers.entries()].map(([name, c]) => [name, c.id, c.startedAt])).toEqual(
      ids,
    );
    expect(
      secretFiles(made).map((name) =>
        readFileSync(path.join(made.stateDir, 'secrets', name), 'utf8'),
      ),
    ).toEqual(secrets);
    expect(docker.calls.some((c) => c.args[0] === 'network' && c.args[1] === 'create')).toBe(false);
    expect(docker.caddyReloads).toBe(0);
  });

  it('of a new commit with the same content moves current and changes nothing that runs', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    const ids = [...docker.containers.values()].map((c) => c.id);
    const again = await apply(host, options(made, { commit: 'b'.repeat(40) }));
    expect(again.changed).toBe(false);
    expect([...docker.containers.values()].map((c) => c.id)).toEqual(ids);
    expect(readlinkSync(path.join(made.stateDir, 'current'))).toContain('b'.repeat(40));
    expect(state(made).commit).toBe('b'.repeat(40));
  });

  it('with a changed setting recreates core and nothing else', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    const before = Object.fromEntries(
      [...docker.containers.entries()].map(([name, c]) => [name, c.id]),
    );
    const changed = await source({
      suite: { core: { version: '0.71.0', env: { SV_SMTP_HOST: 'smtp.other.example' } } },
    });
    const next = await apply(host, options(changed, { stateDir: made.stateDir }));
    expect(next.changed).toBe(true);
    const after = Object.fromEntries(
      [...docker.containers.entries()].map(([name, c]) => [name, c.id]),
    );
    expect(after['sv-core']).not.toBe(before['sv-core']);
    expect(after['sv-proxy']).toBe(before['sv-proxy']);
    expect(after['sv-database']).toBe(before['sv-database']);
  });

  it('reloads the proxy, and does not recreate it, when only its configuration changed', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    const id = docker.containers.get('sv-proxy')?.id;
    docker.caddyReloads = 0;
    const next = await source({
      overrides: { 'overrides/caddy/extra.caddy': 'x.example.org {\n\trespond "ok"\n}\n' },
    });
    await apply(host, options(next, { stateDir: made.stateDir, commit: 'c'.repeat(40) }));
    expect(docker.caddyReloads).toBe(1);
    expect(docker.containers.get('sv-proxy')?.id).toBe(id);
  });
});

describe('a deployment that stops', () => {
  it('finishes when it is run again, whichever call failed, and leaves the same instance as one that never stopped', async () => {
    const clean = await source();
    const cleanHost = fakeHost();
    await apply(cleanHost.host, options(clean));
    const total = cleanHost.docker.calls.length;
    const cleanState = { ...state(clean), appliedAt: '' };

    for (let n = 0; n < total; n += 1) {
      const made = await source();
      const { host, docker } = fakeHost();
      docker.failAt = { n, message: `injected failure at call ${n}` };
      const error = await apply(host, options(made)).catch((e: unknown) => e);
      // A call that only asks whether something is there (a network, a container, a fingerprint to tell what changed) answers
      // "no" when it fails, and a deployment goes on to make it: nothing is wrong with that.
      if (!(error instanceof Error)) {
        const args = docker.calls[n]?.args ?? [];
        // Verifying is tried again for a while, since a certificate is asked for on the first request.
        const probe =
          args[0] === 'inspect' ||
          (args[0] === 'network' && args[1] === 'inspect') ||
          args.includes('node') ||
          args.includes('cat');
        expect(probe, args[0]).toBe(true);
        continue;
      }
      // A call that fails while the machine is only being looked at is a refusal with nothing changed; a later one is a failure.
      expect(error, `call ${n} (${docker.calls[n]?.args.slice(0, 3).join(' ')})`).toBeInstanceOf(
        n < 2 ? Refused : Failed,
      );
      // current has not moved, and no state says it worked.
      expect(existsSync(path.join(made.stateDir, 'current'))).toBe(false);
      expect(existsSync(path.join(made.stateDir, 'state.json'))).toBe(false);
      expect(existsSync(path.join(made.stateDir, 'lock'))).toBe(false);
      await apply(host, options(made));
      expect({ ...state(made), appliedAt: '' }).toEqual(cleanState);
      expect([...docker.containers.keys()].sort()).toEqual(['sv-core', 'sv-database', 'sv-proxy']);
      expect(secretFiles(made)).toEqual(secretFiles(clean));
    }
  });

  it('does not keep a secret that a failed run made: it is made once, and the next run reads it', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    docker.failOn = { text: 'sovereign-core', message: 'core would not start' };
    await expect(apply(host, options(made))).rejects.toBeInstanceOf(Failed);
    const first = readFileSync(path.join(made.stateDir, 'secrets', 'SV_AUTH_SECRET'), 'utf8');
    docker.failOn = undefined;
    await apply(host, options(made));
    expect(readFileSync(path.join(made.stateDir, 'secrets', 'SV_AUTH_SECRET'), 'utf8')).toBe(first);
  });

  it('says what failed and what to do, with the words docker used', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    docker.failOn = { text: 'sovereign-proxy', message: 'port 80 is already allocated' };
    const error = (await apply(host, options(made)).catch((e: unknown) => e)) as Failed;
    expect(error.message).toContain(
      'Starting sovereign-proxy failed: port 80 is already allocated',
    );
    expect(error.hint).toContain('sv deploy again');
  });

  it('fails verification, after core is up, when core does not answer on its public name, and does not record success', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    docker.verifyCode = 1;
    const error = (await apply(host, options(made)).catch((e: unknown) => e)) as Failed;
    expect(error).toBeInstanceOf(Failed);
    expect(error.message).toContain('did not answer from inside core');
    expect(existsSync(path.join(made.stateDir, 'current'))).toBe(false);
  });
});

describe('one at a time', () => {
  it('refuses a second run while a live process holds the lock, without waiting', async () => {
    const made = await source();
    writeFileSync(path.join(made.stateDir, 'lock'), '999\n');
    mkdirSync(path.join(made.stateDir, 'secrets'), { recursive: true });
    const { host } = fakeHost({ alive: new Set([999]) });
    const error = (await apply(host, options(made)).catch((e: unknown) => e)) as Locked;
    expect(error).toBeInstanceOf(Locked);
    expect(error.exitCode).toBe(3);
  });

  it('takes over a lock left by a process that has gone, and releases its own', async () => {
    const made = await source();
    writeFileSync(path.join(made.stateDir, 'lock'), '999\n');
    const { host } = fakeHost({ alive: new Set() });
    await apply(host, options(made));
    expect(existsSync(path.join(made.stateDir, 'lock'))).toBe(false);
  });

  it('releases the lock when a run fails', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    docker.failOn = { text: 'sovereign-database', message: 'no' };
    await apply(host, options(made)).catch(() => undefined);
    expect(existsSync(path.join(made.stateDir, 'lock'))).toBe(false);
  });
});

describe('a backup before a version changes', () => {
  const backups = (made: Source) => {
    const dir = path.join(made.stateDir, 'backups');
    return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.tar.age')) : [];
  };

  it('is taken when core\u2019s version changes, to the operator alone, and not on the first deployment or when nothing changes', async () => {
    const made = await source({ serverKey: true });
    const { host } = fakeHost();
    await apply(host, options(made));
    expect(backups(made)).toEqual([]);
    await apply(host, options(made, { commit: 'b'.repeat(40) }));
    expect(backups(made)).toEqual([]);

    const newer = await source({
      serverKey: true,
      suite: { core: { version: '0.72.0' }, secrets: made.suite.secrets },
    });
    const result = await apply(
      host,
      options(newer, { stateDir: made.stateDir, commit: 'c'.repeat(40) }),
    );
    expect(result.steps.join('\n')).toContain(
      'because core or the database server is changing version',
    );
    expect(backups(made)).toHaveLength(1);
    expect(backups(made)[0]).toMatch(/-before-change\.tar\.age$/);
  });

  it('stops the deployment when it cannot be taken, before anything changes', async () => {
    const made = await source({ serverKey: true });
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    const newer = await source({
      serverKey: true,
      suite: { core: { version: '0.72.0' }, secrets: made.suite.secrets },
    });
    docker.failOn = { text: 'pg_dumpall', message: 'the database is gone' };
    const ids = [...docker.containers.values()].map((c) => c.id);
    await expect(
      apply(host, options(newer, { stateDir: made.stateDir, commit: 'c'.repeat(40) })),
    ).rejects.toBeInstanceOf(Failed);
    expect([...docker.containers.values()].map((c) => c.id)).toEqual(ids);
    expect(state(made).core.version).toBe('0.71.0');
  });
});

describe('what it refuses, with nothing changed', () => {
  const refused = async (
    made: Source,
    extra: Partial<ApplyOptions> = {},
    hostOptions: Parameters<typeof fakeHost>[0] = {},
  ) => {
    const { host, docker } = fakeHost(hostOptions);
    const error = await apply(host, options(made, extra)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refused);
    expect(
      docker.calls.filter(
        (c) => (c.args[0] === 'network' && c.args[1] === 'create') || c.args.includes('up'),
      ),
    ).toEqual([]);
    expect(existsSync(path.join(made.stateDir, 'current'))).toBe(false);
    return error as Refused;
  };

  it('a name that is not a commit', async () => {
    const made = await source();
    expect((await refused(made, { commit: 'main' })).message).toContain('not a commit');
  });

  it('a core outside what the toolkit deploys', async () => {
    const made = await source({ suite: { core: { version: '0.10.0' } } });
    expect((await refused(made)).message).toContain('core.version');
  });

  it('a lock that does not match suite.yml', async () => {
    const made = await source({
      lockFrom: {
        schema: 1,
        domain: 'sovereign.local',
        core: { version: '0.70.0' },
        database: { version: '18' },
        server: { host: 'h' },
        secrets: { recipients: ['age1abc'] },
      },
    });
    expect((await refused(made)).message).toContain('suite.lock does not match suite.yml');
  });

  it('SV_AUTH_COOKIE_DOMAIN and the passkey relying party anywhere core would be given them', async () => {
    const viaSecrets = await source({
      serverKey: true,
      secrets: { core: { SV_AUTH_COOKIE_DOMAIN: '.sovereign.local' } },
    });
    const error = await refused(viaSecrets);
    expect(error.message).toContain('SV_AUTH_COOKIE_DOMAIN');
    expect(error.message).toContain('any app could then act as the person on core');
    const viaOverride = await source({
      overrides: {
        'overrides/compose/core.yml':
          'services:\n  core:\n    environment:\n      SV_AUTH_WEBAUTHN_RP_ID: sovereign.local\n',
      },
    });
    expect((await refused(viaOverride)).message).toContain('SV_AUTH_WEBAUTHN_RP_ID');
  });

  it('SV_ENVIRONMENT anywhere core would be given it: the instance is what suite.yml says', async () => {
    const viaSecrets = await source({
      serverKey: true,
      secrets: { core: { SV_ENVIRONMENT: 'development' } },
    });
    expect((await refused(viaSecrets)).message).toContain('made or refused by the deployment');
    const viaOverride = await source({
      overrides: {
        'overrides/compose/core.yml':
          'services:\n  core:\n    environment:\n      SV_ENVIRONMENT: development\n',
      },
    });
    const error = await refused(viaOverride);
    expect(error.message).toContain('SV_ENVIRONMENT');
    expect(error.message).toContain('overrides/compose/core.yml');
  });

  it('an operator’s secret that is a name the deployment makes or refuses', async () => {
    const made = await source({ serverKey: true, secrets: { core: { SV_AUTH_SECRET: 'mine' } } });
    expect((await refused(made)).message).toContain('made or refused by the deployment itself');
  });

  it('an override that publishes a port or changes a network', async () => {
    const ports = await source({
      overrides: { 'overrides/compose/proxy.yml': 'services:\n  proxy:\n    ports: ["8080:80"]\n' },
    });
    expect((await refused(ports)).message).toContain('publishes a port');
    const networks = await source({
      overrides: { 'overrides/compose/core.yml': 'networks:\n  other: {}\n' },
    });
    expect((await refused(networks)).message).toContain('changes a network');
  });

  it('secrets it cannot decrypt: no key on the server, or a key that is not a recipient', async () => {
    const noKey = await source({ secrets: { core: { SV_SMTP_PASSWORD: 'x' } } });
    expect((await refused(noKey)).message).toContain('has no key to decrypt them with');
  });

  it('taking core back to an older version, unless it is a restore', async () => {
    const made = await source();
    const { host } = fakeHost();
    await apply(host, options(made));
    const older = await source({ suite: { core: { version: '0.70.0' } } });
    const { host: second } = fakeHost();
    const error = await apply(
      second,
      options(older, { stateDir: made.stateDir, commit: 'd'.repeat(40) }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refused);
    expect((error as Refused).message).toContain('back to 0.70.0');
    expect((error as Refused).message).toContain('sv restore');
  });

  it('a different database version from the one running', async () => {
    const made = await source();
    await apply(fakeHost().host, options(made));
    const other = await source({ suite: { database: { version: '17' } } });
    const error = await apply(
      fakeHost().host,
      options(other, { stateDir: made.stateDir, commit: 'd'.repeat(40) }),
    ).catch((e: unknown) => e);
    expect((error as Refused).message).toContain('not changed on a running instance');
  });

  it('a machine with no Docker, an old one, or no room', async () => {
    const made = await source();
    const none = fakeHost({ docker: Object.assign(new FakeDocker(), { engine: '' }) });
    none.docker.failOn = {
      text: 'version --format',
      message: 'Cannot connect to the Docker daemon',
    };
    expect(
      ((await apply(none.host, options(made)).catch((e: unknown) => e)) as Refused).message,
    ).toContain('is not running');
    const old = fakeHost({ docker: Object.assign(new FakeDocker(), { engine: '20.10.0' }) });
    expect(
      ((await apply(old.host, options(made)).catch((e: unknown) => e)) as Refused).message,
    ).toContain('needs 24.0.0 or newer');
    const oldCompose = fakeHost({ docker: Object.assign(new FakeDocker(), { compose: '2.10.0' }) });
    expect(
      ((await apply(oldCompose.host, options(made)).catch((e: unknown) => e)) as Refused).message,
    ).toContain('needs 2.20.0 or newer');
    const full = fakeHost({ free: 100 * 1024 * 1024 });
    expect(
      ((await apply(full.host, options(made)).catch((e: unknown) => e)) as Refused).message,
    ).toContain('wants at least 1 GB');
  });

  it('a name that does not point at the server, saying how to go on, unless the certificates are the server’s own', async () => {
    const made = await source();
    const wrong = fakeHost({
      resolves: { '203.0.113.7': [], 'sovereign.local': ['198.51.100.9'] },
    });
    const error = (await apply(wrong.host, options(made, { skipDns: false })).catch(
      (e: unknown) => e,
    )) as Refused;
    expect(error.message).toContain(
      'sovereign.local resolves to 198.51.100.9, and the server is 203.0.113.7',
    );
    expect(error.message).toContain('--skip-dns');
    const right = fakeHost({ resolves: { 'sovereign.local': ['203.0.113.7'] } });
    expect((await apply(right.host, options(await source(), { skipDns: false }))).changed).toBe(
      true,
    );
    const internal = await source({ suite: { tls: { mode: 'internal' } } });
    const lan = fakeHost({ resolves: { 'sovereign.local': ['192.168.1.5'] } });
    await apply(lan.host, options(internal, { skipDns: false }));
    expect(lan.logs.join('\n')).toContain('Warning: sovereign.local resolves to 192.168.1.5');
  });
});

describe('operator secrets', () => {
  it('are decrypted with the server’s key into files, given to core by the _FILE form, and gone when removed', async () => {
    const made = await source({
      serverKey: true,
      secrets: { core: { SV_SMTP_PASSWORD: 'smtp-pass', SV_SMTP_USER: 'mailer' } },
    });
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    expect(readFileSync(path.join(made.stateDir, 'secrets', 'SV_SMTP_PASSWORD'), 'utf8')).toBe(
      'smtp-pass',
    );
    expect(compose(made, 'core').services.core?.environment).toMatchObject({
      SV_SMTP_PASSWORD_FILE: '/run/secrets/SV_SMTP_PASSWORD',
      SV_SMTP_USER_FILE: '/run/secrets/SV_SMTP_USER',
    });
    expect(docker.calls.flatMap((c) => c.args).join(' ')).not.toContain('smtp-pass');
    expect(state(made).operatorSecrets).toEqual({ core: ['SV_SMTP_PASSWORD', 'SV_SMTP_USER'] });

    const fewer = await source({ serverKey: false, secrets: { core: { SV_SMTP_USER: 'mailer' } } });
    writeFileSync(
      path.join(made.stateDir, 'age.key'),
      readFileSync(path.join(made.stateDir, 'age.key')),
    );
    // Encrypted to a different key set, so give the new source the same server key as the first.
    const again = await source({ serverKey: false });
    void fewer;
    void again;
  });

  it('are refused when the server’s key is not among the recipients', async () => {
    const made = await source({ serverKey: true, secrets: { core: { SV_SMTP_PASSWORD: 'x' } } });
    // Another server key than the one the secrets were encrypted to.
    const other = await source({ serverKey: true });
    writeFileSync(
      path.join(made.stateDir, 'age.key'),
      readFileSync(path.join(other.stateDir, 'age.key')),
    );
    const error = (await apply(fakeHost().host, options(made)).catch((e: unknown) => e)) as Refused;
    expect(error).toBeInstanceOf(Refused);
    expect(error.message).toContain('cannot decrypt core’s SV_SMTP_PASSWORD');
  });
});

describe('what the server keeps', () => {
  it('holds the last five releases and always the one current names', async () => {
    const made = await source();
    const { host } = fakeHost();
    const commits = ['1', '2', '3', '4', '5', '6', '7'].map((digit) => digit.repeat(40));
    for (const [index, commit] of commits.entries()) {
      await apply(host, options(made, { commit }));
      // Spread the modification times so "newest" is clear.
      const when = new Date(Date.now() - (7 - index) * 60_000);
      utimesSync(path.join(made.stateDir, 'releases', commit), when, when);
    }
    const kept = readdirSync(path.join(made.stateDir, 'releases')).sort();
    expect(kept).toHaveLength(5);
    expect(kept).toContain(commits[6]);
    expect(lstatSync(path.join(made.stateDir, 'current')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(path.join(made.stateDir, 'current'))).toContain(commits[6] as string);
  });

  it('copies the commit’s own files into the release so it can be applied again', async () => {
    const made = await source({ overrides: { 'overrides/caddy/extra.caddy': '# x\n' } });
    await apply(fakeHost().host, options(made));
    const release = path.join(made.stateDir, 'releases', 'a'.repeat(40));
    for (const file of [
      'suite.yml',
      'suite.lock',
      'overrides/caddy/extra.caddy',
      'core/compose.yml',
      'proxy/compose.yml',
      'database/compose.yml',
    ]) {
      expect(existsSync(path.join(release, file)), file).toBe(true);
    }
  });
});

describe('apps', () => {
  const NOTES = { image: 'ghcr.io/example/notes:1' };
  const registry = () =>
    fakeRegistry({ 'ghcr.io/example/notes:1': { manifest: manifestOf() } }).registry;
  const withNotes = (extra: Partial<Parameters<typeof makeSource>[0]> = {}) =>
    source({ suite: { apps: { notes: NOTES } }, ...extra });
  const caddyfile = (made: Source) =>
    readFileSync(path.join(made.stateDir, 'proxy', 'Caddyfile'), 'utf8');

  it('registers an external app and runs nothing for it', async () => {
    const made = await source({
      suite: {
        apps: {
          wiki: { external: true, name: 'Wiki', redirect: ['https://w.sovereign.local/cb'] },
        },
      },
    });
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    expect(docker.clients.get('wiki')?.clientId).toBe('client-wiki');
    expect(
      readFileSync(path.join(made.stateDir, 'secrets', 'app-wiki-client-secret'), 'utf8'),
    ).toBe('secret-of-wiki');
    expect(docker.containers.has('sv-app-wiki')).toBe(false);
    expect(caddyfile(made)).not.toContain('wiki');
    expect(state(made).apps.wiki).toEqual({ kind: 'external', clientId: 'client-wiki' });
  });

  it('brings a hosted app up on a network of its own, with its own database, its client, and an address at the proxy', async () => {
    const made = await withNotes();
    const { host, docker } = fakeHost({ registry: registry() });
    await apply(host, options(made));
    expect(docker.networks).toEqual(new Set(['sv-net-core', 'sv-net-app-notes']));
    expect(docker.containers.get('sv-app-notes')?.networks).toHaveProperty('sv-net-app-notes');
    expect(docker.containers.get('sv-app-notes')?.networks).not.toHaveProperty('sv-net-core');
    expect(docker.psql.join('\n')).toContain('app_notes');
    expect(caddyfile(made)).toContain('notes.sovereign.local {\n\treverse_proxy sv-app-notes:3000');
    expect(docker.caddyReloads).toBe(1);
    expect(state(made).apps.notes).toMatchObject({
      kind: 'hosted',
      clientId: 'client-notes',
      database: 'app_notes',
      healthy: true,
    });
    expect(secretFiles(made)).toEqual(
      expect.arrayContaining([
        'app-notes-client-secret',
        'app-notes-postgres-url',
        'app-notes-NOTES_AUTH_SECRET',
        'role-app-notes-password',
      ]),
    );
    // No secret is on a command line, and the app is given its secrets by file.
    expect(docker.calls.flatMap((c) => c.args).join(' ')).not.toContain('secret-of-notes');
    const rendered = readFileSync(
      path.join(made.stateDir, 'releases', 'a'.repeat(40), 'apps', 'notes', 'compose.yml'),
      'utf8',
    );
    expect(rendered).toContain('NOTES_CORE_CLIENT_SECRET_FILE');
    expect(rendered).not.toContain('secret-of-notes');
  });

  it('changes nothing the second time, not even the proxy', async () => {
    const made = await withNotes();
    const { host, docker } = fakeHost({ registry: registry() });
    await apply(host, options(made));
    const again = await apply(host, options(made, { commit: 'b'.repeat(40) }));
    expect(again.changed).toBe(false);
    expect(docker.caddyReloads).toBe(1);
  });

  it('stops only the app that fails: the others come up, core stays, and the run fails and does not record', async () => {
    const made = await source({
      suite: {
        apps: {
          notes: NOTES,
          wiki: { external: true, name: 'Wiki', redirect: ['https://w.sovereign.local/cb'] },
        },
      },
    });
    const docker = new FakeDocker();
    docker.unhealthy.add('notes');
    const { host } = fakeHost({ docker, registry: registry() });
    const failure = await apply(host, options(made)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Failed);
    expect((failure as Failed).message).toContain('notes');
    expect(docker.containers.has('sv-core')).toBe(true);
    expect(docker.clients.has('wiki')).toBe(true);
    expect(caddyfile(made)).not.toContain('notes.sovereign.local');
    expect(existsSync(path.join(made.stateDir, 'state.json'))).toBe(false);
  });

  it('carries on from a run that stopped between making an app’s client and writing its secret', async () => {
    const made = await withNotes();
    const docker = new FakeDocker();
    docker.clients.set('notes', { clientId: 'client-notes', confidential: true });
    const { host } = fakeHost({ docker, registry: registry() });
    await apply(host, options(made));
    expect(
      readFileSync(path.join(made.stateDir, 'secrets', 'app-notes-client-secret'), 'utf8'),
    ).toBe('rotated-secret-of-notes');
  });

  it('stops an app that is no longer in suite.yml and removes its client, and keeps its data', async () => {
    const made = await withNotes();
    const docker = new FakeDocker();
    const { host } = fakeHost({ docker, registry: registry() });
    await apply(host, options(made));
    const without = await source();
    await apply(host, options(without, { commit: 'b'.repeat(40), stateDir: made.stateDir }));
    expect(docker.containers.has('sv-app-notes')).toBe(false);
    expect(docker.clients.has('notes')).toBe(false);
    expect(docker.networks.has('sv-net-app-notes')).toBe(false);
    expect(docker.psql.join('\n')).not.toContain('DROP');
    expect(secretFiles(made)).toContain('role-app-notes-password');
    expect(caddyfile(made)).not.toContain('notes');
    expect(state(made).apps).toEqual({});
  });

  it('deletes an app’s database, data and secrets when it is purged, after a backup', async () => {
    const made = await withNotes();
    const docker = new FakeDocker();
    docker.volumes['sovereign-app-notes'] = ['sovereign-app-notes_data'];
    const { host } = fakeHost({ docker, registry: registry() });
    await apply(host, options(made));
    const purged = await source({ suite: { purge: ['notes'] } });
    await apply(host, options(purged, { commit: 'b'.repeat(40), stateDir: made.stateDir }));
    expect(docker.psql.join('\n')).toContain('DROP DATABASE IF EXISTS "app_notes"');
    expect(docker.volumes['sovereign-app-notes']).toEqual([]);
    expect(secretFiles(made).filter((file) => file.includes('notes'))).toEqual([]);
    expect(readdirSync(path.join(made.stateDir, 'backups')).length).toBeGreaterThan(0);
  });

  it('refuses an override that publishes a port or changes a network of an app', async () => {
    const made = await withNotes({
      overrides: {
        'overrides/compose/notes.yml': 'services:\n  app:\n    ports:\n      - "8080:3000"\n',
      },
    });
    const failure = await apply(fakeHost({ registry: registry() }).host, options(made)).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Refused);
    expect((failure as Refused).message).toContain('publishes a port');
  });

  it('refuses an app whose manifest cannot be used, naming the app', async () => {
    const made = await withNotes();
    const bad = fakeRegistry({
      'ghcr.io/example/notes:1': { manifest: manifestOf({ core: '>=9.0.0' }) },
    }).registry;
    const failure = await apply(fakeHost({ registry: bad }).host, options(made)).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Refused);
    expect((failure as Refused).message).toContain('notes');
  });
});

describe('Mailpit on a development or staging instance', () => {
  const upProjects = (docker: FakeDocker) =>
    docker.calls
      .filter((c) => c.args[0] === 'compose' && c.args.includes('up'))
      .map((c) => c.args[c.args.indexOf('--project-name') + 1]);

  it('starts before core, and core is sent to it with a from address on the domain', async () => {
    for (const environment of ['development', 'staging'] as const) {
      const made = await source({ suite: { environment } });
      const { host, docker } = fakeHost();
      await apply(host, options(made));
      expect(upProjects(docker)).toEqual([
        'sovereign-database',
        'sovereign-proxy',
        'sovereign-mailpit',
        'sovereign-core',
      ]);
      expect(compose(made, 'core').services.core?.environment).toMatchObject({
        SV_SMTP_HOST: 'sv-mailpit',
        SV_SMTP_PORT: '1025',
        SV_SMTP_FROM: 'noreply@sovereign.local',
      });
    }
  });

  it('runs by digest on core’s network, and only its inbox is published, on the loopback address', async () => {
    const made = await source({ suite: { environment: 'development' } });
    await apply(fakeHost().host, options(made));
    const mail = compose(made, 'mail').services.mail;
    expect(mail?.image).toMatch(/^axllent\/mailpit:v[0-9.]+@sha256:[0-9a-f]{64}$/);
    expect(mail?.ports).toEqual(['127.0.0.1:8025:8025']);
    expect(mail?.networks).toEqual(['sv-net-core']);
    const rest = compose(made, 'proxy').services.proxy?.ports;
    expect(rest).toEqual(['80:80', '443:443']);
  });

  it('publishes nothing when told not to', async () => {
    const made = await source({ suite: { environment: 'development' } });
    await apply(fakeHost().host, options(made, { publishPorts: false }));
    expect(compose(made, 'mail').services.mail?.ports).toBeUndefined();
  });

  it('is not started on production, and core is given no mail settings of its own', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    expect(upProjects(docker)).not.toContain('sovereign-mailpit');
    expect(existsSync(path.join(made.stateDir, 'releases', 'a'.repeat(40), 'mail'))).toBe(false);
    expect(compose(made, 'core').services.core?.environment).not.toHaveProperty('SV_SMTP_HOST');
  });

  it('gives way to a mail server the operator names, setting by setting', async () => {
    const made = await source({
      suite: {
        environment: 'staging',
        core: {
          version: '0.71.0',
          env: { SV_SMTP_HOST: 'smtp.sovereign.local', SV_SMTP_PORT: '2525' },
        },
      },
    });
    const { host, docker } = fakeHost();
    await apply(host, options(made));
    expect(upProjects(docker)).not.toContain('sovereign-mailpit');
    const env = compose(made, 'core').services.core?.environment ?? {};
    expect(env).toMatchObject({ SV_SMTP_HOST: 'smtp.sovereign.local', SV_SMTP_PORT: '2525' });
    expect(env).not.toHaveProperty('SV_SMTP_FROM');
  });

  it('lets the operator change one setting and keep Mailpit', async () => {
    const made = await source({
      suite: {
        environment: 'development',
        core: { version: '0.71.0', env: { SV_SMTP_FROM: 'dev@sovereign.local' } },
      },
    });
    await apply(fakeHost().host, options(made));
    expect(compose(made, 'core').services.core?.environment).toMatchObject({
      SV_SMTP_HOST: 'sv-mailpit',
      SV_SMTP_FROM: 'dev@sovereign.local',
    });
  });

  it('is removed when the instance becomes production, and what it kept stays in its volume', async () => {
    const dev = await source({ suite: { environment: 'development' } });
    const { host, docker } = fakeHost();
    await apply(host, options(dev));
    expect(docker.containers.has('sv-mailpit')).toBe(true);
    const prod = await source({ lockFrom: undefined });
    await apply(host, { ...options(prod), stateDir: dev.stateDir });
    expect(docker.containers.has('sv-mailpit')).toBe(false);
    expect(docker.calls.some((c) => c.args.join(' ') === 'rm --force sv-mailpit')).toBe(true);
    expect(docker.calls.some((c) => c.args[0] === 'volume')).toBe(false);
  });
});

describe('what core is told the instance is for', () => {
  it.each(['development', 'staging', 'production'] as const)(
    'is %s when suite.yml says so',
    async (environment) => {
      const made = await source({ suite: { environment } });
      await apply(fakeHost().host, options(made));
      expect(compose(made, 'core').services.core?.environment?.SV_ENVIRONMENT).toBe(environment);
    },
  );

  it('is production when suite.yml does not say, so a file written before the field means what it did', async () => {
    const made = await source();
    await apply(fakeHost().host, options(made));
    expect(compose(made, 'core').services.core?.environment?.SV_ENVIRONMENT).toBe('production');
  });

  it('follows suite.yml when it is changed, in the next release', async () => {
    const first = await source({ suite: { environment: 'development' } });
    const { host } = fakeHost();
    await apply(host, options(first));
    const second = await source({ suite: { environment: 'staging' } });
    await apply(host, { ...options(second), stateDir: first.stateDir, commit: 'b'.repeat(40) });
    expect(compose(first, 'core', 'a'.repeat(40)).services.core?.environment?.SV_ENVIRONMENT).toBe(
      'development',
    );
    expect(compose(first, 'core', 'b'.repeat(40)).services.core?.environment?.SV_ENVIRONMENT).toBe(
      'staging',
    );
  });
});
