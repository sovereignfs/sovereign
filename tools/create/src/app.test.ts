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
import { APP_DEPENDENCIES, APP_DEV_DEPENDENCIES } from './versions.js';

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
        'app/auth/[action]/route.ts',
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
      generate: string[];
      prefix: string;
    };
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(
      JSON.parse(
        readFileSync(path.join(root, 'contracts/schemas/app-manifest-v3.schema.json'), 'utf8'),
      ),
    );
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    // The manifest names the app in lower case, and the variables are its upper case (app-manifest §2.4).
    expect(manifest.manifest).toBe(3);
    expect(manifest.prefix).toBe('mynotes');
    // What the code reads is what the manifest gives it (contracts/app-manifest.md §3).
    const code = all(target)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .map((file) => read(target, file))
      .join('\n');
    const variables = manifest.prefix.toUpperCase();
    for (const name of ['POSTGRES_URL', 'AUTH_SECRET'])
      expect(code).toContain(`${variables}_${name}`);
    expect(manifest.generate).toEqual([`${variables}_AUTH_SECRET`]);
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
    for (const action of workflow.matchAll(/uses: (\S+)/g))
      expect(action[1], 'an action').toMatch(/@[0-9a-f]{40}$/);
  });

  it('keep what a sign-in needs: a conditional token write, encrypted tokens, and an owner in every delete', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const stores = read(target, 'lib/stores.ts');
    expect(stores).toContain('AND fingerprint = $4');
    expect(stores).toContain('seal(next)');
    expect(stores).toContain('pg_advisory_lock');
    expect(read(target, 'app/actions.ts')).toContain('AND owner = $2');
    expect(read(target, 'lib/auth.ts')).toContain('onAccountDeleted');
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
      expect(code, file).toContain('auth().getSession()');
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
      for (const call of read(target, file).match(/files\(\)\.(put|list|usage|remove)\([^,)]*/g) ??
        [])
        expect(call, `${file}: ${call}`).toMatch(/session\.sub|sub$/);
    }
    expect(read(target, 'lib/files.ts')).toContain("request.headers.get('origin')");
  });

  it('are deleted with the person, in the handler of the notice that they deleted their account', async () => {
    const target = await made();
    const auth = read(target, 'lib/auth.ts');
    expect(auth).toContain('await files().removeAll(sub)');
    expect(auth.indexOf('DELETE FROM notes')).toBeLessThan(auth.indexOf('removeAll(sub)'));
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

describe('what the app depends on', () => {
  it('are ranges the Sovereign packages of this repository satisfy', () => {
    for (const [name, dir] of [
      ['@sovereignfs/config', 'config'],
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
      'npm install',
      'git add',
      'git commit',
    ]);
    expect(ran[1]).toContain('--package-lock-only');
    expect(ran[1]).toContain('--ignore-scripts');
    expect(io.said.join('\n')).toContain('./sv app add my-notes');
    expect(
      statSync(path.join(cwd, 'my-notes', '.github', 'workflows', 'publish.yml')).isFile(),
    ).toBe(true);
  });

  it('says what to do when a step fails, and what it wrote stays', async () => {
    const cwd = temp();
    const exec: Exec = async (command, args) =>
      command === 'npm' && args[0] === 'install'
        ? { code: 1, stdout: '', stderr: 'npm error 404 @sovereignfs/sdk' }
        : { code: 0, stdout: '', stderr: '' };
    const failure = await createApp({ dir: 'my-notes' }, io, exec, cwd).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(CreateError);
    expect((failure as CreateError).message).toContain('404');
    expect(existsSync(path.join(cwd, 'my-notes', 'package.json'))).toBe(true);
  });
});
