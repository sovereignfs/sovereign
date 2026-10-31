import { stringify } from 'yaml';
import type { Digest, Lock, Manifest, Suite } from '../suite/types.js';
import {
  CA_DIR_IN_CONTAINER,
  CA_IN_CONTAINER,
  CONTAINER,
  NETWORK,
  PROJECT,
  SECRETS_IN_CONTAINER,
} from './names.js';

/** An image, by the digest the lock pins, so a moved tag cannot change what runs (operator-cli §5). */
export function byDigest(image: Digest): string {
  return `${image.ref}@${image.digest}`;
}

/** The images to run, by the digest the lock pins unless a test says otherwise. */
export type ImageOverrides = Partial<Record<'core' | 'proxy' | 'database' | 'cli', string>> & {
  /** Images for hosted apps, by name. */
  apps?: Record<string, string>;
};

export type BaseInput = {
  /** Used by tests that run a locally built image, which has no registry digest. Nothing in the toolkit sets it. */
  imageOverrides?: ImageOverrides;
  suite: Suite;
  lock: Lock;
  /** The server’s state directory, where secrets and the proxy’s own files live at paths that do not change between deployments. */
  stateDir: string;
  publishPorts: boolean;
  /** Names of the secret files core is given, from the server and from the operator, each at `<stateDir>/secrets/<name>`. */
  coreSecrets: string[];
  /** Whether containers must trust the proxy’s own authority (`tls.mode: internal`). */
  internalCa: boolean;
  /** Every network the proxy and the database server are on besides core’s, and the public names the proxy answers to. */
  names: string[];
};

const yaml = (document: unknown) => stringify(document, { lineWidth: 0 });

/** The public names of the instance: core’s own, and one for each hosted app (operator-cli §6.4). */
export function publicNames(suite: Suite): { core: string; apps: Record<string, string> } {
  const apps: Record<string, string> = {};
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    if (!('external' in app)) apps[name] = `${name}.${suite.domain}`;
  }
  return { core: suite.domain, apps };
}

/** Core’s environment: what the deployment provides, then the operator’s own settings, which may not set what the deployment provides. */
export function coreEnvironment(input: BaseInput): Record<string, string> {
  const { suite, coreSecrets, internalCa } = input;
  const env: Record<string, string> = {
    ...(suite.core.env ?? {}),
    SV_URL: `https://${suite.domain}`,
    SV_DB_DIALECT: 'postgres',
    SV_POSTGRES_URL_FILE: `${SECRETS_IN_CONTAINER}/SV_POSTGRES_URL`,
    SV_AUTH_SECRET_FILE: `${SECRETS_IN_CONTAINER}/SV_AUTH_SECRET`,
    SV_FIELD_ENCRYPTION_KEYS_FILE: `${SECRETS_IN_CONTAINER}/SV_FIELD_ENCRYPTION_KEYS`,
  };
  for (const name of coreSecrets) {
    if (!(name in GENERATED_FOR_CORE)) env[`${name}_FILE`] = `${SECRETS_IN_CONTAINER}/${name}`;
  }
  if (internalCa) env.NODE_EXTRA_CA_CERTS = CA_IN_CONTAINER;
  return env;
}

/** The secrets the server makes for core, which an operator’s secrets must not repeat. */
export const GENERATED_FOR_CORE: Record<string, true> = {
  SV_POSTGRES_URL: true,
  SV_AUTH_SECRET: true,
  SV_FIELD_ENCRYPTION_KEYS: true,
};

/** core’s compose project. The environment is inline and every mount is at a path that does not change, so a deployment that changes nothing recreates nothing. */
export function coreCompose(input: BaseInput): string {
  const { lock, stateDir, coreSecrets, internalCa } = input;
  const volumes = coreSecrets.map((name) => ({
    type: 'bind',
    source: `${stateDir}/secrets/${name}`,
    target: `${SECRETS_IN_CONTAINER}/${name}`,
    read_only: true,
  }));
  if (internalCa) {
    volumes.push({
      type: 'bind',
      source: `${stateDir}/pki`,
      target: CA_DIR_IN_CONTAINER,
      read_only: true,
    });
  }
  return yaml({
    name: PROJECT.core,
    services: {
      core: {
        image: input.imageOverrides?.core ?? byDigest(lock.images.core),
        container_name: CONTAINER.core,
        restart: 'unless-stopped',
        environment: coreEnvironment(input),
        volumes,
        networks: [NETWORK.core],
      },
    },
    networks: { [NETWORK.core]: { external: true } },
  });
}

/** The database server: one for the instance, on core’s network, with the other networks joined by `sv apply` itself. */
export function databaseCompose(input: BaseInput): string {
  const { lock, stateDir } = input;
  return yaml({
    name: PROJECT.database,
    services: {
      database: {
        image: input.imageOverrides?.database ?? byDigest(lock.images.database),
        container_name: CONTAINER.database,
        restart: 'unless-stopped',
        environment: {
          POSTGRES_USER: 'sovereign',
          POSTGRES_DB: 'postgres',
          POSTGRES_PASSWORD_FILE: `${SECRETS_IN_CONTAINER}/postgres-admin-password`,
        },
        volumes: [
          'postgres-data:/var/lib/postgresql',
          {
            type: 'bind',
            source: `${stateDir}/secrets/postgres-admin-password`,
            target: `${SECRETS_IN_CONTAINER}/postgres-admin-password`,
            read_only: true,
          },
        ],
        healthcheck: {
          test: ['CMD-SHELL', 'pg_isready -U sovereign -d postgres'],
          interval: '5s',
          timeout: '5s',
          retries: 12,
          start_period: '10s',
        },
        networks: [NETWORK.core],
      },
    },
    networks: { [NETWORK.core]: { external: true } },
    volumes: { 'postgres-data': {} },
  });
}

/** The proxy: the only container that publishes a port, and the one every public name leads to. */
export function proxyCompose(input: BaseInput): string {
  const { lock, stateDir, publishPorts } = input;
  return yaml({
    name: PROJECT.proxy,
    services: {
      proxy: {
        image: input.imageOverrides?.proxy ?? byDigest(lock.images.proxy),
        container_name: CONTAINER.proxy,
        restart: 'unless-stopped',
        ...(publishPorts ? { ports: ['80:80', '443:443'] } : {}),
        volumes: [
          'caddy-data:/data',
          'caddy-config:/config',
          // The folder, not the Caddyfile: a file mounted alone goes stale in the container when it is replaced, and it is replaced
          // each time it changes.
          {
            type: 'bind',
            source: `${stateDir}/proxy`,
            target: '/etc/caddy',
            read_only: true,
          },
        ],
        healthcheck: {
          test: ['CMD', 'wget', '-q', '--spider', 'http://127.0.0.1:2019/config/'],
          interval: '5s',
          timeout: '5s',
          retries: 12,
          start_period: '5s',
        },
        networks: [NETWORK.core],
      },
    },
    networks: { [NETWORK.core]: { external: true } },
    volumes: { 'caddy-data': {}, 'caddy-config': {} },
  });
}

/**
 * The proxy’s configuration: one site for core and one for each hosted app, each sent to its container by name on its network. TLS
 * ends here (operator-cli §6.4). With `internal`, certificates are made by the proxy’s own authority, for a machine with no public port.
 */
export function caddyfile(
  suite: Suite,
  upstreams: { host: string; container: string; port: number }[],
): string {
  const global: string[] = [];
  if (suite.tls?.mode === 'internal') {
    global.push('\tlocal_certs', '\tskip_install_trust');
  } else if (suite.tls?.email) {
    global.push(`\temail ${suite.tls.email}`);
  }
  const sites = upstreams
    .map(({ host, container, port }) => `${host} {\n\treverse_proxy ${container}:${port}\n}\n`)
    .join('\n');
  return [
    '# Written by sv apply. Do not edit it: the next deployment writes it again.',
    ...(global.length > 0 ? ['{', ...global, '}', ''] : ['']),
    sites,
    'import /etc/caddy/overrides/*.caddy',
    '',
  ].join('\n');
}

/** What a hosted app is given to run with (spec/app-manifest.md §3), and what it needs mounted. */
export type AppInput = {
  name: string;
  suite: Suite;
  /** The image, by the digest the lock pins unless a test says otherwise. */
  image: string;
  manifest: Manifest;
  clientId: string;
  stateDir: string;
  /** Names of the secret files in `secrets/`, by the variable each is given as, for this app. */
  secrets: Record<string, string>;
  internalCa: boolean;
};

/** The public address of an app: a subdomain of the instance's domain. */
export const appOrigin = (suite: Suite, name: string) => `https://${name}.${suite.domain}`;

/**
 * An app's environment (spec/app-manifest.md §3): its address, core's, its client ID, and its secrets by their `_FILE` form, then the
 * operator's own settings, which may not set what the deployment provides.
 */
export function appEnvironment(input: AppInput): Record<string, string> {
  const { suite, name, manifest, clientId, secrets, internalCa } = input;
  const prefix = manifest.prefix;
  const env: Record<string, string> = {};
  const app = suite.apps?.[name];
  if (app && !('external' in app)) Object.assign(env, app.env ?? {});
  Object.assign(env, {
    [`${prefix}_URL`]: appOrigin(suite, name),
    [`${prefix}_CORE_URL`]: `https://${suite.domain}`,
    [`${prefix}_CORE_CLIENT_ID`]: clientId,
  });
  if (manifest.database) env[`${prefix}_DB_DIALECT`] = 'postgres';
  for (const variable of Object.keys(secrets))
    env[`${variable}_FILE`] = `${SECRETS_IN_CONTAINER}/${variable}`;
  if (internalCa) env.NODE_EXTRA_CA_CERTS = CA_IN_CONTAINER;
  return env;
}

/** A hosted app's compose project: its own, so it can be started, upgraded and removed alone (operator-cli §6.4). */
export function appCompose(input: AppInput): string {
  const { name, stateDir, manifest, secrets, internalCa } = input;
  const volumes: unknown[] = Object.entries(secrets).map(([variable, file]) => ({
    type: 'bind',
    source: `${stateDir}/secrets/${file}`,
    target: `${SECRETS_IN_CONTAINER}/${variable}`,
    read_only: true,
  }));
  if (internalCa)
    volumes.push({
      type: 'bind',
      source: `${stateDir}/pki`,
      target: CA_DIR_IN_CONTAINER,
      read_only: true,
    });
  const named: Record<string, object> = {};
  (manifest.data ?? []).forEach((target, index) => {
    named[`data-${index}`] = {};
    volumes.push({ type: 'volume', source: `data-${index}`, target });
  });
  return yaml({
    name: PROJECT.app(name),
    services: {
      app: {
        image: input.image,
        container_name: CONTAINER.app(name),
        restart: 'unless-stopped',
        environment: appEnvironment(input),
        volumes,
        networks: [NETWORK.app(name)],
        stop_grace_period: '30s',
      },
    },
    networks: { [NETWORK.app(name)]: { external: true } },
    ...(Object.keys(named).length > 0 ? { volumes: named } : {}),
  });
}
