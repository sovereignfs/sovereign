import { describe, expect, it } from 'vitest';
import { RELEASE } from '../release.js';
import { lockProblems, refreshedLock, wantedImages } from './lock.js';
import type { Lock, Suite } from './types.js';

const suite = (apps: Suite['apps'] = {}): Suite => ({
  schema: 1,
  domain: 'sovereign.example.com',
  core: { version: '0.71.0' },
  database: { version: '18' },
  server: { host: 'h.example.com' },
  secrets: { recipients: ['age1zvkyg2lqzraa2lnjvqej32nkuu0ues2s82hzrye869xeexvn73equnujwj'] },
  ...(Object.keys(apps).length > 0 ? { apps } : {}),
});
const digestOf = (ref: string) =>
  `sha256:${Buffer.from(ref).toString('hex').padEnd(64, '0').slice(0, 64)}`;

describe('the images a suite runs', () => {
  it('are the toolkit, core at its version, the database at its major, the proxy, and each hosted app, and not an external one', () => {
    const wanted = wantedImages(
      suite({
        notes: { image: 'ghcr.io/e/notes:1.2.0' },
        wiki: { external: true, name: 'Wiki', redirect: ['https://w.example.com/cb'] },
      }),
    );
    expect(wanted).toEqual({
      cli: `${RELEASE.images.cli}:${RELEASE.version}`,
      core: 'ghcr.io/sovereignfs/sovereign:0.71.0',
      database: 'postgres:18',
      proxy: RELEASE.images.proxy,
      apps: { notes: 'ghcr.io/e/notes:1.2.0' },
    });
  });
});

describe('writing the lock', () => {
  it('resolves every image once for a new suite, and an external app is not in it', async () => {
    const asked: string[] = [];
    const lock = await refreshedLock(
      suite({
        notes: { image: 'ghcr.io/e/notes:1' },
        wiki: { external: true, name: 'W', redirect: ['https://w.example.com/cb'] },
      }),
      undefined,
      async (ref) => (asked.push(ref), digestOf(ref)),
    );
    expect(asked).toHaveLength(5);
    expect(Object.keys(lock.apps ?? {})).toEqual(['notes']);
    expect(lock.images.core.digest).toBe(digestOf('ghcr.io/sovereignfs/sovereign:0.71.0'));
  });

  it('leaves what is pinned alone, so a tag that moved cannot change what runs, and resolves only what is new or changed', async () => {
    const first = await refreshedLock(
      suite({ notes: { image: 'ghcr.io/e/notes:1' } }),
      undefined,
      async (ref) => digestOf(ref),
    );
    const asked: string[] = [];
    const moved = async (ref: string) => (asked.push(ref), `sha256:${'f'.repeat(64)}`);
    const same = await refreshedLock(
      suite({ notes: { image: 'ghcr.io/e/notes:1' } }),
      first,
      moved,
    );
    expect(same).toEqual(first);
    expect(asked).toEqual([]);
    const next = await refreshedLock(
      suite({ notes: { image: 'ghcr.io/e/notes:2' }, other: { image: 'ghcr.io/e/other:1' } }),
      first,
      moved,
    );
    expect(asked).toEqual(['ghcr.io/e/notes:2', 'ghcr.io/e/other:1']);
    expect(next.images).toEqual(first.images);
  });

  it('drops an app that is no longer in suite.yml', async () => {
    const first = await refreshedLock(
      suite({ notes: { image: 'ghcr.io/e/notes:1' } }),
      undefined,
      async (ref) => digestOf(ref),
    );
    const next = await refreshedLock(suite(), first, async (ref) => digestOf(ref));
    expect(next.apps).toBeUndefined();
  });
});

describe('what the lock must match', () => {
  const lockFor = async (s: Suite): Promise<Lock> =>
    refreshedLock(s, undefined, async (ref) => digestOf(ref));

  it('has nothing to say about a lock written for the suite', async () => {
    const s = suite({ notes: { image: 'ghcr.io/e/notes:1' } });
    expect(lockProblems(s, await lockFor(s))).toEqual([]);
  });

  it('says each difference: a ref that moved, an app missing, an app left over', async () => {
    const written = await lockFor(
      suite({ notes: { image: 'ghcr.io/e/notes:1' }, old: { image: 'ghcr.io/e/old:1' } }),
    );
    const problems = lockProblems(
      {
        ...suite({ notes: { image: 'ghcr.io/e/notes:2' }, new: { image: 'ghcr.io/e/new:1' } }),
        core: { version: '0.70.0' },
      },
      written,
    );
    expect(problems.map((p) => p.at).sort()).toEqual([
      'apps.new',
      'apps.notes',
      'apps.old',
      'images.core',
    ]);
  });
});

describe('Mailpit in the lock', () => {
  const lockFor = (s: Suite): Promise<Lock> =>
    refreshedLock(s, undefined, async (ref) => digestOf(ref));

  it('is wanted on a development or staging instance, and not on production or when the operator names a mail server', () => {
    expect(wantedImages({ ...suite(), environment: 'development' }).mail).toBe(RELEASE.images.mail);
    expect(wantedImages({ ...suite(), environment: 'staging' }).mail).toBe(RELEASE.images.mail);
    expect(wantedImages({ ...suite(), environment: 'production' }).mail).toBeUndefined();
    expect(wantedImages(suite()).mail).toBeUndefined();
    const own: Suite = {
      ...suite(),
      environment: 'staging',
      core: { version: '0.71.0', env: { SV_SMTP_HOST: 'smtp.example.com' } },
    };
    expect(wantedImages(own).mail).toBeUndefined();
  });

  it('is pinned when wanted, and the lock is refused when it is missing or no longer wanted', async () => {
    const dev: Suite = { ...suite(), environment: 'development' };
    const lock = await lockFor(dev);
    expect(lock.images.mail?.ref).toBe(RELEASE.images.mail);
    expect(lockProblems(dev, lock)).toEqual([]);

    const { mail: _mail, ...without } = lock.images;
    expect(lockProblems(dev, { ...lock, images: without as Lock['images'] })).toEqual([
      { at: 'images.mail', message: 'is not in suite.lock' },
    ]);
    expect(lockProblems(suite(), lock)).toEqual([
      { at: 'images.mail', message: 'is in suite.lock and suite.yml does not use it' },
    ]);
    expect((await lockFor(suite())).images.mail).toBeUndefined();
  });
});
