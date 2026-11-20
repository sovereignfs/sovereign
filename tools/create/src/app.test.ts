import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { satisfies } from 'semver';
import { afterEach, describe, expect, it } from 'vitest';
import { appPackageJson, createApp, namesOf, writeApp } from './app.js';
import { CreateError, DEFAULT_APP_PORT, type CreateIo, type Exec } from './create.js';
import { DEFAULT_PACKAGE_MANAGER, MANAGERS, managerOf } from './package-manager.js';
import {
  APP_DEPENDENCIES,
  APP_DEV_DEPENDENCIES,
  ENCRYPTION_DEPENDENCIES,
  PNPM_VERSION,
  YARN_VERSION,
} from './versions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-app-'));
  dirs.push(dir);
  return dir;
};
const read = (dir: string, file: string) => readFileSync(path.join(dir, file), 'utf8');
const all = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));

describe('the names of an app', () => {
  it('come from the folder: its name, the prefix of its variables, and a title', () => {
    expect(namesOf('/x/my-notes')).toEqual({
      name: 'my-notes',
      prefix: 'MYNOTES',
      title: 'My Notes',
    });
    expect(namesOf('/x/Tasks')).toEqual({ name: 'tasks', prefix: 'TASKS', title: 'Tasks' });
  });

  it('are refused when they are a word of the app commands, so app sync is never an app called sync', () => {
    for (const word of ['sync', 'release', 'commits', 'settings']) {
      expect(() => namesOf(`/x/${word}`), word).toThrow(
        'is a command of npm create @sovereignfs app',
      );
    }
  });

  it('are refused when an instance could not host the app: too short, not a name, or core’s own prefix', () => {
    for (const bad of ['/x/a', '/x/9lives', '/x/---', '/x/sv']) {
      expect(() => namesOf(bad), bad).toThrow(CreateError);
    }
  });
});

describe('the files of an app', () => {
  it('are written with the names put in, and nothing of the template is left', async () => {
    const target = path.join(temp(), 'my-notes');
    const written = await writeApp(target, namesOf(target));
    expect(written).toEqual(
      expect.arrayContaining([
        'Dockerfile',
        '.github/workflows/publish.yml',
        'sovereign.manifest.json',
        'app/api/auth/[...all]/route.ts',
        'app/sign-in/page.tsx',
        'app/sign-up/page.tsx',
        'app/security/page.tsx',
        'app/api/sovereign/backchannel-logout/route.ts',
        'app/api/sovereign/account-deleted/route.ts',
        'app/api/health/route.ts',
        'instrumentation.ts',
        'migrations/001_init.sql',
        'compose.yml',
        'lib/files.ts',
        'app/api/files/route.ts',
        'app/api/files/[id]/route.ts',
        '.gitignore',
        'tsconfig.json',
        '.dockerignore',
        '.env.example',
        'package.json',
      ]),
    );
    for (const file of all(target)) {
      expect(read(target, file), file).not.toMatch(/__(PREFIX|PREFIX_LOWER|NAME|TITLE|PORT)__/);
    }
    expect(read(target, 'lib/db.ts')).toContain("required('MYNOTES_POSTGRES_URL')");
    // The pool is the size the instance gives it, whose role's limit is set from the same number (operator-cli §6.4.4).
    expect(read(target, 'lib/db.ts')).toContain('MYNOTES_POSTGRES_POOL_MAX');
    expect(read(target, 'lib/db.ts')).not.toContain('max: 10 }');
    expect(read(target, 'app/page.tsx')).toContain('title="My Notes"');
    // The manifest is the one copy: nothing in the app repeats it, or the sync script that kept a second one.
    expect(written).not.toContain('scripts/manifest.mjs');
    // Its sign-in is the package's; the SDK's sign-in routes, and the overlay's list of what it leaves out, are not written.
    expect(written).not.toContain('app/auth/[action]/route.ts');
    expect(written).not.toContain('lib/auth.ts');
    expect(written).not.toContain('_skip');
  });

  it('listen on one port, written wherever it is needed: the default, clear of the suite, or the one asked for', async () => {
    const portsOf = (target: string) => {
      const manifest = JSON.parse(read(target, 'sovereign.manifest.json')) as { port: number };
      const pkg = JSON.parse(read(target, 'package.json')) as { scripts: Record<string, string> };
      return {
        manifest: manifest.port,
        dev: pkg.scripts.dev,
        start: pkg.scripts.start,
        url: /MYNOTES_URL=(\S+)/.exec(read(target, '.env.example'))?.[1],
        readme: read(target, 'README.md').includes(`http://localhost:${manifest.port}`),
      };
    };
    const byDefault = path.join(temp(), 'my-notes');
    await writeApp(byDefault, namesOf(byDefault));
    expect(portsOf(byDefault)).toEqual({
      manifest: 3100,
      dev: 'next dev --port 3100',
      start: 'PORT=${PORT:-3100} node .next/standalone/server.js',
      url: 'http://localhost:3100',
      readme: true,
    });
    const chosen = path.join(temp(), 'my-notes');
    await writeApp(chosen, namesOf(chosen), 4321);
    expect(portsOf(chosen)).toMatchObject({
      manifest: 4321,
      dev: 'next dev --port 4321',
      url: 'http://localhost:4321',
    });
    // The image takes the port from the manifest when it is built, so no number is written in it.
    expect(read(chosen, 'Dockerfile')).not.toMatch(/4321|3100/);
  });

  it('meet the app manifest schema, and ask for the variables the manifest says the instance gives', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const manifest = JSON.parse(read(target, 'sovereign.manifest.json')) as {
      manifest: number;
      generate: (string | { name: string; bytes: number })[];
      prefix: string;
      signIn: { export?: string };
    };
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(
      JSON.parse(
        readFileSync(path.join(root, 'contracts/schemas/app-manifest-v5.schema.json'), 'utf8'),
      ),
    );
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    // The manifest names the app in lower case, and the variables are its upper case (app-manifest §2.4).
    expect(manifest.manifest).toBe(5);
    // Where core asks for a person's part of their export, which the SDK answers (core-app §4.7.2).
    expect(manifest.signIn.export).toBe('/api/sovereign/export');
    expect(read(target, 'lib/notices.ts')).toContain('handleExportRequest');
    expect(read(target, 'app/api/sovereign/export/route.ts')).toContain('exportPart');
    expect(manifest.prefix).toBe('mynotes');
    // What the code reads is what the manifest gives it (contracts/app-manifest.md §3).
    const code = all(target)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .map((file) => read(target, file))
      .join('\n');
    const variables = manifest.prefix.toUpperCase();
    for (const name of ['POSTGRES_URL', 'AUTH_SECRET'])
      expect(code).toContain(`${variables}_${name}`);
    // The push key is a P-256 key, 32 bytes: the instance makes it once, as it makes the secret.
    expect(manifest.generate).toEqual([
      `${variables}_AUTH_SECRET`,
      { name: `${variables}_VAPID_PRIVATE_KEY`, bytes: 32 },
    ]);
    expect(code).toContain("prefix: 'MYNOTES'");
  });

  it('ask core for the scopes the SDK asks for, which includes the one that gives it a refresh token', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const manifest = JSON.parse(read(target, 'sovereign.manifest.json')) as {
      signIn: { scopes: string[] };
    };
    // The SDK asks for offline_access on every sign-in, and core refuses a scope the app was not registered with.
    expect(manifest.signIn.scopes).toEqual(expect.arrayContaining(['openid', 'offline_access']));
  });

  it('hold the manifest once, and make the image’s label and port from it', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const dockerfile = read(target, 'Dockerfile');
    // No copy of the manifest, and no number: the port is the build argument that `sovereign-manifest docker-args` gives.
    expect(dockerfile).not.toContain('io.github.sovereignfs.app-manifest');
    expect(dockerfile).not.toMatch(/\b3000\b/);
    expect(dockerfile).toContain('ARG PORT');
    expect(dockerfile).toContain('ENV NODE_ENV=production');
    expect(dockerfile).toContain('PORT=${PORT}');
    expect(dockerfile).toContain('EXPOSE ${PORT}');
    // A build without the port stops, saying how to build.
    expect(dockerfile).toContain('sovereign-manifest docker-args');
    const manifest = JSON.parse(read(target, 'sovereign.manifest.json')) as { port: number };
    expect(manifest.port).toBe(DEFAULT_APP_PORT);
    expect(read(target, 'package.json')).toContain('"manifest:check": "sovereign-manifest check"');
  });

  it('publish on a version tag, with the label and port from the manifest, the image tagged X.Y.Z, every action pinned to a commit', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const workflow = read(target, '.github/workflows/publish.yml');
    expect(workflow).toContain("- 'v*.*.*'");
    expect(workflow).toContain('sovereign-manifest check');
    expect(workflow).toContain('sovereign-manifest docker-args --format github');
    expect(workflow).toContain('labels: ${{ steps.manifest.outputs.labels }}');
    expect(workflow).toContain('build-args: ${{ steps.manifest.outputs.build-args }}');
    expect(workflow).toContain('platforms: linux/amd64,linux/arm64');
    expect(workflow).toContain(
      '${{ steps.image.outputs.name }}:${{ steps.version.outputs.version }}',
    );
    expect(workflow).toContain('ghcr.io/${GITHUB_REPOSITORY,,}');
    // Every action from elsewhere is pinned to a commit; the app's own ci.yml is called by path.
    for (const action of workflow.matchAll(/uses: (\S+)/g))
      if (!action[1]?.startsWith('./')) expect(action[1], 'an action').toMatch(/@[0-9a-f]{40}$/);
  });

  it('check only where a change reaches main: CI on pull requests into main and tags, a pre-push hook for the rest', async () => {
    const target = path.join(temp(), 'my-notes');
    const written = await writeApp(target, namesOf(target));
    expect(written).toEqual(
      expect.arrayContaining([
        '.github/workflows/ci.yml',
        '.githooks/pre-push',
        '.github/workflows/sync-develop.yml',
      ]),
    );
    const ci = read(target, '.github/workflows/ci.yml');
    expect(ci).toMatch(/on:\n {2}pull_request:\n {4}branches: \[main\]/);
    expect(ci).not.toMatch(/^ {2}push:/m);
    expect(ci).toContain('github.event.pull_request.draft == false');
    for (const step of ['pnpm run typecheck', 'pnpm run manifest:check', 'pnpm run build'])
      expect(ci).toContain(step);
    for (const action of ci.matchAll(/uses: (\S+)/g))
      expect(action[1], 'an action').toMatch(/@[0-9a-f]{40}$/);
    // A release tag runs the checks before anything is built.
    const publish = read(target, '.github/workflows/publish.yml');
    expect(publish).toContain('uses: ./.github/workflows/ci.yml');
    expect(publish).toMatch(/image:\n {4}needs: validate/);
    // The hook is executable, runs verify, and an install turns it on.
    const hook = path.join(target, '.githooks', 'pre-push');
    expect(statSync(hook).mode & 0o111).not.toBe(0);
    expect(read(target, '.githooks/pre-push')).toContain('exec pnpm run verify');
    const scripts = (
      JSON.parse(read(target, 'package.json')) as { scripts: Record<string, string> }
    ).scripts;
    expect(scripts.verify).toBe('pnpm run typecheck && pnpm run manifest:check');
    expect(scripts.prepare).toBe('git config core.hooksPath .githooks || true');
    expect(read(target, 'CONTRIBUTING.md')).toContain('## Continuous integration');
  });

  it('tell an agent the suite’s conventions in the shared section of AGENTS.md, with this app’s commands', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const agents = read(target, 'AGENTS.md');
    const shared = agents.slice(
      agents.indexOf('<!-- sovereign:shared:begin -->'),
      agents.indexOf('<!-- sovereign:shared:end -->'),
    );
    for (const rule of [
      'Two branches',
      'Commits explain why',
      'The version follows the change, by semver',
      'One task, one branch, one pull request',
      '`pnpm install`, `pnpm run dev`',
      'No secret has a default',
      'Every server action and route decides for itself',
      'names the owner',
      '@sovereignfs/storage',
      'constant time',
      'Every outbound `fetch` has a timeout',
      'never `NEXT_PUBLIC_*`',
      '`--sv-*` tokens',
      'node_modules/next/dist/docs/',
      '`MYNOTES_`',
    ])
      expect(shared, rule).toContain(rule);
    expect(read(target, 'CLAUDE.md')).toContain('@AGENTS.md');
  });

  it('name the package in the @sovereignfs scope, private, so it claims nothing on npm', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const manifest = JSON.parse(read(target, 'package.json')) as { name: string; private: boolean };
    expect(manifest.name).toBe('@sovereignfs/my-notes');
    expect(manifest.private).toBe(true);
  });

  it('name the app in the Markdown, though the formatter writes the placeholder as bold', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    expect(read(target, 'README.md').split('\n')[0]).toBe('# My Notes');
    expect(read(target, 'README.md')).not.toContain('TITLE');
  });

  it('release only from main: the workflow refuses a tag off main, and CONTRIBUTING.md says how work reaches it', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const workflow = read(target, '.github/workflows/publish.yml');
    expect(workflow).toContain('git merge-base --is-ancestor HEAD origin/main');
    // Called by release.yml with the tag a merged Release promotion made, and making the GitHub release from the changelog.
    expect(workflow).toMatch(/workflow_call:\n {4}inputs:\n {6}tag:/);
    expect(workflow).toContain('pnpm exec create app release notes "$TAG" > notes.md');
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow.indexOf('git merge-base')).toBeLessThan(
      workflow.indexOf('docker/login-action'),
    );
    const contributing = read(target, 'CONTRIBUTING.md');
    expect(contributing).toContain('# Contributing to My Notes');
    for (const rule of [
      'Directly on `develop`',
      'A feature branch',
      '**`vX.Y.Z`**',
      '**`Release vX.Y.Z`** when merging it is to publish',
      '## Shared files',
      '## Repository settings',
      'a merge commit',
      'rebase and merge',
    ])
      expect(contributing, rule).toContain(rule);
    expect(read(target, 'README.md')).toContain('[CONTRIBUTING.md](CONTRIBUTING.md)');
  });

  it('keep what a sign-in needs: a conditional token write, encrypted tokens, and an owner in every delete', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const stores = read(target, 'lib/stores.ts');
    expect(stores).toContain('AND fingerprint = $4');
    expect(stores).toContain('seal(next)');
    expect(stores).toContain('pg_advisory_lock');
    expect(read(target, 'app/actions.ts')).toContain('AND owner = $2');
    expect(read(target, 'lib/notices.ts')).toContain('onAccountDeleted');
  });

  it('keep what needs a session on the direct address, in a small pool, and say they can be pooled', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const manifest = JSON.parse(read(target, 'sovereign.manifest.json')) as {
      database: { pooling?: string };
    };
    expect(manifest.database).toEqual({ pooling: 'transaction' });
    const db = read(target, 'lib/db.ts');
    expect(db).toContain("setting('MYNOTES_POSTGRES_DIRECT_URL')");
    expect(db).toContain('export function directDb()');
    expect(read(target, 'lib/migrate.ts')).toContain('directDb()');
    expect(read(target, 'lib/stores.ts')).toContain('directDb()');
    // Nothing that holds a session is left on the pooled address.
    for (const file of ['lib/migrate.ts', 'lib/stores.ts']) {
      const text = read(target, file);
      const lockLines = text.split('\n').filter((line) => line.includes('pg_advisory'));
      expect(lockLines.length, file).toBeGreaterThan(0);
    }
    expect(read(target, 'lib/migrate.ts')).not.toMatch(/\bdb\(\)\.connect/);
    expect(read(target, 'lib/stores.ts')).not.toMatch(/\bdb\(\)\.connect/);
    expect(read(target, '.env.example')).toContain('MYNOTES_POSTGRES_DIRECT_URL');
  });

  it('are refused in a folder that is not empty, writing nothing', async () => {
    const target = temp();
    (await import('node:fs')).writeFileSync(path.join(target, 'x'), '');
    await expect(
      writeApp(path.join(target), { name: 'my-app', prefix: 'MYAPP', title: 'My App' }),
    ).rejects.toThrow(/not empty/);
  });
});

describe('the files an app keeps for people', () => {
  const made = async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    return target;
  };

  it('are the manifest’s `storage`, a folder of the app’s own in the image, and the variables an instance gives', async () => {
    const target = await made();
    expect(JSON.parse(read(target, 'sovereign.manifest.json'))).toMatchObject({ storage: true });
    // The folder exists in the image and is the user's, or Docker makes a volume of it that is root's and the app cannot write.
    const dockerfile = read(target, 'Dockerfile');
    expect(dockerfile).toContain('RUN mkdir -p /data/s3/my-notes && chown -R node:node /data');
    expect(dockerfile.indexOf('chown -R node:node /data')).toBeLessThan(
      dockerfile.indexOf('USER node'),
    );
    const env = read(target, '.env.example');
    for (const name of ['DRIVER', 'PATH', 'QUOTA_MB', 'FILE_QUOTA', 'SIGNING_KEY'])
      expect(env).toContain(`MYNOTES_STORAGE_${name}=`);
    expect(read(target, '.gitignore')).toMatch(/^data\/$/m);
    expect(read(target, 'lib/files.ts')).toContain("defaultPath: '/data/s3/my-notes'");
  });

  it('are asked for only by someone signed in, and changed only from the app’s own pages', async () => {
    const target = await made();
    for (const file of ['app/api/files/route.ts', 'app/api/files/[id]/route.ts']) {
      const code = read(target, file);
      expect(code, file).toContain('getSession()');
      expect(code, file).toContain("from '@/lib/session'");
      expect(code, file).toContain('unauthorised()');
      // Every handler that changes something asks where the request came from before it asks who made it.
      for (const method of ['POST', 'DELETE']) {
        const at = code.indexOf(`export async function ${method}`);
        if (at !== -1) {
          const body = code.slice(at);
          expect(body.indexOf('refuseCrossOrigin(request)'), `${file} ${method}`).toBeGreaterThan(
            -1,
          );
          expect(body.indexOf('refuseCrossOrigin(request)')).toBeLessThan(
            body.indexOf('getSession()'),
          );
        }
      }
    }
    // The person comes from the session and from nothing a request carries, in every call to the store.
    for (const file of [
      'app/api/files/route.ts',
      'app/api/files/[id]/route.ts',
      'app/actions.ts',
    ]) {
      for (const call of read(target, file).match(
        /files\(\)\.(put|list|usage|remove|serve)\([^,)]*/g,
      ) ?? [])
        expect(call, `${file}: ${call}`).toMatch(/session\.user\.id|sub$/);
    }
    expect(read(target, 'lib/files.ts')).toContain("request.headers.get('origin')");
  });

  it('are deleted with the person, in the handler of the notice that they deleted their account', async () => {
    const target = await made();
    const notices = read(target, 'lib/notices.ts');
    expect(notices).toContain('await files().removeAll(userId)');
    expect(notices.indexOf('DELETE FROM notes')).toBeLessThan(notices.indexOf('removeAll(userId)'));
  });

  it('run with docker compose on a volume where an instance mounts the app’s folder, and the port the manifest names', async () => {
    const target = await made();
    const compose = read(target, 'compose.yml');
    const manifest = JSON.parse(read(target, 'sovereign.manifest.json')) as { port: number };
    expect(compose).toContain('- files:/data/s3/my-notes');
    expect(compose).toContain('MYNOTES_STORAGE_PATH: /data/s3/my-notes');
    expect(compose).toContain(`PORT: '${manifest.port}'`);
    expect(compose).toContain(`'${manifest.port}:${manifest.port}'`);
    expect(compose).toMatch(/image: postgres:18/);
    expect(compose).toContain('condition: service_healthy');
    // No secret of an instance is in it: the core's address and the client are the person's own, in .env.
    expect(compose).not.toMatch(/CLIENT_SECRET:/);
    expect(read(target, '.dockerignore')).toContain('.env');
  });

  it('say how to turn them off, and what to delete', async () => {
    const readme = read(await made(), 'README.md');
    expect(readme).toContain("## People's files");
    expect(readme).toContain('docker compose up --build');
    expect(readme).toContain('`"storage": false`');
  });
});

describe('an app made with --encryption', () => {
  const made = async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target), DEFAULT_APP_PORT, { encryption: true });
    return target;
  };

  it('meets manifest 5, with its key return address, the Directory for sharing, and the core that has them', async () => {
    const target = await made();
    const manifest = JSON.parse(read(target, 'sovereign.manifest.json')) as {
      manifest: number;
      encryption: { return: string };
      signIn: { scopes: string[] };
      core: string;
    };
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(
      JSON.parse(
        readFileSync(path.join(root, 'contracts/schemas/app-manifest-v5.schema.json'), 'utf8'),
      ),
    );
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(manifest.manifest).toBe(5);
    expect(manifest.encryption).toEqual({ return: '/keys/return' });
    expect(existsSync(path.join(target, 'app/keys/return/page.tsx'))).toBe(true);
    // Sharing finds people in the Directory; `keys` is not asked for, it comes with `encryption` once the operator allows it (§2.8).
    expect(manifest.signIn.scopes).toEqual(
      expect.arrayContaining(['openid', 'offline_access', 'directory']),
    );
    expect(manifest.signIn.scopes).not.toContain('keys');
    // The SDK asks only for what it is told: without these, the Directory and the keys calls are refused.
    expect(read(target, 'lib/sovereign.ts')).toContain(
      "scopes: ['openid', 'profile', 'email', 'offline_access', 'directory', 'keys']",
    );
    expect(manifest.core.startsWith('>=0.126.0')).toBe(true);
  });

  it('depends on the SDK whose keys entry encrypts a document, which this repository satisfies', async () => {
    const target = await made();
    const pkg = JSON.parse(read(target, 'package.json')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@sovereignfs/sdk']).toBe(ENCRYPTION_DEPENDENCIES['@sovereignfs/sdk']);
    const sdk = (
      JSON.parse(readFileSync(path.join(root, 'packages/sdk/package.json'), 'utf8')) as {
        version: string;
      }
    ).version;
    expect(satisfies(sdk, ENCRYPTION_DEPENDENCIES['@sovereignfs/sdk'])).toBe(true);
  });

  it('signs in through core with the SDK, leaving out the package’s sign-in and what it depends on', async () => {
    const target = await made();
    const written = all(target);
    for (const file of [
      'lib/sign-in.ts',
      'lib/session.ts',
      'app/sign-in/page.tsx',
      'app/api/auth/[...all]/route.ts',
      '_skip',
    ])
      expect(written, file).not.toContain(file);
    expect(written).toEqual(expect.arrayContaining(['lib/auth.ts', 'app/auth/[action]/route.ts']));
    // Nothing it keeps imports what was left out.
    for (const file of written.filter((f) => /\.tsx?$/.test(f)))
      expect(read(target, file), file).not.toMatch(
        /@\/lib\/(sign-in|session|notices|sign-in-client)'/,
      );
    const pkg = JSON.parse(read(target, 'package.json')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@sovereignfs/auth']).toBeUndefined();
    expect(pkg.dependencies['better-auth']).toBeUndefined();
    expect(read(target, '.env.example')).not.toContain('_AUTH_LOCAL');
  });

  it('writes its own files over the app’s, with the names put in and nothing of the template left', async () => {
    const target = await made();
    for (const file of [
      'app/notes.tsx',
      'app/keys/return/received.tsx',
      'lib/notes.ts',
      'lib/keys.ts',
      'app/api/notes/route.ts',
      'app/api/notes/[id]/route.ts',
      'app/api/people/route.ts',
      'app/api/people/[sub]/keys/route.ts',
      'app/api/me/keys/route.ts',
      'ENCRYPTION.md',
    ])
      expect(existsSync(path.join(target, file)), file).toBe(true);
    for (const file of all(target)) {
      expect(read(target, file), file).not.toMatch(
        /__(PREFIX|PREFIX_LOWER|NAME|TITLE|PORT)__|\*\*TITLE\*\*/,
      );
    }
    expect(read(target, 'lib/keys.ts')).toContain("required('MYNOTES_CORE_CLIENT_ID')");
    expect(read(target, 'ENCRYPTION.md').split('\n')[0]).toBe('# Encryption in My Notes');
  });

  it('keeps no column a note’s text could be in, and renders nothing of a note on the server', async () => {
    const target = await made();
    const migration = read(target, 'migrations/001_init.sql');
    const notes = migration.slice(migration.indexOf('CREATE TABLE notes'));
    expect(notes.slice(0, notes.indexOf(');'))).not.toMatch(/\b(title|text|body)\s+text\b/);
    expect(notes).toMatch(/body\s+bytea/);
    const page = read(target, 'app/page.tsx');
    expect(page).not.toContain('notes()');
    expect(page).not.toContain('FROM notes');
    // What the page encrypts and opens, it does with the SDK's keys entry, in the browser.
    expect(read(target, 'app/notes.tsx').startsWith("'use client';")).toBe(true);
  });

  it('changes notes only from the app’s own pages, for someone signed in, and names the person in every statement', async () => {
    const target = await made();
    const route = read(target, 'app/api/notes/[id]/route.ts');
    for (const method of ['PUT', 'DELETE']) {
      const body = route.slice(route.indexOf(`export async function ${method}`));
      expect(body.indexOf('refuseCrossOrigin(request)'), method).toBeGreaterThan(-1);
      expect(body.indexOf('refuseCrossOrigin(request)')).toBeLessThan(body.indexOf('getSession()'));
    }
    for (const file of [
      'app/api/notes/route.ts',
      'app/api/people/route.ts',
      'app/api/people/[sub]/keys/route.ts',
      'app/api/me/keys/route.ts',
    ]) {
      expect(read(target, file), file).toContain('auth().getSession()');
      expect(read(target, file), file).toContain('unauthorised()');
    }
    const store = read(target, 'lib/notes.ts');
    expect(store).toContain('DELETE FROM notes WHERE id = $1 AND owner = $2');
    expect(store).toContain('WHERE notes.owner = EXCLUDED.owner');
    expect(store).toContain('r.reader = $1');
  });

  it('deletes a person’s notes and the keys sealed to them when their account is deleted', async () => {
    const target = await made();
    const auth = read(target, 'lib/auth.ts');
    expect(auth).toContain('await notes().deleteAll(sub)');
    expect(auth).toContain('await files().removeAll(sub)');
    expect(read(target, 'lib/notes.ts')).toContain('OR reader = $1');
  });

  it('is not written without the option', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    expect(existsSync(path.join(target, 'app/notes.tsx'))).toBe(false);
    expect(existsSync(path.join(target, 'ENCRYPTION.md'))).toBe(false);
    expect(JSON.parse(read(target, 'sovereign.manifest.json')).encryption).toBeUndefined();
  });
});

describe('installing the app', () => {
  it('has a manifest, a service worker and icons from @sovereignfs/pwa, and a layout that tells a device', async () => {
    const target = path.join(temp(), 'my-notes');
    const written = await writeApp(target, namesOf(target));
    expect(written).toEqual(
      expect.arrayContaining([
        'app/manifest.ts',
        'app/sw.js/route.ts',
        'app/pwa-icon/[variant]/route.tsx',
      ]),
    );
    expect(read(target, 'app/manifest.ts')).toContain("manifest({\n    name: 'My Notes',");
    const worker = read(target, 'app/sw.js/route.ts');
    expect(worker).toContain('version: buildId(),\n      precache: builtFiles(),');
    expect(worker).toContain('serviceWorkerResponse(');
    const layout = read(target, 'app/layout.tsx');
    expect(layout).toContain("...pwaMetadata({ name: 'My Notes' })");
    expect(layout).toContain('export const viewport: Viewport = pwaViewport();');
    expect(layout).toContain('<ServiceWorkerRegistration appName="My Notes" />');
    // Every icon the manifest names is drawn by the icon route, and the iPhone's too.
    const icons = read(target, 'app/pwa-icon/[variant]/route.tsx');
    for (const variant of ["'192'", "'512'", 'maskable', 'apple']) expect(icons).toContain(variant);
    expect(icons).toContain("'My Notes'.charAt(0)");
  });

  it('names its icon in the Sovereign manifest, for the launcher', async () => {
    for (const encryption of [false, true]) {
      const target = path.join(temp(), 'my-notes');
      await writeApp(target, namesOf(target), DEFAULT_APP_PORT, { encryption });
      expect(JSON.parse(read(target, 'sovereign.manifest.json')).icon, String(encryption)).toBe(
        '/pwa-icon/192',
      );
    }
  });

  it('keeps the PWA wiring with --encryption, which replaces neither the layout nor the routes', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target), DEFAULT_APP_PORT, { encryption: true });
    expect(read(target, 'app/layout.tsx')).toContain('ServiceWorkerRegistration');
    expect(existsSync(path.join(target, 'app/sw.js/route.ts'))).toBe(true);
  });

  it('depends on @sovereignfs/pwa', () => {
    expect(
      JSON.parse(appPackageJson(namesOf('/x/my-notes'))).dependencies['@sovereignfs/pwa'],
    ).toBe(APP_DEPENDENCIES['@sovereignfs/pwa']);
  });
});

describe('notifications in an app', () => {
  const variants = [false, true] as const;

  it('turn on with a key the instance makes, read from the app’s own variables, in both variants', async () => {
    for (const encryption of variants) {
      const target = path.join(temp(), 'my-notes');
      await writeApp(target, namesOf(target), DEFAULT_APP_PORT, { encryption });
      const manifest = JSON.parse(read(target, 'sovereign.manifest.json')) as {
        generate: unknown[];
      };
      expect(manifest.generate, String(encryption)).toContainEqual({
        name: 'MYNOTES_VAPID_PRIVATE_KEY',
        bytes: 32,
      });
      expect(read(target, 'lib/push.ts')).toContain("pushSettings('MYNOTES')");
      const env = read(target, '.env.example');
      expect(env).toContain('MYNOTES_VAPID_PRIVATE_KEY=\n');
      expect(env).toContain('MYNOTES_VAPID_SUBJECT=\n');
      expect(env).toContain('npx @sovereignfs/push keys');
    }
  });

  it('keep devices in two tables, the keys sealed under a purpose of their own, and a push only for the account’s device', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const migration = read(target, 'migrations/002_push.sql');
    expect(migration).toContain('CREATE TABLE push_devices');
    expect(migration).toContain('REFERENCES push_devices (endpoint) ON DELETE CASCADE');
    const store = read(target, 'lib/push.ts');
    expect(store).toContain("const PURPOSE = 'push devices'");
    expect(store).toMatch(
      /seal\(\s*JSON\.stringify\(\{ p256dh: subscription\.p256dh, auth: subscription\.auth \}\),\s*PURPOSE,?\s*\)/,
    );
    expect(store).toContain(
      'WHERE EXISTS (SELECT 1 FROM push_devices WHERE endpoint = $3 AND account = $2)',
    );
    expect(store).toContain('FOR UPDATE SKIP LOCKED');
    // A refresh token keeps the key it had before devices were sealed too.
    expect(read(target, 'lib/crypto.ts')).toContain("purpose = 'refresh tokens'");
  });

  it('give a device one route, for the signed-in account, from the app’s own origin, in both variants', async () => {
    for (const encryption of variants) {
      const target = path.join(temp(), 'my-notes');
      await writeApp(target, namesOf(target), DEFAULT_APP_PORT, { encryption });
      const route = read(target, 'app/api/push/subscription/route.ts');
      expect(route).toContain('pushSubscriptionHandlers({');
      expect(route).toContain("originOf(setting('MYNOTES_URL'))");
      expect(route).toContain('account: () => currentAccount()');
      expect(read(target, 'lib/account.ts'), String(encryption)).toContain(
        encryption ? 'auth().getSession())?.sub' : 'getSession())?.user.id',
      );
      const action = read(target, 'app/push-actions.ts');
      expect(action.startsWith("'use server';")).toBe(true);
      expect(action).toContain('const account = await currentAccount();');
      // Queued in a transaction, as a change's push would be, and sent after it commits.
      expect(action.indexOf("client.query('BEGIN')")).toBeLessThan(action.indexOf('enqueuePush('));
      expect(action.indexOf("client.query('COMMIT')")).toBeLessThan(
        action.indexOf('sendDuePushes()'),
      );
    }
  });

  it('show the switch and the test, start the outbox, and turn the device off before signing out, in both variants', async () => {
    for (const encryption of variants) {
      const target = path.join(temp(), 'my-notes');
      await writeApp(target, namesOf(target), DEFAULT_APP_PORT, { encryption });
      const page = read(target, 'app/page.tsx');
      expect(page, String(encryption)).toContain('<Notifications />');
      expect(page).toContain('<SignOutForm>');
      expect(read(target, 'app/notifications.tsx')).toContain('Send me a test notification');
      expect(read(target, 'app/notifications.tsx')).toContain('appName="My Notes"');
      expect(read(target, 'app/ui.tsx')).toContain('PushControl');
      // The device is turned off first, then the sign-out goes on: the server action, or the SDK's form.
      const signOut = read(target, 'app/sign-out.tsx');
      const off = signOut.indexOf('turnOffPush()');
      expect(off).toBeGreaterThan(-1);
      expect(off).toBeLessThan(signOut.indexOf(encryption ? 'form.submit()' : 'await signOut()'));
      expect(read(target, 'instrumentation.ts')).toContain('startPushOutbox();');
      expect(read(target, 'app/sw.js/route.ts')).toContain(
        "...(appPush() ? { push: { name: 'My Notes', icon: '/pwa-icon/192' } } : {})",
      );
    }
  });

  it('forget a person’s devices with their account, in both variants', async () => {
    for (const encryption of variants) {
      const target = path.join(temp(), 'my-notes');
      await writeApp(target, namesOf(target), DEFAULT_APP_PORT, { encryption });
      expect(read(target, encryption ? 'lib/auth.ts' : 'lib/notices.ts')).toContain(
        `await pushStore().removeAccount(${encryption ? 'sub' : 'userId'});`,
      );
    }
  });

  it('need no new content security policy: the route is the app’s own and the push services are the browser’s', async () => {
    const { contentSecurityPolicy } = await import('../template/app/lib/csp');
    const policy = contentSecurityPolicy({ nonce: 'n', secure: true, development: false });
    const directive = (name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `));
    expect(directive('connect-src')).toMatch(/^connect-src 'self'/);
    expect(directive('worker-src')).toBe("worker-src 'self'");
    expect(policy).not.toMatch(/googleapis|mozilla|apple\.com|windows\.com/);
  });

  it('depend on @sovereignfs/push', () => {
    expect(
      JSON.parse(appPackageJson(namesOf('/x/my-notes'))).dependencies['@sovereignfs/push'],
    ).toBe(APP_DEPENDENCIES['@sovereignfs/push']);
  });
});

describe('the content security policy of an app', () => {
  it('is set on every page by a proxy, from the app’s own variables', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const proxy = read(target, 'proxy.ts');
    expect(proxy).toContain('process.env.MYNOTES_URL');
    expect(proxy).toContain('originOf(process.env.MYNOTES_CORE_URL)');
    expect(proxy).not.toContain('__PREFIX');
    // Not pages: the API, the sign-in routes, the worker, the manifest, the icons and the built files.
    for (const left of [
      'api/',
      'auth/',
      'sw\\\\.js',
      'manifest\\\\.webmanifest',
      'pwa-icon/',
      '_next/static',
    ])
      expect(proxy, left).toContain(left);
    // A nonce needs every page rendered per request.
    expect(read(target, 'app/layout.tsx')).toContain('await connection();');
  });

  it('runs nothing the server did not mark, and lets sign-out go on to core', async () => {
    const { contentSecurityPolicy, originOf } = await import('../template/app/lib/csp');
    const policy = contentSecurityPolicy({
      nonce: 'abc',
      secure: true,
      development: false,
      core: originOf('https://core.example.org/some/path'),
    });
    const directive = (name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `));
    // WebAssembly, for the sign-in value the browser derives (auth.md §6); never eval.
    expect(directive('script-src')).toBe(
      "script-src 'self' 'nonce-abc' 'strict-dynamic' 'wasm-unsafe-eval'",
    );
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(directive('worker-src')).toBe("worker-src 'self'");
    expect(directive('manifest-src')).toBe("manifest-src 'self'");
    expect(directive('form-action')).toBe("form-action 'self' https://core.example.org");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('allows what next dev needs only in development, and https only where the app is served over it', async () => {
    const { contentSecurityPolicy, originOf } = await import('../template/app/lib/csp');
    const development = contentSecurityPolicy({ nonce: 'n', secure: false, development: true });
    expect(development).toContain("'unsafe-eval'");
    expect(development).not.toContain('upgrade-insecure-requests');
    expect(development).toContain("form-action 'self';");
    expect(originOf('javascript:alert(1)')).toBeUndefined();
    expect(originOf('not an address')).toBeUndefined();
  });

  it('makes a nonce that is new every time', async () => {
    const { newNonce } = await import('../template/app/lib/csp');
    const nonces = new Set(Array.from({ length: 50 }, () => newNonce()));
    expect(nonces.size).toBe(50);
    expect([...nonces][0]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe('what the app depends on', () => {
  it('are ranges the Sovereign packages of this repository satisfy', () => {
    for (const [name, dir] of [
      ['@sovereignfs/config', 'config'],
      ['@sovereignfs/pwa', 'pwa'],
      ['@sovereignfs/push', 'push'],
      ['@sovereignfs/sdk', 'sdk'],
      ['@sovereignfs/storage', 'storage'],
      ['@sovereignfs/ui', 'ui'],
    ] as const) {
      const version = (
        JSON.parse(readFileSync(path.join(root, 'packages', dir, 'package.json'), 'utf8')) as {
          version: string;
        }
      ).version;
      expect(
        satisfies(version, APP_DEPENDENCIES[name]),
        `${name}@${version} against ${APP_DEPENDENCIES[name]}`,
      ).toBe(true);
    }
  });

  it('include the manifest package of this repository, which makes the image’s label and port', () => {
    const version = (
      JSON.parse(readFileSync(path.join(root, 'packages/manifest/package.json'), 'utf8')) as {
        version: string;
      }
    ).version;
    expect(satisfies(version, APP_DEV_DEPENDENCIES['@sovereignfs/manifest'])).toBe(true);
  });

  it('are the ones this repository uses for Next.js and React', () => {
    const catalog = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    for (const name of ['next', 'react', 'react-dom', 'pg']) {
      expect(catalog).toContain(
        `${name}: ${APP_DEPENDENCIES[name as keyof typeof APP_DEPENDENCIES]}`,
      );
    }
  });

  it('go in package.json, with the scripts a build and the Dockerfile run', () => {
    const pkg = JSON.parse(
      appPackageJson({ name: 'my-notes', prefix: 'MYNOTES', title: 'My Notes' }),
    ) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@sovereignfs/sdk']).toBeDefined();
    expect(pkg.scripts.build).toBe('next build');
    expect(pkg.scripts['manifest:check']).toBe('sovereign-manifest check');
    expect(pkg.devDependencies['@sovereignfs/manifest']).toBeDefined();
  });
});

describe('npm create @sovereignfs app', () => {
  const io: CreateIo & { said: string[] } = {
    said: [],
    err(line) {
      this.said.push(line);
    },
    interactive: false,
    ask: async () => '',
  };

  it('writes the files, makes the repository and the lockfile, and commits, without installing or building', async () => {
    const cwd = temp();
    const ran: string[] = [];
    const exec: Exec = async (command, args) => {
      ran.push([command, ...args].join(' '));
      return { code: 0, stdout: '', stderr: '' };
    };
    await createApp({ dir: 'my-notes' }, io, exec, cwd);
    expect(existsSync(path.join(cwd, 'my-notes', 'Dockerfile'))).toBe(true);
    expect(ran.map((line) => line.split(' ').slice(0, 2).join(' '))).toEqual([
      'git init',
      'pnpm install',
      'git add',
      'git commit',
      'git switch',
    ]);
    // The first commit is on main, and the app is left on develop, where work lands (CONTRIBUTING.md).
    expect(ran[0]).toBe('git init --initial-branch=main');
    expect(ran[4]).toBe('git switch --create develop');
    expect(io.said.join('\n')).toContain('on the branch develop');
    expect(ran[1]).toContain('--lockfile-only');
    expect(ran[1]).toContain('--ignore-scripts');
    expect(ran[2]).toContain('pnpm-lock.yaml');
    expect(io.said.join('\n')).toContain('./sv app add my-notes');
    expect(
      statSync(path.join(cwd, 'my-notes', '.github', 'workflows', 'publish.yml')).isFile(),
    ).toBe(true);
  });

  it('says what to do when a step fails, and what it wrote stays', async () => {
    const cwd = temp();
    const exec: Exec = async (command, args) =>
      command === 'pnpm' && args[0] === 'install'
        ? { code: 1, stdout: '', stderr: 'ERR_PNPM_FETCH_404 @sovereignfs/sdk' }
        : { code: 0, stdout: '', stderr: '' };
    const failure = await createApp({ dir: 'my-notes' }, io, exec, cwd).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(CreateError);
    expect((failure as CreateError).message).toContain('404');
    expect((failure as CreateError).hint).toContain('corepack enable pnpm');
    expect(existsSync(path.join(cwd, 'my-notes', 'package.json'))).toBe(true);
  });
});

describe('the package manager of an app', () => {
  const cases = [
    {
      manager: 'pnpm',
      pin: `pnpm@${PNPM_VERSION}`,
      lockfile: 'pnpm-lock.yaml',
      copy: 'COPY package.json pnpm-lock.yaml ./',
      install: 'RUN pnpm install --frozen-lockfile --ignore-scripts',
      run: 'pnpm run',
      exec: 'pnpm exec',
      corepack: true,
    },
    {
      manager: 'npm',
      pin: undefined,
      lockfile: 'package-lock.json',
      copy: 'COPY package.json package-lock.json ./',
      install: 'RUN npm ci --ignore-scripts --no-audit --no-fund',
      run: 'npm run',
      exec: 'npx',
      corepack: false,
    },
    {
      manager: 'yarn',
      pin: `yarn@${YARN_VERSION}`,
      lockfile: 'yarn.lock',
      copy: 'COPY package.json yarn.lock .yarnrc.yml ./',
      install: 'RUN yarn install --immutable --mode=skip-build',
      run: 'yarn run',
      exec: 'yarn exec',
      corepack: true,
    },
  ] as const;

  it('is pnpm when none is named', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    expect(JSON.parse(read(target, 'package.json')).packageManager).toBe(`pnpm@${PNPM_VERSION}`);
    expect(MANAGERS[DEFAULT_PACKAGE_MANAGER].lockfile).toBe('pnpm-lock.yaml');
  });

  it('pins the pnpm this repository uses', () => {
    const pkg = JSON.parse(read(root, 'package.json')) as { packageManager: string };
    expect(pkg.packageManager).toBe(`pnpm@${PNPM_VERSION}`);
  });

  for (const c of cases)
    it(`names ${c.manager} in every file that runs it, and leaves no placeholder`, async () => {
      const target = path.join(temp(), 'my-notes');
      await writeApp(target, namesOf(target), DEFAULT_APP_PORT, { packageManager: c.manager });
      const pkg = JSON.parse(read(target, 'package.json')) as {
        packageManager?: string;
        scripts: Record<string, string>;
      };
      expect(pkg.packageManager).toBe(c.pin);
      expect(pkg.scripts.verify).toBe(`${c.run} typecheck && ${c.run} manifest:check`);
      // Yarn 4 does not run `prepare` on an install, so the hooks are turned on after it.
      const hookScript = c.manager === 'yarn' ? 'postinstall' : 'prepare';
      expect(pkg.scripts[hookScript]).toBe('git config core.hooksPath .githooks || true');

      const dockerfile = read(target, 'Dockerfile');
      expect(dockerfile).toContain(c.copy);
      expect(dockerfile).toContain(c.install);
      expect(dockerfile).toContain(`RUN ${c.run} build`);
      expect(dockerfile).toContain(`$(${c.exec} sovereign-manifest docker-args)`);
      expect(dockerfile.includes('RUN corepack enable')).toBe(c.corepack);

      for (const workflow of ['ci.yml', 'publish.yml']) {
        const text = read(target, `.github/workflows/${workflow}`);
        expect(text.includes('- run: corepack enable'), workflow).toBe(c.corepack);
        expect(text, workflow).toContain(c.install.replace(/^RUN /, '- run: '));
      }
      expect(read(target, '.github/workflows/ci.yml')).toContain(`- run: ${c.run} build`);
      expect(read(target, '.githooks/pre-push')).toContain(`exec ${c.run} verify`);
      expect(read(target, 'AGENTS.md')).toContain(`(\`${c.run} verify\`)`);
      expect(read(target, 'README.md')).toContain(`${c.run} dev`);
      expect(existsSync(path.join(target, '.yarnrc.yml'))).toBe(c.manager === 'yarn');

      for (const file of all(target))
        expect(read(target, file), file).not.toMatch(/__[A-Z_]+__|# __COREPACK/);
    });

  for (const c of cases)
    it(`writes the ${c.manager} lockfile and commits it`, async () => {
      const cwd = temp();
      const ran: string[] = [];
      const exec: Exec = async (command, args) => {
        ran.push([command, ...args].join(' '));
        return { code: 0, stdout: '', stderr: '' };
      };
      const io: CreateIo = { err: () => {}, interactive: false, ask: async () => '' };
      await createApp({ dir: 'my-notes', packageManager: c.manager }, io, exec, cwd);
      expect(ran[1]?.split(' ')[0]).toBe(c.manager);
      expect(ran[2]).toContain(c.lockfile);
    });

  it('runs a manager that is not installed through corepack, which comes with Node', async () => {
    const cwd = temp();
    const ran: string[] = [];
    const exec: Exec = async (command, args) => {
      ran.push([command, ...args].join(' '));
      return command === 'yarn'
        ? { code: 1, stdout: '', stderr: 'spawn yarn ENOENT' }
        : { code: 0, stdout: '', stderr: '' };
    };
    const io: CreateIo = { err: () => {}, interactive: false, ask: async () => '' };
    await createApp({ dir: 'my-notes', packageManager: 'yarn' }, io, exec, cwd);
    expect(ran[2]).toBe('corepack yarn install --mode=update-lockfile');
  });

  it('is read back from packageManager, and is npm for an app made before there was a choice', () => {
    expect(managerOf('pnpm@11.0.0')).toBe('pnpm');
    expect(managerOf('yarn@4.18.1+sha512.abc')).toBe('yarn');
    expect(managerOf(undefined)).toBe('npm');
    expect(managerOf('bun@1.0.0')).toBe('npm');
  });
});
