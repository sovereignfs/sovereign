import { describe, expect, it } from 'vitest';
import { parse, UsageError } from '../admin/args';
import { runAdmin, type InstanceOperations } from '../admin/run';
import { SeedError, type SeedReport } from '../dev/seed';
import { ROLE_ADMIN, ROLE_OWNER } from '../auth/roles';

const REPORT: SeedReport = {
  environment: 'staging',
  accounts: {
    created: [
      { email: 'owner@sovereign.local', role: ROLE_OWNER, password: 'owner-password-0123456789' },
      { email: 'admin@sovereign.local', role: ROLE_ADMIN, password: 'admin-password-0123456789' },
    ],
    existing: ['user@sovereign.local'],
  },
  app: {
    key: 'seed-sample',
    clientId: 'sample-client',
    redirect: 'https://sample.core.sovereign.test/callback',
    created: true,
  },
};

describe('sovereign-admin seed: the command line', () => {
  it('takes --local and --json, and nothing else', () => {
    expect(parse(['seed'])).toEqual({ name: 'seed', local: false, json: false });
    expect(parse(['seed', '--local', '--json'])).toEqual({ name: 'seed', local: true, json: true });
    expect(() => parse(['seed', 'now'])).toThrow(UsageError);
    expect(() => parse(['seed', '--password', 'x'])).toThrow('unknown option --password');
    expect(() => parse(['seed', '--local=yes'])).toThrow('takes no value');
  });
});

describe('sovereign-admin seed: what it says', () => {
  const run = async (
    argv: string[],
    seed: InstanceOperations['seed'] = () => Promise.resolve(REPORT),
  ) => {
    const out: string[] = [];
    const log: string[] = [];
    const asked: { local: boolean }[] = [];
    const code = await runAdmin(
      argv,
      {} as never,
      {} as never,
      { out: (line) => out.push(line), log: (line) => log.push(line) },
      {
        restore: () => Promise.reject(new Error('unused')),
        exportDeletions: () => Promise.resolve(''),
        applyDeletions: () => Promise.reject(new Error('unused')),
        seed: (options) => {
          asked.push(options);
          return seed(options);
        },
      },
    );
    return { code, out, log, asked };
  };

  it('answers with each new account and its password, once, and says which it kept', async () => {
    const done = await run(['seed']);
    expect(done.code).toBe(0);
    expect(done.out.join('\n')).toContain(
      'owner@sovereign.local\tplatform:owner\tpassword: owner-password-0123456789',
    );
    expect(done.out.join('\n')).toContain(
      'admin@sovereign.local\tplatform:admin\tpassword: admin-password-0123456789',
    );
    expect(done.out.join('\n')).toContain('user@sovereign.local\tkept');
    expect(done.out.join('\n')).toContain('client id: sample-client');
  });

  it('never writes a password to the log, which a container keeps', async () => {
    for (const argv of [['seed'], ['seed', '--json']]) {
      const done = await run(argv);
      const log = done.log.join('\n');
      expect(log).not.toContain('password-0123456789');
      expect(log).toContain('made platform:owner owner@sovereign.local');
      expect(log).toContain('kept user@sovereign.local');
      expect(log).toContain('made app seed-sample');
    }
  });

  it('answers with the whole report as JSON on one line', async () => {
    const done = await run(['seed', '--json']);
    expect(done.out).toHaveLength(1);
    expect(JSON.parse(done.out[0] as string)).toEqual(REPORT);
  });

  it('passes --local on, and not by default', async () => {
    expect((await run(['seed'])).asked).toEqual([{ local: false }]);
    expect((await run(['seed', '--local'])).asked).toEqual([{ local: true }]);
  });

  it('exits 3 with the reason, and answers nothing, when the seed is refused', async () => {
    const done = await run(['seed'], () =>
      Promise.reject(
        new SeedError(
          'Seeding is for development and staging instances, and this one is production.',
        ),
      ),
    );
    expect(done.code).toBe(3);
    expect(done.out).toEqual([]);
    expect(done.log.join('\n')).toContain('this one is production');
  });
});
