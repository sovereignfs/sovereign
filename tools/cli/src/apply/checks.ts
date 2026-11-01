import { gt, satisfies } from 'semver';
import { Refused } from '../errors.js';
import { RELEASE } from '../release.js';
import type { SecretsDocument } from '../secrets/store.js';
import { isReservedCore } from '../suite/names.js';
import type { Problem } from '../suite/schema.js';
import { isExternal, type Suite } from '../suite/types.js';
import { dockerVersions } from './docker.js';
import type { Host } from './host.js';
import type { State } from './state.js';

/** Docker’s Compose plugin must know `up --wait`, which came with 2.17, and the engine must be a supported one. */
export const MIN_ENGINE = '24.0.0';
export const MIN_COMPOSE = '2.20.0';
const MIN_FREE_BYTES = 1024 ** 3;

const list = (problems: Problem[]) => problems.map((p) => `  ${p.at}: ${p.message}`).join('\n');

/**
 * What `sv apply` refuses to run with (operator-cli §6.5): each is something that would put the instance somewhere it should not be
 * or cannot come back from, and nothing is changed. `overrides` are the contents of the operator’s Compose overrides for core.
 */
export function refusals(input: {
  suite: Suite;
  state: State | undefined;
  secrets: SecretsDocument;
  coreOverride: string | undefined;
  /** A restore may take core’s version backward, because it brings the database back to match. */
  restore: boolean;
}): Problem[] {
  const { suite, state, secrets, coreOverride, restore } = input;
  const problems: Problem[] = [];
  const add = (at: string, message: string) => problems.push({ at, message });

  const forbidden = ['SV_AUTH_COOKIE_DOMAIN', 'SV_AUTH_WEBAUTHN_RP_ID', 'SV_ENVIRONMENT'];
  const given = [...Object.keys(suite.core.env ?? {}), ...Object.keys(secrets.core ?? {})];
  for (const name of forbidden) {
    if (given.some((variable) => variable.replace(/_FILE$/, '') === name)) {
      add(
        name,
        name === 'SV_AUTH_COOKIE_DOMAIN'
          ? 'would send core’s session cookie to every app, and any app could then act as the person on core'
          : name === 'SV_ENVIRONMENT'
            ? 'is what suite.yml says the instance is for, and core refuses to seed anything but a development or staging instance on it'
            : 'would be fixed for passkeys, and changing it later breaks every one',
      );
    }
    if (coreOverride && new RegExp(`\\b${name}\\b`).test(coreOverride)) {
      add(`overrides/compose/core.yml`, `sets ${name}, which sv apply refuses to give core`);
    }
  }
  for (const name of Object.keys(secrets.core ?? {})) {
    if (isReservedCore(name))
      add(
        `secrets.age.yml.core.${name}`,
        'is made or refused by the deployment itself, and cannot be set',
      );
  }
  if (!(RELEASE.schemas as readonly number[]).includes(suite.schema)) {
    add(
      'schema',
      `is ${suite.schema}; this toolkit reads ${RELEASE.schemas.join(', ')}. Use a toolkit that supports it`,
    );
  }
  if (!satisfies(suite.core.version, RELEASE.core)) {
    add(
      'core.version',
      `${suite.core.version} is outside what this toolkit deploys (${RELEASE.core})`,
    );
  }
  if (state && !restore && gt(state.core.version, suite.core.version)) {
    add(
      'core.version',
      `would take core from ${state.core.version} back to ${suite.core.version}, and its migrations only go forward; sv restore brings a backup back`,
    );
  }
  if (state && state.database.version !== suite.database.version) {
    add(
      'database.version',
      `is ${suite.database.version} and the server runs ${state.database.version}; the database’s version is not changed on a running instance`,
    );
  }
  return problems;
}

/** The problems found by looking at the machine (operator-cli §6.1, step 2). Fatal ones stop the run with nothing changed. */
export async function look(input: {
  host: Host;
  suite: Suite;
  stateDir: string;
  skipDns: boolean;
  publicNames: string[];
}): Promise<{ problems: Problem[]; warnings: string[] }> {
  const { host, suite, stateDir } = input;
  const problems: Problem[] = [];
  const warnings: string[] = [];

  const versions = await dockerVersions(host);
  if (!versions.engine) {
    problems.push({
      at: 'docker',
      message: 'is not running, or this user cannot use it; sv apply needs the Docker engine',
    });
  } else if (!satisfies(versions.engine.replace(/[-+].*$/, ''), `>=${MIN_ENGINE}`)) {
    problems.push({
      at: 'docker',
      message: `is ${versions.engine}; sv apply needs ${MIN_ENGINE} or newer`,
    });
  }
  if (!versions.compose) {
    problems.push({
      at: 'docker compose',
      message: 'is not installed; sv apply needs the Compose plugin',
    });
  } else if (!satisfies(versions.compose.replace(/[-+].*$/, ''), `>=${MIN_COMPOSE}`)) {
    problems.push({
      at: 'docker compose',
      message: `is ${versions.compose}; sv apply needs ${MIN_COMPOSE} or newer`,
    });
  }

  const free = await host.freeBytes(stateDir);
  if (free < MIN_FREE_BYTES) {
    problems.push({
      at: stateDir,
      message: `has ${(free / 1024 ** 3).toFixed(1)} GB free; sv apply wants at least 1 GB`,
    });
  }

  if (!input.skipDns) {
    const expected = isIp(suite.server.host)
      ? [suite.server.host]
      : await host.resolve(suite.server.host);
    for (const name of input.publicNames) {
      const found = await host.resolve(name);
      const where =
        found.length === 0
          ? 'does not resolve'
          : `resolves to ${found.join(', ')}, and the server is ${expected.join(', ') || suite.server.host}`;
      if (
        found.length === 0 ||
        (expected.length > 0 && !found.some((address) => expected.includes(address)))
      ) {
        // A machine with no public port is reached on a network of its own; its names may be answered only there.
        const message = `${name} ${where}`;
        if (suite.tls?.mode === 'internal')
          warnings.push(`${message} (not checked further: certificates are the server’s own)`);
        else
          problems.push({
            at: `dns.${name}`,
            message: `${message}; point it at the server, or pass --skip-dns if the server is reached by another address`,
          });
      }
    }
  }
  return { problems, warnings };
}

const isIp = (value: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(':');

/** Throws `Refused` listing every problem, or returns. */
export function refuseIfAny(heading: string, problems: Problem[]): void {
  if (problems.length > 0)
    throw new Refused(
      `${heading}\n${list(problems)}`,
      'Nothing was changed. Fix these and run sv deploy again.',
    );
}

/** Whether an app’s kind has anything for this version of the apply. */
export const hostedApps = (suite: Suite) =>
  Object.entries(suite.apps ?? {}).filter(([, app]) => !isExternal(app));
