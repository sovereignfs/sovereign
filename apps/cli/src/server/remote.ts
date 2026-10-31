import { spawn } from 'node:child_process';
import { Refused } from '../errors.js';
import type { Suite } from '../suite/types.js';

/** Where the server is, and who to be there (`server` in suite.yml). */
export type Target = { host: string; port?: number; user: string };

export type RemoteResult = { code: number; stdout: string; stderr: string };

/** Runs a command on the server over the operator’s own SSH access, and hands what it prints on as it arrives. */
export type Remote = (
  target: Target,
  words: readonly string[],
  options?: {
    input?: Buffer | string;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  },
) => Promise<RemoteResult>;

const HOST = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const USER = /^[a-z_][a-z0-9_-]*$/;

export function targetOf(suite: Suite): Target {
  const { host, port, user } = suite.server;
  if (!HOST.test(host)) {
    throw new Refused(
      `server.host “${host}” is not a host name or address.`,
      'Fix it in suite.yml.',
    );
  }
  if (user !== undefined && !USER.test(user)) {
    throw new Refused(`server.user “${user}” is not a user name.`, 'Fix it in suite.yml.');
  }
  return { host, ...(port === undefined ? {} : { port }), user: user ?? 'root' };
}

/** The `ssh` command line: the destination follows `--`, so a host can never be read as an option. */
export function sshArgs(target: Target, words: readonly string[]): string[] {
  return [
    '-T',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=4',
    ...(target.port === undefined ? [] : ['-p', String(target.port)]),
    '--',
    `${target.user}@${target.host}`,
    ...words,
  ];
}

export const sshRemote: Remote = (target, words, options = {}) =>
  new Promise((resolve) => {
    const child = spawn('ssh', sshArgs(target, words), { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      options.onStderr?.(text);
    });
    child.on('error', (error) =>
      resolve({ code: 255, stdout, stderr: `${stderr}${error.message}` }),
    );
    child.on('close', (code) => resolve({ code: code ?? 255, stdout, stderr }));
    // A server that has stopped listening closes the pipe; that is the ssh exit code’s to report.
    child.stdin.on('error', () => undefined);
    child.stdin.end(options.input);
  });
