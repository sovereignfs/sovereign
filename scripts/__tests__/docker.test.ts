/**
 * The files that make core runnable by an operator (Dockerfile, .dockerignore, the compose files, the Next
 * output they depend on) hold to what the specification promises of them: nothing secret baked in, the database
 * choice by variables, a non-root process, and every workspace package the build needs copied. The image itself
 * is built and booted by `pnpm docker:smoke` (CI's `image` job); these keep the files honest without Docker.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const dockerfile = read('Dockerfile');
const dockerignore = read('.dockerignore');

type Service = {
  image?: string;
  command?: string[];
  environment?: Record<string, string | null>;
  depends_on?: unknown;
  ports?: string[];
  volumes?: string[];
  profiles?: string[];
  env_file?: unknown;
  healthcheck?: { test: string[] };
};
type Compose = {
  name?: string;
  services: Record<string, Service>;
  volumes?: Record<string, unknown>;
};
// Compose's own tags (`!reset`, `!override`) say how an overlay merges; a YAML parser does not know them, and
// what they leave is what is being asserted on, so they are taken off before parsing.
const compose = (file: string) =>
  parse(read(file).replace(/!(reset|override)[ \t]*/g, '')) as Compose;

describe('the Dockerfile', () => {
  it('copies the workspace file and the lockfile before it installs, so the install is the real one', () => {
    const copy = dockerfile.indexOf('COPY pnpm-workspace.yaml pnpm-lock.yaml package.json');
    const install = dockerfile.indexOf('pnpm install --frozen-lockfile');
    expect(copy).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(copy);
  });

  it('copies the manifest of every workspace package and of the core app, so a new package cannot be forgotten', () => {
    const packages = readdirSync(path.join(root, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `packages/${entry.name}`);
    for (const dir of ['apps/core', ...packages]) {
      expect(dockerfile, `${dir}/package.json`).toContain(
        `COPY ${dir}/package.json ${dir}/package.json`,
      );
    }
  });

  it('is multi-stage on node:24-alpine, and the last stage is not the build', () => {
    const stages = dockerfile.match(/^FROM .+$/gm) ?? [];
    expect(stages).toHaveLength(3);
    expect(stages[0]).toBe('FROM node:${NODE_VERSION}-alpine AS deps');
    expect(stages[2]).toBe('FROM node:${NODE_VERSION}-alpine AS run');
    expect(dockerfile).toContain('ARG NODE_VERSION=24');
    expect(dockerfile.split('AS run')[1]).not.toContain('pnpm');
  });

  it('runs the traced server as an unprivileged user, on 3000, with a health check', () => {
    const run = dockerfile.split('AS run')[1] ?? '';
    expect(run).toMatch(/^USER node$/m);
    expect(run).toContain('EXPOSE 3000');
    expect(run).toMatch(/HEALTHCHECK[\s\S]*\/api\/health/);
    expect(run).toMatch(/CMD \["node", "server\.js"\]/);
    expect(run).toContain('.next/standalone');
  });

  it('bakes in no environment: no secret, no address, no environment file copied', () => {
    expect(dockerfile).not.toMatch(/^\s*(ENV|ARG)\s+SV_/m);
    expect(dockerfile).not.toMatch(/COPY[^\n]*\.env/);
    expect(dockerfile).not.toMatch(
      /SECRET|PASSWORD/i.source === '' ? /x/ : /(ENV|ARG)\s+\w*(SECRET|PASSWORD|KEY)\w*/,
    );
  });

  it('works from the repository root and reads the migrations the server applies when it starts', () => {
    expect(dockerfile).toContain('WORKDIR /app/apps/core');
    expect(read('apps/core/next.config.ts')).toContain("output: 'standalone'");
    expect(read('apps/core/next.config.ts')).toContain("'./migrations/**/*.sql'");
    expect(read('apps/core/next.config.ts')).toContain('outputFileTracingRoot');
  });
});

describe('the Docker build context', () => {
  const lines = dockerignore.split('\n').map((line) => line.trim());

  it('leaves out every environment file, but keeps the example', () => {
    expect(lines).toContain('**/.env');
    expect(lines).toContain('**/.env.*');
    expect(lines).toContain('!**/.env.example');
  });

  it('leaves out what is local: dependencies, build output, databases and the repository', () => {
    for (const entry of ['.git', '**/node_modules', '**/.next', '**/data', '**/*.db']) {
      expect(lines, entry).toContain(entry);
    }
  });
});

describe('the compose files', () => {
  const defaults = compose('docker-compose.yml');

  it('run core from the published image, buildable from this checkout, with sqld as the default database', () => {
    expect(defaults.services.core?.image).toContain('ghcr.io/sovereignfs/sovereign-core');
    expect(defaults.services.core?.environment?.SV_DB_DIALECT).toBe('sqld');
    expect(defaults.services.core?.environment?.SV_SQLD_URL).toBe('http://sqld:8080');
    expect(defaults.services.core?.environment?.SV_SQLD_ADMIN_URL).toBe('http://sqld:8081');
  });

  it.each(['docker-compose.yml', 'docker-compose.sqlite.yml'])(
    '%s refuses to start without SV_URL and SV_AUTH_SECRET, and holds no secret of its own',
    (file) => {
      const environment = compose(file).services.core?.environment ?? {};
      expect(environment.SV_URL).toMatch(/^\$\{SV_URL:\?/);
      expect(environment.SV_AUTH_SECRET).toMatch(/^\$\{SV_AUTH_SECRET:\?/);
      for (const [name, value] of Object.entries(environment)) {
        if (/SECRET|PASSWORD|KEY/.test(name)) expect(String(value), name).toMatch(/^\$\{/);
      }
    },
  );

  it('read `.env` when there is one, and do not need it', () => {
    for (const file of ['docker-compose.yml', 'docker-compose.sqlite.yml']) {
      expect(compose(file).services.core?.env_file).toEqual([{ path: '.env', required: false }]);
    }
  });

  it('pin the database servers, so an upgrade is a decision', () => {
    expect(defaults.services.sqld?.image).toMatch(/libsql-server:v\d+\.\d+\.\d+$/);
    expect(compose('docker-compose.postgres.yml').services.postgres?.image).toMatch(
      /^postgres:\d+$/,
    );
    expect(compose('docker-compose.dev.yml').services.sqld?.image).toBe(
      defaults.services.sqld?.image,
    );
  });

  it('start sqld with namespaces, which core needs to make its own, and keep its data in a volume', () => {
    expect(defaults.services.sqld?.command).toEqual(['/bin/sqld', '--enable-namespaces']);
    expect(defaults.services.sqld?.volumes).toEqual(['sqld-data:/var/lib/sqld']);
    expect(defaults.services.core?.depends_on).toEqual({ sqld: { condition: 'service_healthy' } });
  });

  it('do not publish a database’s port: only core is reachable from outside', () => {
    expect(defaults.services.sqld?.ports).toBeUndefined();
    expect(compose('docker-compose.postgres.yml').services.postgres?.ports).toBeUndefined();
  });

  it('add PostgreSQL as an overlay that points core at it, keeps sqld from starting and needs a password', () => {
    const overlay = compose('docker-compose.postgres.yml');
    expect(overlay.services.core?.environment?.SV_DB_DIALECT).toBe('postgres');
    expect(overlay.services.core?.environment?.SV_POSTGRES_URL).toContain('@postgres:5432/');
    expect(overlay.services.core?.environment?.SV_POSTGRES_URL).toMatch(
      /\$\{SV_POSTGRES_PASSWORD:\?/,
    );
    expect(overlay.services.postgres?.environment?.POSTGRES_PASSWORD).toMatch(
      /^\$\{SV_POSTGRES_PASSWORD:\?/,
    );
    expect(overlay.services.sqld?.profiles?.length).toBeGreaterThan(0);
    expect(overlay.services.core?.environment).not.toHaveProperty(
      'SV_SQLD_URL',
      'http://sqld:8080',
    );
  });

  it('keep a SQLite file in one container, on a volume', () => {
    const single = compose('docker-compose.sqlite.yml');
    expect(Object.keys(single.services)).toEqual(['core']);
    expect(single.services.core?.environment?.SV_DB_DIALECT).toBe('sqlite');
    expect(single.services.core?.environment?.SV_SQLITE_URL).toBe('file:/data/core.db');
    expect(single.services.core?.volumes).toEqual(['core-data:/data']);
  });

  it('give development a sqld on the ports its tests expect, and only on this machine', () => {
    const dev = compose('docker-compose.dev.yml');
    expect(dev.services.sqld?.ports).toEqual(['127.0.0.1:8080:8080', '127.0.0.1:8081:8081']);
    expect(Object.keys(dev.services)).toEqual(['sqld']);
  });

  it('tell core’s own address how to be reached from inside its container', () => {
    expect(read('docker-compose.yml')).toMatch(/id_token_hint[\s\S]*extra_hosts/);
  });
});

describe('what the compose files say the variables are', () => {
  it('names only variables core reads, so the .env.example the operator copies is the reference', () => {
    const example = read('apps/core/.env.example');
    for (const file of [
      'docker-compose.yml',
      'docker-compose.sqlite.yml',
      'docker-compose.postgres.yml',
    ]) {
      for (const match of read(file).matchAll(/\bSV_[A-Z0-9_]+\b/g)) {
        const name = match[0];
        // The compose files' own settings are not core's: the image, the port, the database password.
        if (['SV_IMAGE', 'SV_PORT', 'SV_POSTGRES_PASSWORD'].includes(name)) continue;
        expect(example, `${name} in ${file}`).toContain(name);
      }
    }
  });
});
