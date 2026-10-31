import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { connect } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { keyFile } from './secrets/keys.js';
import { type Io } from './io.js';
import { Registry, type RegistryAuths } from './registry.js';
import { sshRemote, type Remote } from './server/remote.js';

/** Runs a program with an argument list, never through a shell, so nothing in an argument is read as a command. */
export type Exec = (
  command: string,
  args: readonly string[],
  options?: { cwd?: string; input?: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Everything a command touches outside itself, so a test can give it a world to run in. */
export type Context = {
  io: Io;
  /** The instance repository. */
  root: string;
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  registry: Registry;
  exec: Exec;
  /** Where the operator's age key is. */
  keyFile: string;
  /** The clock. */
  now: () => number;
  /** What the operator’s machine can see of the network, for the checks that look from outside. */
  network: {
    resolve: (name: string) => Promise<string[]>;
    /** Whether something answers on the port within a few seconds. */
    reachable: (host: string, port: number) => Promise<boolean>;
  };
  /** The server, over the operator’s own SSH access. */
  remote: Remote;
  /** The files of one commit as a tar archive, as `git archive` writes it. */
  archive: (root: string, commit: string, paths: readonly string[]) => Promise<Buffer>;
};

export const realExec: Exec = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = execFile(
      command,
      [...args],
      { cwd: options.cwd, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({
          code,
          stdout,
          stderr: error && typeof error.code === 'string' ? error.message : stderr,
        });
      },
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
  });

/** The credentials Docker keeps for registries, if the operator has logged in to any. */
export function dockerAuths(env: NodeJS.ProcessEnv): RegistryAuths {
  const dir = env.DOCKER_CONFIG ?? path.join(os.homedir(), '.docker');
  try {
    const config = JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8')) as {
      auths?: RegistryAuths;
    };
    return config.auths ?? {};
  } catch {
    return {};
  }
}

const realNetwork: Context['network'] = {
  async resolve(name) {
    try {
      return (await lookup(name, { all: true })).map((entry) => entry.address);
    } catch {
      return [];
    }
  },
  reachable: (host, port) =>
    new Promise((resolve) => {
      const socket = connect({ host, port, timeout: 4000 });
      socket.on('connect', () => (socket.destroy(), resolve(true)));
      socket.on('timeout', () => (socket.destroy(), resolve(false)));
      socket.on('error', () => resolve(false));
    }),
};

export const gitArchive: Context['archive'] = (root, commit, paths) =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      ['archive', '--format=tar', commit, '--', ...paths],
      { cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });

export function makeContext(root: string, io: Io, env: NodeJS.ProcessEnv): Context {
  return {
    io,
    root,
    env,
    fetch,
    registry: new Registry(fetch, dockerAuths(env)),
    exec: realExec,
    keyFile: keyFile(env),
    now: Date.now,
    network: realNetwork,
    remote: sshRemote,
    archive: gitArchive,
  };
}
