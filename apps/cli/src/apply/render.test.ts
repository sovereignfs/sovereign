import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { RELEASE } from '../release.js';
import { refreshedLock } from '../suite/lock.js';
import type { Suite } from '../suite/types.js';
import {
  byDigest,
  caddyfile,
  coreCompose,
  coreEnvironment,
  databaseCompose,
  proxyCompose,
  publicNames,
  type BaseInput,
} from './render.js';

const suite = (extra: Partial<Suite> = {}): Suite => ({
  schema: 1,
  domain: 'sovereign.example.com',
  core: { version: '0.71.0' },
  database: { version: '18' },
  server: { host: '203.0.113.7' },
  secrets: { recipients: ['age1zvkyg2lqzraa2lnjvqej32nkuu0ues2s82hzrye869xeexvn73equnujwj'] },
  ...extra,
});
const input = async (s: Suite, extra: Partial<BaseInput> = {}): Promise<BaseInput> => ({
  suite: s,
  lock: await refreshedLock(
    s,
    undefined,
    async (ref) => `sha256:${Buffer.from(ref).toString('hex').padEnd(64, '0').slice(0, 64)}`,
  ),
  stateDir: '/var/lib/sovereign',
  publishPorts: true,
  coreSecrets: ['SV_POSTGRES_URL', 'SV_AUTH_SECRET', 'SV_FIELD_ENCRYPTION_KEYS'],
  internalCa: false,
  names: ['sovereign.example.com'],
  ...extra,
});

describe('the images', () => {
  it('are named with the tag and the digest, so a moved tag runs nothing else', async () => {
    const i = await input(suite());
    expect(byDigest(i.lock.images.core)).toMatch(
      /^ghcr\.io\/sovereignfs\/sovereign:0\.71\.0@sha256:[0-9a-f]{64}$/,
    );
    expect(byDigest(i.lock.images.proxy)).toContain(RELEASE.images.proxy);
  });
});

describe('the public names', () => {
  it('are the domain for core and a subdomain for each hosted app, and an external app has none', () => {
    expect(
      publicNames(
        suite({
          apps: {
            notes: { image: 'ghcr.io/e/notes:1' },
            wiki: { external: true, name: 'W', redirect: ['https://w.example.com/cb'] },
          },
        }),
      ),
    ).toEqual({ core: 'sovereign.example.com', apps: { notes: 'notes.sovereign.example.com' } });
  });
});

describe('core', () => {
  it('is given its own address, Postgres, and every secret by the _FILE form', async () => {
    const env = coreEnvironment(await input(suite()));
    expect(env).toMatchObject({
      SV_URL: 'https://sovereign.example.com',
      SV_DB_DIALECT: 'postgres',
    });
    for (const name of ['SV_POSTGRES_URL', 'SV_AUTH_SECRET', 'SV_FIELD_ENCRYPTION_KEYS']) {
      expect(env[`${name}_FILE`]).toBe(`/run/secrets/${name}`);
      expect(env[name]).toBeUndefined();
    }
  });

  it('cannot have the operator’s environment override what the deployment provides', async () => {
    const env = coreEnvironment(
      await input(
        suite({
          core: {
            version: '0.71.0',
            env: { SV_URL: 'https://evil.example', SV_DB_DIALECT: 'sqlite', SV_SMTP_HOST: 'smtp' },
          },
        }),
      ),
    );
    expect(env.SV_URL).toBe('https://sovereign.example.com');
    expect(env.SV_DB_DIALECT).toBe('postgres');
    expect(env.SV_SMTP_HOST).toBe('smtp');
  });

  it('gets an operator’s secret by its _FILE form, mounted read-only', async () => {
    const i = await input(suite(), {
      coreSecrets: [
        'SV_POSTGRES_URL',
        'SV_AUTH_SECRET',
        'SV_FIELD_ENCRYPTION_KEYS',
        'SV_SMTP_PASSWORD',
      ],
    });
    expect(coreEnvironment(i).SV_SMTP_PASSWORD_FILE).toBe('/run/secrets/SV_SMTP_PASSWORD');
    const mounts = (
      parse(coreCompose(i)) as {
        services: { core: { volumes: { source: string; target: string; read_only: boolean }[] } };
      }
    ).services.core.volumes;
    expect(mounts.find((m) => m.target === '/run/secrets/SV_SMTP_PASSWORD')).toEqual({
      type: 'bind',
      source: '/var/lib/sovereign/secrets/SV_SMTP_PASSWORD',
      target: '/run/secrets/SV_SMTP_PASSWORD',
      read_only: true,
    });
    expect(mounts.every((m) => m.read_only)).toBe(true);
  });

  it('trusts the proxy’s own authority only when the certificates are the proxy’s own', async () => {
    const plain = await input(suite());
    expect(coreCompose(plain)).not.toContain('NODE_EXTRA_CA_CERTS');
    const internal = await input(suite({ tls: { mode: 'internal' } }), { internalCa: true });
    expect(coreCompose(internal)).toContain('NODE_EXTRA_CA_CERTS: /run/sovereign/root.crt');
    expect(coreCompose(internal)).toContain('/var/lib/sovereign/pki');
  });
});

describe('the containers and networks', () => {
  it('publish ports on the proxy alone, and only when asked', async () => {
    const i = await input(suite());
    expect(
      (parse(proxyCompose(i)) as { services: { proxy: { ports?: string[] } } }).services.proxy
        .ports,
    ).toEqual(['80:80', '443:443']);
    expect(
      (
        parse(proxyCompose({ ...i, publishPorts: false })) as {
          services: { proxy: { ports?: string[] } };
        }
      ).services.proxy.ports,
    ).toBeUndefined();
    for (const text of [coreCompose(i), databaseCompose(i)]) expect(text).not.toContain('ports:');
  });

  it('have fixed names and sit on core’s network, which already exists', async () => {
    const i = await input(suite());
    for (const [text, name] of [
      [coreCompose(i), 'sv-core'],
      [databaseCompose(i), 'sv-database'],
      [proxyCompose(i), 'sv-proxy'],
    ] as const) {
      const document = parse(text) as {
        services: Record<string, { container_name: string; networks: string[] }>;
        networks: Record<string, { external: boolean }>;
      };
      expect(Object.values(document.services)[0]?.container_name).toBe(name);
      expect(Object.values(document.services)[0]?.networks).toEqual(['sv-net-core']);
      expect(document.networks['sv-net-core']).toEqual({ external: true });
    }
  });

  it('give the database its password from a file and a volume that survives the container', async () => {
    const database = parse(databaseCompose(await input(suite()))) as {
      services: { database: { environment: Record<string, string>; volumes: unknown[] } };
      volumes: Record<string, unknown>;
    };
    expect(database.services.database.environment.POSTGRES_PASSWORD_FILE).toBe(
      '/run/secrets/postgres-admin-password',
    );
    expect(database.services.database.environment.POSTGRES_PASSWORD).toBeUndefined();
    expect(database.volumes).toHaveProperty('postgres-data');
  });
});

describe('the proxy’s configuration', () => {
  it('has a site for each name, sent to its container, and the operator’s own sites last', () => {
    const text = caddyfile(suite({ tls: { mode: 'per-host', email: 'op@example.com' } }), [
      { host: 'sovereign.example.com', container: 'sv-core', port: 3000 },
      { host: 'notes.sovereign.example.com', container: 'sv-app-notes', port: 8080 },
    ]);
    expect(text).toContain('email op@example.com');
    expect(text).toContain('notes.sovereign.example.com {\n\treverse_proxy sv-app-notes:8080\n}');
    expect(text.trimEnd().endsWith('import /etc/caddy/overrides/*.caddy')).toBe(true);
  });

  it('uses its own authority when the machine has no public port, and says not to edit the file', () => {
    const text = caddyfile(suite({ tls: { mode: 'internal' } }), [
      { host: 'sovereign.example.com', container: 'sv-core', port: 3000 },
    ]);
    expect(text).toContain('local_certs');
    expect(text).toContain('skip_install_trust');
    expect(text).not.toContain('email');
    expect(text.split('\n')[0]).toContain('Do not edit it');
  });
});
