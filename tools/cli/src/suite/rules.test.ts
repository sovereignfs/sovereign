import { describe, expect, it } from 'vitest';
import { looksLikeSecret, suiteProblems } from './rules.js';
import { schemaProblems } from './schema.js';
import type { Suite } from './types.js';

const suite = (extra: Partial<Suite> = {}): Suite => ({
  schema: 1,
  domain: 'sovereign.example.com',
  core: { version: '0.71.0' },
  database: { version: '18' },
  server: { host: '203.0.113.7' },
  secrets: { recipients: ['age1zvkyg2lqzraa2lnjvqej32nkuu0ues2s82hzrye869xeexvn73equnujwj'] },
  ...extra,
});

describe('what looks like a secret', () => {
  it.each([
    'AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ',
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'postgres://app:hunter2@db.example.com/app',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'sk-abcdefghijklmnopqrstuvwxyz0123456789',
    'dGhpcyBpcyBhIHZlcnkgbG9uZyBiYXNlNjQgdmFsdWUgdGhhdCBsb29rcyBsaWtlIGEga2V5',
    'a'.repeat(40),
  ])('catches %s', (value) => {
    expect(looksLikeSecret(value)).toBe(true);
  });

  it.each([
    'smtp.example.com',
    '587',
    'en',
    'true',
    'https://example.com/a/path',
    'postgres://db.example.com/app',
    'a short phrase with spaces that is plainly not a key at all, whatever its length',
    'Europe/Paris',
  ])('lets %s through', (value) => {
    expect(looksLikeSecret(value)).toBe(false);
  });
});

describe('the rules a schema cannot say about suite.yml', () => {
  it('has none to find in a plain one', () => {
    expect(suiteProblems(suite())).toEqual([]);
  });

  it('refuses a core outside what the toolkit deploys, naming the way out', () => {
    const [problem] = suiteProblems(suite({ core: { version: '0.10.0' } }));
    expect(problem?.at).toBe('core.version');
    expect(problem?.message).toContain('sv upgrade');
  });

  it('refuses a secret-looking value in core’s or an app’s environment, and says where it goes', () => {
    const problems = suiteProblems(
      suite({
        core: {
          version: '0.71.0',
          env: { SV_SMTP_HOST: 'smtp.example.com', SV_SMTP_USER: 'postgres://u:pw@h/db' },
        },
        apps: { notes: { image: 'ghcr.io/e/notes:1', env: { NOTES_TOKEN_URL: 'a'.repeat(45) } } },
      }),
    );
    expect(problems.map((p) => p.at)).toEqual([
      'core.env.SV_SMTP_USER',
      'apps.notes.env.NOTES_TOKEN_URL',
    ]);
    expect(problems[0]?.message).toContain('sv secret set');
  });

  it('refuses a name that is purged and still an app', () => {
    const problems = suiteProblems(
      suite({ apps: { notes: { image: 'ghcr.io/e/notes:1' } }, purge: ['notes'] }),
    );
    expect(problems[0]?.message).toContain('notes is purged and is also listed under apps');
  });
});

describe('the schema', () => {
  it('accepts a plain suite and says each thing wrong with one that is not', () => {
    expect(schemaProblems('suite', suite())).toEqual([]);
    const problems = schemaProblems('suite', { ...suite(), domain: 'No Spaces', extra: true });
    expect(problems.map((p) => p.at).sort()).toEqual(['(top level)', 'domain']);
    expect(problems.find((p) => p.at === '(top level)')?.message).toContain('extra is not allowed');
  });

  it.each([
    ['latest', { image: 'ghcr.io/e/notes:latest' }],
    ['no tag', { image: 'ghcr.io/e/notes' }],
    ['a reserved name', undefined],
  ])('refuses an app image with %s', (_name, app) => {
    if (!app) {
      expect(
        schemaProblems('suite', suite({ apps: { core: { image: 'ghcr.io/e/c:1' } } })).length,
      ).toBeGreaterThan(0);
      return;
    }
    expect(schemaProblems('suite', suite({ apps: { notes: app } })).length).toBeGreaterThan(0);
  });

  it('wants an external app that asks for roles to be trusted', () => {
    const external = {
      external: true as const,
      name: 'Wiki',
      redirect: ['https://wiki.example.com/cb'],
      scopes: ['openid', 'roles'],
    };
    expect(schemaProblems('suite', suite({ apps: { wiki: external } })).length).toBeGreaterThan(0);
    expect(
      schemaProblems('suite', suite({ apps: { wiki: { ...external, trusted: true } } })),
    ).toEqual([]);
  });
});
