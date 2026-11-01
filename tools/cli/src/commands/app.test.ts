import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { Lock, Suite } from '../suite/types.js';
import { NOTES_IMAGE, setUpWorld, sv } from '../testing/commands.js';
import { makeWorld, manifestOf, type World } from '../testing/world.js';

let world: World;
afterEach(() => world.cleanup());
const file = (name: string) => readFileSync(path.join(world.root, name), 'utf8');
const suite = () => parse(file('suite.yml')) as Suite;
const lock = () => parse(file('suite.lock')) as Lock;
const withNotes = async (options: Parameters<typeof makeWorld>[0] = {}) => {
  world = makeWorld({ images: { [NOTES_IMAGE]: { manifest: manifestOf() } }, ...options });
  await setUpWorld(world);
};

describe('sv app add', () => {
  it('adds a hosted app from the label on its image, shows what it asks for, and pins its digest', async () => {
    await withNotes();
    const done = await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    expect(done.code).toBe(0);
    expect(suite().apps?.notes).toEqual({ image: NOTES_IMAGE });
    expect(lock().apps?.notes).toEqual({ ref: NOTES_IMAGE, digest: `sha256:${'a'.repeat(64)}` });
    expect(done.text).toContain('Notes (notes) at https://notes.sovereign.local');
    expect(done.text).toContain('openid, profile, email');
    expect(done.text).toContain('It gets its own database.');
  });

  it('says plainly that an app which asks for roles is trusted', async () => {
    await withNotes({
      images: {
        [NOTES_IMAGE]: {
          manifest: manifestOf({ signIn: { redirect: ['/cb'], scopes: ['openid', 'roles'] } }),
        },
      },
    });
    const done = await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    expect(done.text).toContain('trusted: people are not asked about it');
  });

  it('asks before it adds, and does nothing when the answer is no or there is nobody to ask', async () => {
    await withNotes();
    const refusedAtLast = await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE);
    expect(refusedAtLast.code).toBe(2);
    expect(refusedAtLast.text).toContain('Pass --yes to confirm.');
    expect(suite().apps).toBeUndefined();
  });

  it('does nothing when the answer is not a yes', async () => {
    world = makeWorld({
      interactive: true,
      answers: ['sovereign.local', '', 'ssh', 'per-host', '', '', 'no'],
      images: { [NOTES_IMAGE]: { manifest: manifestOf() } },
    });
    await sv(world, 'setup');
    const done = await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE);
    expect(done.code).toBe(2);
    expect(done.text).toContain('Not confirmed. Nothing was changed.');
    expect(suite().apps).toBeUndefined();
  });

  it('refuses an image with no manifest, an app whose core range excludes the instance, and an env name outside its prefix', async () => {
    await withNotes({ images: { [NOTES_IMAGE]: {} } });
    expect(
      (await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes')).text,
    ).toContain('no io.github.sovereignfs.app-manifest label');
    world.cleanup();

    await withNotes({ images: { [NOTES_IMAGE]: { manifest: manifestOf({ core: '>=0.99.0' }) } } });
    expect((await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes')).code).toBe(2);
    world.cleanup();

    await withNotes();
    const bad = await sv(
      world,
      'app',
      'add',
      'notes',
      '--image',
      NOTES_IMAGE,
      '--env',
      'OTHER_X=1',
      'NOTES_URL=x',
      'NOTES_POSTGRES_POOL_MAX=50',
      '--yes',
    );
    expect(bad.code).toBe(2);
    expect(bad.text).toContain('NOTES_POSTGRES_POOL_MAX');
    expect(bad.text).toContain('must begin with NOTES_');
    expect(bad.text).toContain('is given to the app by the deployment');
    expect(suite().apps).toBeUndefined();
  });

  it('refuses a name that is taken, reserved or not a name, and a name waiting to be purged', async () => {
    await withNotes();
    await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    expect(
      (await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes')).text,
    ).toContain('already an app');
    expect((await sv(world, 'app', 'add', 'core', '--image', NOTES_IMAGE, '--yes')).text).toContain(
      'reserved',
    );
    expect(
      (await sv(world, 'app', 'add', 'Bad_Name', '--image', NOTES_IMAGE, '--yes')).text,
    ).toContain('not a name an app can have');
    await sv(world, 'app', 'remove', 'notes', '--purge', '--yes-delete-data', 'notes');
    expect(
      (await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes')).text,
    ).toContain('waiting to have its data purged');
  });

  it('writes nothing, not even the lock, when the registry cannot say what an image is', async () => {
    await withNotes({ images: {} });
    const lockBefore = file('suite.lock');
    const done = await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    expect(done.code).toBe(1);
    expect(suite().apps).toBeUndefined();
    expect(file('suite.lock')).toBe(lockBefore);
  });

  it('adds an external app with only a sign-in, untrusted unless said, and out of the lock', async () => {
    await withNotes();
    const done = await sv(
      world,
      'app',
      'add',
      'wiki',
      '--external',
      '--name',
      'Team wiki',
      '--redirect',
      'https://wiki.sovereign.local/cb',
      '--scope',
      'openid',
      'profile',
    );
    expect(done.code).toBe(0);
    expect(suite().apps?.wiki).toEqual({
      external: true,
      name: 'Team wiki',
      redirect: ['https://wiki.sovereign.local/cb'],
      scopes: ['openid', 'profile'],
    });
    expect(lock().apps).toBeUndefined();
    expect(done.text).toContain('sv app show NAME --secret');
  });

  it('refuses an external app without a name or an address, and one that asks for roles without being trusted', async () => {
    await withNotes();
    expect((await sv(world, 'app', 'add', 'wiki', '--external', '--name', 'W')).text).toContain(
      'needs --name and at least one --redirect',
    );
    const roles = await sv(
      world,
      'app',
      'add',
      'wiki',
      '--external',
      '--name',
      'W',
      '--redirect',
      'https://w.sovereign.local/cb',
      '--scope',
      'openid',
      'roles',
    );
    expect(roles.code).toBe(2);
    expect(
      (
        await sv(
          world,
          'app',
          'add',
          'wiki',
          '--external',
          '--name',
          'W',
          '--redirect',
          'https://w.sovereign.local/cb',
          '--scope',
          'openid',
          'roles',
          '--trusted',
        )
      ).code,
    ).toBe(0);
  });
});

describe('sv app update', () => {
  const add = async () => {
    await withNotes();
    await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
  };

  it('moves a hosted app to another image and pins that one', async () => {
    const next = 'ghcr.io/example/notes:1.3.0';
    await withNotes({
      images: {
        [NOTES_IMAGE]: { manifest: manifestOf() },
        [next]: { digest: `sha256:${'b'.repeat(64)}`, manifest: manifestOf() },
      },
    });
    await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    const done = await sv(world, 'app', 'update', 'notes', '--image', next);
    expect(done.code).toBe(0);
    expect(suite().apps?.notes).toEqual({ image: next });
    expect(lock().apps?.notes?.digest).toBe(`sha256:${'b'.repeat(64)}`);
  });

  it('sets and unsets environment, and the launcher, keeping what it is not told to change', async () => {
    await add();
    await sv(
      world,
      'app',
      'update',
      'notes',
      '--env',
      'NOTES_DEFAULT_LOCALE=en',
      'NOTES_TITLE=Ours',
      '--description',
      'Notes for us',
    );
    expect(suite().apps?.notes).toEqual({
      image: NOTES_IMAGE,
      env: { NOTES_DEFAULT_LOCALE: 'en', NOTES_TITLE: 'Ours' },
      launcher: { description: 'Notes for us' },
    });
    await sv(world, 'app', 'update', 'notes', '--unset-env', 'NOTES_TITLE', '--hide');
    expect(suite().apps?.notes).toMatchObject({
      env: { NOTES_DEFAULT_LOCALE: 'en' },
      launcher: { description: 'Notes for us', show: false },
    });
    await sv(world, 'app', 'update', 'notes', '--unset-env', 'NOTES_DEFAULT_LOCALE');
    expect((suite().apps?.notes as { env?: unknown }).env).toBeUndefined();
  });

  it('refuses an option that is for the other kind of app, and an update that changes nothing', async () => {
    await add();
    expect(
      (await sv(world, 'app', 'update', 'notes', '--redirect', 'https://x.sovereign.local/cb'))
        .text,
    ).toContain('--redirect is for external apps');
    expect((await sv(world, 'app', 'update', 'notes')).text).toContain('Nothing to change');
    expect((await sv(world, 'app', 'update', 'missing', '--hide')).text).toContain(
      'not an app in suite.yml',
    );
  });

  it('changes an external app’s addresses wholesale, and its trust', async () => {
    await withNotes();
    await sv(
      world,
      'app',
      'add',
      'wiki',
      '--external',
      '--name',
      'Wiki',
      '--redirect',
      'https://w.sovereign.local/cb',
    );
    await sv(
      world,
      'app',
      'update',
      'wiki',
      '--redirect',
      'https://w.sovereign.local/a',
      'https://w.sovereign.local/b',
      '--trusted',
      '--name',
      'Team wiki',
    );
    expect(suite().apps?.wiki).toMatchObject({
      name: 'Team wiki',
      redirect: ['https://w.sovereign.local/a', 'https://w.sovereign.local/b'],
      trusted: true,
    });
    expect((await sv(world, 'app', 'update', 'wiki', '--image', 'x:1')).text).toContain(
      '--image is for hosted apps',
    );
  });
});

describe('sv app remove', () => {
  it('takes an app out of suite.yml and the lock and says its data stays', async () => {
    await withNotes();
    await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    const done = await sv(world, 'app', 'remove', 'notes');
    expect(done.code).toBe(0);
    expect(suite().apps).toBeUndefined();
    expect(suite().purge).toBeUndefined();
    expect(lock().apps).toBeUndefined();
    expect(done.text).toContain('Its data stays on the server');
  });

  it('records a purge only with the name typed, or --yes-delete-data NAME when there is no terminal', async () => {
    await withNotes();
    await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    const refused = await sv(world, 'app', 'remove', 'notes', '--purge');
    expect(refused.code).toBe(2);
    expect(refused.text).toContain('--yes-delete-data notes');
    expect(suite().apps?.notes).toBeDefined();
    expect(
      (await sv(world, 'app', 'remove', 'notes', '--purge', '--yes-delete-data', 'wrong')).code,
    ).toBe(2);
    expect(suite().apps?.notes).toBeDefined();
    const done = await sv(world, 'app', 'remove', 'notes', '--purge', '--yes-delete-data', 'notes');
    expect(done.code).toBe(0);
    expect(suite().purge).toEqual(['notes']);
    expect(suite().apps).toBeUndefined();
  });

  it('asks for the name when it can, and does nothing if it is not typed', async () => {
    world = makeWorld({
      interactive: true,
      answers: ['sovereign.local', '', 'ssh', 'per-host', '', ''],
      images: { [NOTES_IMAGE]: { manifest: manifestOf() } },
    });
    await sv(world, 'setup');
    world.said.answers.push('yes');
    await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE);
    expect(suite().apps?.notes).toBeDefined();
    world.said.answers.push('oops');
    const done = await sv(world, 'app', 'remove', 'notes', '--purge');
    expect(done.code).toBe(2);
    expect(done.text).toContain('not the app’s');
    expect(suite().apps?.notes).toBeDefined();
    expect(suite().purge).toBeUndefined();
  });

  it('refuses --yes-delete-data without --purge, and an app that is not there', async () => {
    await withNotes();
    expect((await sv(world, 'app', 'remove', 'notes')).text).toContain('not an app in suite.yml');
    await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    expect(
      (await sv(world, 'app', 'remove', 'notes', '--yes-delete-data', 'notes')).text,
    ).toContain('goes with --purge');
  });
});

describe('sv app list', () => {
  it('lists hosted and external apps, and gives a document with --json', async () => {
    await withNotes();
    expect((await sv(world, 'app', 'list')).out).toEqual(['No apps. sv app add adds one.']);
    await sv(world, 'app', 'add', 'notes', '--image', NOTES_IMAGE, '--yes');
    await sv(
      world,
      'app',
      'add',
      'wiki',
      '--external',
      '--name',
      'Wiki',
      '--redirect',
      'https://w.sovereign.local/cb',
    );
    const text = await sv(world, 'app', 'list');
    expect(text.out).toEqual([
      `notes\thosted\thttps://notes.sovereign.local\t${NOTES_IMAGE}`,
      'wiki\texternal\tWiki',
    ]);
    const json = await sv(world, 'app', 'list', '--json');
    expect(json.err).toEqual([]);
    expect(JSON.parse(json.out.join('\n'))).toEqual({
      apps: [
        {
          name: 'notes',
          kind: 'hosted',
          image: NOTES_IMAGE,
          address: 'https://notes.sovereign.local',
        },
        {
          name: 'wiki',
          kind: 'external',
          displayName: 'Wiki',
          redirect: ['https://w.sovereign.local/cb'],
          address: null,
        },
      ],
    });
  });

  it('says what is not in this version, and what it does not know', async () => {
    await withNotes();
    expect((await sv(world, 'app', 'show', 'notes')).code).toBe(2);
    expect((await sv(world, 'app', 'wat')).text).toContain('Usage: sv app');
  });
});
