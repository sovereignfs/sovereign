import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keyFile } from './secrets/keys.js';
import { type Io } from './io.js';
import { Registry, type RegistryAuths } from './registry.js';

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
  };
}
