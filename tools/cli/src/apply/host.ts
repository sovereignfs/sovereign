import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { statfs } from 'node:fs/promises';
import type { Registry } from '../registry.js';

/** What a command run on the server returns. */
export type Ran = { code: number; stdout: string; stderr: string };

/**
 * Everything `sv apply` does to the world outside its own files, in one place, so that the steps can be run in a test with a
 * Docker that is pretended, and in CI with the real one. It never reaches for `process` or a global itself.
 */
export interface Host {
  /** Runs `docker` with an argument list, never through a shell. `input` is written to its standard input and not to its argument list. */
  docker(
    args: readonly string[],
    options?: {
      input?: string;
      /** A file to send to standard input, for something too large to hold as a string. */
      inputFrom?: string;
      cwd?: string;
      env?: Record<string, string>;
      stdoutTo?: string;
    },
  ): Promise<Ran>;
  /** The addresses a name resolves to. */
  resolve(name: string): Promise<string[]>;
  /** Free bytes where the server keeps its state. */
  freeBytes(path: string): Promise<number>;
  /** A request, for the checks `sv apply` makes from outside a container. */
  fetch: typeof fetch;
  /** Where images are looked up; a test supplies one that knows a few. When absent, the registry is asked over `fetch`. */
  registry?: Registry;
  /** Cryptographically random bytes, so a test can make them known. */
  random(bytes: number): Buffer;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Whether a process is alive, for a lock a dead process left. */
  alive(pid: number): boolean;
  pid: number;
  log(line: string): void;
}

/** The real host for the server’s side of the operator’s commands, which can follow a container’s output as it is printed. */
export function realReceiverHost(
  log: (line: string) => void,
): Host & { follow: (args: readonly string[], write: (chunk: string) => void) => Promise<number> } {
  return {
    ...realHost(log),
    follow: (args, write) =>
      new Promise((resolve) => {
        const child = spawn('docker', [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', (chunk: Buffer) => write(chunk.toString('utf8')));
        child.stderr.on('data', (chunk: Buffer) => write(chunk.toString('utf8')));
        child.on('error', () => resolve(127));
        child.on('close', (code) => resolve(code ?? 1));
      }),
  };
}

export function realHost(log: (line: string) => void): Host {
  return {
    docker: (args, options = {}) =>
      new Promise((resolve) => {
        const child = spawn('docker', [...args], {
          cwd: options.cwd,
          env: { ...process.env, ...options.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        // A large dump goes to a file as it arrives, not into memory.
        const sink = options.stdoutTo
          ? createWriteStream(options.stdoutTo, { mode: 0o600 })
          : undefined;
        if (sink) child.stdout.pipe(sink);
        else child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
        child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
        child.on('error', (error) =>
          resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }),
        );
        child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
        if (options.inputFrom) {
          const source = createReadStream(options.inputFrom);
          source.on('error', () => child.stdin.end());
          source.pipe(child.stdin);
        } else {
          child.stdin.end(options.input ?? '');
        }
      }),
    async resolve(name) {
      try {
        return (await lookup(name, { all: true })).map((entry) => entry.address);
      } catch {
        return [];
      }
    },
    async freeBytes(path) {
      const stats = await statfs(path);
      return stats.bavail * stats.bsize;
    },
    fetch,
    random: (bytes) => randomBytes(bytes),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    alive(pid) {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM';
      }
    },
    pid: process.pid,
    log,
  };
}

// Kept for a caller that needs to run a plain program on the server, such as `df`.
export function runProgram(command: string, args: readonly string[]): Promise<Ran> {
  return new Promise((resolve) => {
    execFile(command, [...args], { encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout,
        stderr,
      });
    });
  });
}
