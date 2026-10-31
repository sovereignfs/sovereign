import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { realExec, type Context } from '../context.js';
import type { Io } from '../io.js';
import { Registry } from '../registry.js';
import { MANIFEST_LABEL } from '../release.js';

/** A conversation with a command: what it printed, and the answers it is given. */
export type Script = {
  out: string[];
  err: string[];
  answers: string[];
  hidden: string[];
  stdin: string;
};

export function fakeIo(
  interactive: boolean,
  script?: Partial<Pick<Script, 'answers' | 'hidden' | 'stdin'>>,
) {
  const said: Script = {
    out: [],
    err: [],
    answers: [...(script?.answers ?? [])],
    hidden: [...(script?.hidden ?? [])],
    stdin: script?.stdin ?? '',
  };
  const asked: string[] = [];
  const io: Io = {
    out: (line) => said.out.push(line),
    err: (line) => said.err.push(line),
    interactive,
    async ask(question, fallback) {
      asked.push(question);
      const answer = said.answers.shift();
      return answer === undefined || answer === '' ? (fallback ?? '') : answer;
    },
    async askHidden(question) {
      asked.push(question);
      const answer = said.hidden.shift();
      if (answer === undefined) throw new Error('the test did not expect a hidden question');
      return answer;
    },
    readStdin: async () => said.stdin,
  };
  return { io, said, asked };
}

/** A manifest as an app maker would publish it, with the parts a test varies. */
export function manifestOf(extra: Record<string, unknown> = {}) {
  return {
    manifest: 1,
    prefix: 'NOTES',
    name: 'Notes',
    port: 3000,
    health: '/api/health',
    signIn: {
      redirect: ['/api/auth/callback/sovereign'],
      postLogout: ['/'],
      backChannel: '/api/auth/back-channel-logout',
      scopes: ['openid', 'profile', 'email'],
    },
    database: true,
    generate: ['NOTES_AUTH_SECRET'],
    data: ['/data'],
    core: '>=0.49.0 <1.0.0',
    ...extra,
  };
}

/** A registry that knows a few images: what they resolve to, and the manifest each carries. */
export function fakeRegistry(images: Record<string, { digest?: string; manifest?: unknown }> = {}) {
  const asked: string[] = [];
  const repositoryOf = (ref: string) =>
    ref.replace(/(@sha256:[0-9a-f]{64})$/, '').replace(/:[^/:]+$/, '');
  /** An image by its reference, or by its repository when the reference is a digest, as the toolkit pins one. */
  const find = (ref: string) => {
    const plain = ref.replace(/@sha256:[0-9a-f]{64}$/, '');
    if (images[plain]) return images[plain];
    if (ref !== plain || !/:[^/]+$/.test(ref)) {
      const key = Object.keys(images).find((known) => repositoryOf(known) === repositoryOf(ref));
      return key ? images[key] : undefined;
    }
    return undefined;
  };
  const registry = {
    async digest(ref: string) {
      asked.push(ref);
      const found = find(ref);
      if (
        ref.startsWith('ghcr.io/sovereignfs/') ||
        ref.startsWith('postgres:') ||
        ref.startsWith('caddy:')
      ) {
        return (
          found?.digest ?? `sha256:${Buffer.from(ref).toString('hex').padEnd(64, '0').slice(0, 64)}`
        );
      }
      if (!found) throw new Error(`the test registry has no ${ref}`);
      return found.digest ?? `sha256:${'a'.repeat(64)}`;
    },
    async label(ref: string, name: string) {
      const found = find(ref);
      if (!found || name !== MANIFEST_LABEL || found.manifest === undefined) return undefined;
      return typeof found.manifest === 'string' ? found.manifest : JSON.stringify(found.manifest);
    },
  };
  return { registry: registry as unknown as Registry, asked };
}

export type World = {
  root: string;
  home: string;
  /** A bare repository standing in for GitHub. */
  remote: string;
  ctx: Context;
  said: Script;
  asked: string[];
  registryAsked: string[];
  git(...args: string[]): string;
  cleanup(): void;
};

/**
 * An instance repository in a temporary folder with git behind it, the way `npm create` leaves one, and a context that runs
 * commands in it with a registry and a terminal the test controls.
 */
export function makeWorld(
  options: {
    interactive?: boolean;
    answers?: string[];
    hidden?: string[];
    stdin?: string;
    images?: Record<string, { digest?: string; manifest?: unknown }>;
    withGit?: boolean;
  } = {},
): World {
  const base = mkdtempSync(path.join(os.tmpdir(), 'sv-world-'));
  const root = path.join(base, 'instance');
  const home = path.join(base, 'home');
  const remote = path.join(base, 'remote.git');
  mkdirSync(root, { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(root, 'sv'), '#!/bin/sh\n');
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(
      { name: 'my-instance', private: true, dependencies: { '@sovereignfs/cli': '0.1.0' } },
      null,
      2,
    ),
  );
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'T',
        GIT_AUTHOR_EMAIL: 't@example.test',
        GIT_COMMITTER_NAME: 'T',
        GIT_COMMITTER_EMAIL: 't@example.test',
      },
    });
  if (options.withGit !== false) {
    execFileSync('git', ['init', '--bare', '--initial-branch=main', remote]);
    git('init', '--initial-branch=main');
    git('remote', 'add', 'origin', remote);
  }
  const { io, said, asked } = fakeIo(options.interactive ?? false, {
    answers: options.answers ?? [],
    hidden: options.hidden ?? [],
    stdin: options.stdin ?? '',
  });
  const { registry, asked: registryAsked } = fakeRegistry(options.images);
  const ctx: Context = {
    io,
    root,
    env: { SV_CONFIG_DIR: path.join(home, 'config') },
    fetch: (() => Promise.reject(new Error('the test has no network'))) as typeof fetch,
    registry,
    exec: realExec,
    keyFile: path.join(home, 'config', 'age.key'),
    now: () => 1_800_000_000_000,
  };
  // A commit needs an author, and a test machine may have none.
  for (const [name, value] of Object.entries({
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@example.test',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@example.test',
  })) {
    process.env[name] ??= value;
  }
  return {
    root,
    home,
    remote,
    ctx,
    said,
    asked,
    registryAsked,
    git,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}
