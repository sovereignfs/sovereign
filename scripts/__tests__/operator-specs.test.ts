/**
 * The files an operator's repository holds, and the manifest an app provides, are defined twice: in prose, and by a JSON
 * Schema that the CLI will validate against. These keep the two in step: the documents' own examples must pass, and each
 * rule the prose states must be refused by the schema. The manifest has a schema for each version; the document's example is
 * the latest, and manifest 1 is held to the differences §5.1 states.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const schema = (name: string) =>
  JSON.parse(read(`contracts/schemas/${name}.schema.json`)) as object;
const ajv = new Ajv2020({ allErrors: true });
const validSuite = ajv.compile(schema('suite-v1'));
const validLock = ajv.compile(schema('suite-lock-v1'));
const validManifest = ajv.compile(schema('app-manifest-v2'));
const validManifest1 = ajv.compile(schema('app-manifest-v1'));

/** The fenced blocks of a language in a document, in order. */
const blocks = (file: string, language: string) =>
  [...read(file).matchAll(new RegExp('^```' + language + '\\n([\\s\\S]*?)^```$', 'gm'))].map(
    (match) => match[1] ?? '',
  );

const [suiteYaml = '', lockYaml = '', secretsYaml = ''] = blocks('contracts/suite.md', 'yaml');
const [manifestJson = ''] = blocks('contracts/app-manifest.md', 'json');
type Suite = {
  domain: string;
  core: { version: string; env?: Record<string, string> };
  apps: Record<string, Record<string, unknown>>;
  [field: string]: unknown;
};
const suite = () => parse(suiteYaml) as Suite;
const manifest = () => JSON.parse(manifestJson) as Record<string, unknown>;
/** The example as manifest 1 wrote it (app-manifest §5.1): an upper-case prefix, a sign-in, a core range and names only. */
const manifest1 = () => ({
  ...manifest(),
  manifest: 1,
  prefix: 'NOTES',
  generate: ['NOTES_AUTH_SECRET'],
});
const without = (value: object, field: string) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));

describe('the examples in the documents', () => {
  it('suite.yml passes its schema', () => {
    expect(validSuite(suite()), JSON.stringify(validSuite.errors)).toBe(true);
  });

  it('suite.lock passes its schema, and locks what the example suite.yml runs', () => {
    const lock = parse(lockYaml) as { apps: object };
    expect(validLock(lock), JSON.stringify(validLock.errors)).toBe(true);
    const hosted = Object.entries(suite().apps).filter(([, app]) => app.external !== true);
    expect(Object.keys(lock.apps)).toEqual(hosted.map(([name]) => name));
  });

  it('secrets.age.yml holds only ciphertext, under what it belongs to', () => {
    const secrets = parse(secretsYaml) as Record<string, Record<string, string>>;
    for (const value of Object.values(secrets).flatMap((group) => Object.values(group))) {
      expect(value).toContain('BEGIN AGE ENCRYPTED FILE');
    }
  });

  it('the manifest passes its schema', () => {
    expect(validManifest(manifest()), JSON.stringify(validManifest.errors)).toBe(true);
  });

  it('the same manifest, written as manifest 1 says, passes the first schema', () => {
    expect(validManifest1(manifest1()), JSON.stringify(validManifest1.errors)).toBe(true);
  });
});

describe('suite.yml', () => {
  const refused = (change: (value: Suite) => void) => {
    const value = suite();
    change(value);
    return !validSuite(value);
  };

  it('needs what makes an instance, and nothing else, so no app is required', () => {
    for (const field of ['schema', 'domain', 'core', 'database', 'server', 'secrets']) {
      expect(validSuite(without(suite(), field)), field).toBe(false);
    }
    expect(validSuite(without(suite(), 'apps'))).toBe(true);
    expect(refused((value) => (value.unknown = true))).toBe(true);
  });

  it('refuses a schema version it does not read', () => {
    expect(refused((value) => (value.schema = 2))).toBe(true);
  });

  it.each([
    ['a scheme', 'https://sovereign.fs'],
    ['a path', 'sovereign.fs/core'],
    ['capitals', 'Sovereign.fs'],
    ['no dot', 'localhost'],
  ])('refuses a domain with %s', (_, domain) => {
    expect(refused((value) => (value.domain = domain))).toBe(true);
  });

  it('refuses every variable the deployment provides or refuses, with or without _FILE', () => {
    const names = /`core\.env` MUST NOT hold[\s\S]*?\n\n([\s\S]*?)\n\n/.exec(
      read('contracts/suite.md'),
    );
    const listed = [...(names?.[1] ?? '').matchAll(/`(SV_[A-Z_]+)`/g)].map((match) => match[1]);
    expect(listed).toContain('SV_AUTH_COOKIE_DOMAIN');
    expect(listed.length).toBeGreaterThan(8);
    for (const name of listed.flatMap((variable) => [variable, `${variable}_FILE`])) {
      expect(
        refused((value) => (value.core.env = { [String(name)]: 'x' })),
        name,
      ).toBe(true);
    }
  });

  it.each(['SV_SMTP_PASSWORD', 'SV_X_SECRET', 'SV_X_KEY', 'SV_X_KEYS', 'SV_X_TOKEN', 'SMTP_HOST'])(
    'refuses %s in core.env, a secret or another app’s name',
    (name) => {
      expect(refused((value) => (value.core.env = { [name]: 'x' }))).toBe(true);
    },
  );

  it('takes an ordinary setting, including one with a secret word inside its name', () => {
    expect(refused((value) => (value.core.env = { SV_AUTH_PASSWORD_MIN_LENGTH: '12' }))).toBe(
      false,
    );
  });

  it.each(['core', 'proxy', 'database', 'www', 'api', 'auth', 'Notes', 'a', '-notes', 'notes-'])(
    'refuses %s as an app name',
    (name) => {
      expect(
        refused((value) => (value.apps[name] = { image: 'ghcr.io/example/notes:1.2.0' })),
      ).toBe(true);
    },
  );

  it.each([
    ['no tag', 'ghcr.io/example/notes', true],
    ['latest', 'ghcr.io/example/notes:latest', true],
    ['a tag', 'ghcr.io/example/notes:1.2.0', false],
    ['a registry port', 'registry.sovereign.local:5000/notes:1.2.0', false],
    ['a digest', `ghcr.io/example/notes@sha256:${'a'.repeat(64)}`, false],
  ])('an image with %s', (_, image, bad) => {
    expect(refused((value) => (value.apps.notes = { image }))).toBe(bad);
  });

  it('an app is hosted or external, not both or neither', () => {
    const external = {
      external: true,
      name: 'Wiki',
      redirect: ['https://wiki.sovereign.local/cb'],
    };
    expect(refused((value) => (value.apps.wiki = external))).toBe(false);
    expect(
      refused((value) => (value.apps.wiki = { ...external, image: 'ghcr.io/x/wiki:1.0.0' })),
    ).toBe(true);
    expect(refused((value) => (value.apps.wiki = { name: 'Wiki' }))).toBe(true);
  });

  it('an external app’s addresses are https and exact, and roles needs trust', () => {
    const wiki = { external: true, name: 'Wiki', redirect: ['https://wiki.sovereign.local/cb'] };
    const redirect = (url: string) => ({ ...wiki, redirect: [url] });
    expect(refused((value) => (value.apps.wiki = redirect('http://wiki.sovereign.local/cb')))).toBe(
      true,
    );
    expect(refused((value) => (value.apps.wiki = redirect('https://*.sovereign.local/cb')))).toBe(
      true,
    );
    expect(refused((value) => (value.apps.wiki = { ...wiki, redirect: [] }))).toBe(true);
    expect(refused((value) => (value.apps.wiki = { ...wiki, scopes: ['roles'] }))).toBe(true);
    expect(
      refused((value) => (value.apps.wiki = { ...wiki, scopes: ['roles'], trusted: true })),
    ).toBe(false);
  });
});

describe('the manifest', () => {
  const refused = (change: (value: Record<string, unknown>) => void) => {
    const value = manifest();
    change(value);
    return !validManifest(value);
  };
  const signIn = { redirect: ['/cb'], scopes: ['openid'] };

  it('needs what hosting an app depends on, and no more', () => {
    for (const field of ['manifest', 'prefix', 'name', 'port', 'health']) {
      expect(validManifest(without(manifest(), field)), field).toBe(false);
    }
    const bare = { manifest: 2, prefix: 'notes', name: 'Notes', port: 3000, health: '/h' };
    expect(validManifest(bare), JSON.stringify(validManifest.errors)).toBe(true);
  });

  it('refuses a field it does not know, so a new one is never silently ignored', () => {
    expect(refused((value) => (value.extra = true))).toBe(true);
  });

  it.each([
    ['core’s own', 'sv'],
    ['upper case', 'NOTES'],
    ['a hyphen', 'my-notes'],
    ['a digit first', '2fa'],
    ['a trailing underscore', 'notes_'],
  ])('refuses a prefix of %s', (_, prefix) => {
    expect(refused((value) => (value.prefix = prefix))).toBe(true);
  });

  it.each([
    ['a host', 'https://notes.sovereign.local/cb'],
    ['no leading slash', 'cb'],
    ['a way up', '/a/../cb'],
    ['a query', '/cb?x=1'],
    ['a fragment', '/cb#x'],
  ])('refuses a sign-in path with %s', (_, redirect) => {
    expect(refused((value) => (value.signIn = { redirect: [redirect], scopes: ['openid'] }))).toBe(
      true,
    );
  });

  it('needs openid, and takes only the scopes core has', () => {
    const scopes = (list: string[]) => (value: Record<string, unknown>) => {
      value.signIn = { redirect: ['/cb'], scopes: list };
    };
    expect(refused(scopes(['profile']))).toBe(true);
    expect(refused(scopes(['openid', 'files']))).toBe(true);
    expect(refused(scopes(['openid', 'roles']))).toBe(false);
  });

  it('may have no sign-in, and then has no client, so nothing for a launcher entry', () => {
    const hosted = { manifest: 2, prefix: 'kiosk', name: 'Kiosk', port: 3000, health: '/h' };
    expect(validManifest(hosted)).toBe(true);
    expect(validManifest({ ...hosted, database: true, data: ['/data'] })).toBe(true);
    expect(validManifest({ ...hosted, core: '>=0.57.0' })).toBe(true);
    expect(validManifest({ ...hosted, icon: '/icon.svg' })).toBe(false);
    expect(validManifest({ ...hosted, launch: '/' })).toBe(false);
  });

  it('needs the core versions it works with when it signs people in through core', () => {
    expect(refused((value) => (value.signIn = signIn))).toBe(false);
    expect(validManifest(without(manifest(), 'core'))).toBe(false);
  });

  it('makes secrets of 16 to 64 bytes, 48 when it does not say, each named once in its own shape', () => {
    const generate = (entries: unknown[]) => (value: Record<string, unknown>) => {
      value.generate = entries;
    };
    expect(
      refused(generate(['NOTES_A', { name: 'NOTES_B', bytes: 32 }, { name: 'NOTES_C' }])),
    ).toBe(false);
    expect(
      refused(
        generate([
          { name: 'NOTES_A', bytes: 16 },
          { name: 'NOTES_B', bytes: 64 },
        ]),
      ),
    ).toBe(false);
    for (const bytes of [8, 15, 65, 32.5, '32']) {
      expect(refused(generate([{ name: 'NOTES_A', bytes }])), String(bytes)).toBe(true);
    }
    expect(refused(generate([{ name: 'NOTES_A', size: 32 }]))).toBe(true);
    expect(refused(generate([{ bytes: 32 }]))).toBe(true);
    expect(refused(generate(['notes_a']))).toBe(true);
  });

  it('is manifest 2, and refuses a manifest 1 document', () => {
    expect(validManifest(manifest1())).toBe(false);
    expect(refused((value) => (value.manifest = 1))).toBe(true);
  });
});

describe('manifest 1, which stays readable', () => {
  const refused = (change: (value: Record<string, unknown>) => void) => {
    const value = manifest1();
    change(value);
    return !validManifest1(value);
  };

  it('differs from manifest 2 as app-manifest §5.1 says', () => {
    for (const field of ['manifest', 'prefix', 'name', 'port', 'health', 'signIn', 'core']) {
      expect(validManifest1(without(manifest1(), field)), field).toBe(false);
    }
    expect(refused((value) => (value.prefix = 'notes'))).toBe(true);
    expect(refused((value) => (value.prefix = 'SV'))).toBe(true);
    expect(refused((value) => (value.generate = [{ name: 'NOTES_A', bytes: 32 }]))).toBe(true);
    expect(refused((value) => (value.manifest = 2))).toBe(true);
  });

  it('is described by the table of §5.1, field for field', () => {
    const section = /### 5\.1 Manifest 1([\s\S]*)$/.exec(read('contracts/app-manifest.md'));
    const fields = [...(section?.[1] ?? '').matchAll(/^\| `(\w+)`/gm)].map((match) => match[1]);
    expect(fields).toEqual(['prefix', 'signIn', 'core', 'generate']);
  });
});

describe('where the specifications meet', () => {
  it('every variable an app is given is a shared name of contracts/env.md', () => {
    const shared = read('contracts/env.md');
    const given = /## 3\. What an app is given([\s\S]*?)\n## /.exec(
      read('contracts/app-manifest.md'),
    );
    const names = [...(given?.[1] ?? '').matchAll(/`<PREFIX>_([A-Z_]+)`/g)].map(
      (match) => match[1],
    );
    expect(names.length).toBeGreaterThan(4);
    for (const name of names) expect(shared, name).toContain(`\`${String(name)}\``);
  });

  it('the port an app is given is the platform’s, which contracts/env.md leaves unprefixed', () => {
    const given = /## 3\. What an app is given([\s\S]*?)\n## /.exec(
      read('contracts/app-manifest.md'),
    );
    expect(given?.[1]).toMatch(/^\| `PORT`\s+\| Always/m);
    expect(read('contracts/env.md')).toMatch(/not Sovereign's and are not prefixed/);
    expect(read('contracts/env.md')).toMatch(/`PORT`/);
  });
});
