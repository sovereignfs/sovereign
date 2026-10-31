import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { satisfies } from 'semver';
import { afterEach, describe, expect, it } from 'vitest';
import { appPackageJson, createApp, namesOf, writeApp } from './app.js';
import { CreateError, type CreateIo, type Exec } from './create.js';
import { APP_DEPENDENCIES } from './versions.js';

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
        'sovereign.manifest.json',
        'app/auth/[action]/route.ts',
        'app/api/health/route.ts',
        'instrumentation.ts',
        'migrations/001_init.sql',
        '.gitignore',
        'tsconfig.json',
        '.dockerignore',
        '.env.example',
        'package.json',
      ]),
    );
    for (const file of all(target)) {
      expect(read(target, file), file).not.toMatch(/__(PREFIX|NAME|TITLE|MANIFEST_LABEL)__/);
    }
    expect(read(target, 'lib/db.ts')).toContain("required('MYNOTES_POSTGRES_URL')");
    expect(read(target, 'app/page.tsx')).toContain('title="My Notes"');
  });

  it('meet the app manifest schema, and ask for the variables the manifest says the instance gives', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const manifest = JSON.parse(read(target, 'sovereign.manifest.json')) as {
      generate: string[];
      prefix: string;
    };
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(
      JSON.parse(readFileSync(path.join(root, 'spec/schemas/app-manifest-v1.schema.json'), 'utf8')),
    );
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    // What the code reads is what the manifest gives it (spec/app-manifest.md §3).
    const code = all(target)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .map((file) => read(target, file))
      .join('\n');
    for (const name of ['POSTGRES_URL', 'AUTH_SECRET'])
      expect(code).toContain(`${manifest.prefix}_${name}`);
    expect(manifest.generate).toEqual([`${manifest.prefix}_AUTH_SECRET`]);
    expect(code).toContain("prefix: 'MYNOTES'");
  });

  it('carry the manifest as the label of the image, equal to the manifest file', async () => {
    const target = path.join(temp(), 'my-notes');
    await writeApp(target, namesOf(target));
    const run = (...args: string[]) =>
      execFileSync('node', ['scripts/manifest.mjs', ...args], { cwd: target, encoding: 'utf8' });
    expect(run()).toContain('matches');
    const label = read(target, 'Dockerfile')
      .split('\n')
      .find((line) => line.startsWith('LABEL io.github.sovereignfs.app-manifest=')) as string;
    expect(JSON.parse(JSON.parse(label.slice(label.indexOf('=') + 1)))).toEqual(
      JSON.parse(read(target, 'sovereign.manifest.json')),
    );
    // Changing the manifest makes the check fail until the label follows it.
    const manifest = path.join(target, 'sovereign.manifest.json');
    const changed = read(target, 'sovereign.manifest.json').replace('"port": 3000', '"port": 3001');
    (await import('node:fs')).writeFileSync(manifest, changed);
    expect(() => run()).toThrow();
    run('--write');
    expect(run()).toContain('matches');
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

  it('are refused in a folder that is not empty, writing nothing', async () => {
    const target = temp();
    (await import('node:fs')).writeFileSync(path.join(target, 'x'), '');
    await expect(
      writeApp(path.join(target), { name: 'my-app', prefix: 'MYAPP', title: 'My App' }),
    ).rejects.toThrow(/not empty/);
  });
});

describe('what the app depends on', () => {
  it('are ranges the Sovereign packages of this repository satisfy', () => {
    for (const [name, dir] of [
      ['@sovereignfs/sdk', 'sdk'],
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
    };
    expect(pkg.dependencies['@sovereignfs/sdk']).toBeDefined();
    expect(pkg.scripts.build).toBe('next build');
    expect(pkg.scripts['manifest:write']).toBeDefined();
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
    expect(statSync(path.join(cwd, 'my-notes', 'scripts', 'manifest.mjs')).isFile()).toBe(true);
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
