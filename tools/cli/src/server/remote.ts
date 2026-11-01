import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { Refused } from '../errors.js';
import type { Suite } from '../suite/types.js';

/** Where the server is, and who to be there (`server` in suite.yml). */
export type Target = {
  host: string;
  port?: number;
  user: string;
  /** A runner’s way in: the deployment key’s file and a `known_hosts` file that holds the server’s key, which are all it trusts. */
  identityFile?: string;
  knownHostsFile?: string;
};

export type RemoteResult = { code: number; stdout: string; stderr: string };

/** Runs a command on the server over the operator’s own SSH access, and hands what it prints on as it arrives. */
export type Remote = (
  target: Target,
  words: readonly string[],
  options?: {
    input?: Buffer | string;
    /** Standard input from a stream, for something too large to hold. */
    inputStream?: NodeJS.ReadableStream;
    /** Writes standard output to this file as it arrives instead of holding it, for a backup. */
    stdoutTo?: string;
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
    ...(target.identityFile
      ? ['-i', target.identityFile, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes']
      : []),
    ...(target.knownHostsFile
      ? ['-o', `UserKnownHostsFile=${target.knownHostsFile}`, '-o', 'StrictHostKeyChecking=yes']
      : []),
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
    if (options.stdoutTo) {
      child.stdout.pipe(createWriteStream(options.stdoutTo, { mode: 0o600 }));
    } else {
      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stdout += text;
        options.onStdout?.(text);
      });
    }
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
    if (options.inputStream) options.inputStream.pipe(child.stdin);
    else child.stdin.end(options.input);
  });

/** Holds a local port open to one on the server, until the operator ends it. Its output is the operator's, so it goes to their terminal. */
export type Tunnel = (target: Target, localPort: number, remotePort: number) => Promise<number>;

/**
 * The `ssh` command line for a tunnel. It listens on this machine's loopback address only, so nothing else on the operator's network can
 * use it, and reaches the server's loopback address only, where an inbox that is not for anyone else is published.
 */
export function tunnelArgs(target: Target, localPort: number, remotePort: number): string[] {
  return [
    '-N',
    '-T',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=4',
    ...(target.port === undefined ? [] : ['-p', String(target.port)]),
    '-L',
    `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
    '--',
    `${target.user}@${target.host}`,
  ];
}

export const sshTunnel: Tunnel = (target, localPort, remotePort) =>
  new Promise((resolve) => {
    const child = spawn('ssh', tunnelArgs(target, localPort, remotePort), { stdio: 'inherit' });
    child.on('error', () => resolve(255));
    // Ctrl-C ends ssh by a signal, which is how this is meant to end.
    child.on('close', (code, signal) => resolve(signal ? 0 : (code ?? 255)));
  });
