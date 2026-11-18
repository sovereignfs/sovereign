/**
 * Launcher shortcuts (core-app §3.8.1): a name, an address and an icon. Those for everyone are an operator's to
 * manage; a person's own are theirs alone, found only with their own id, and go with their account. One suite, run
 * by `shortcuts.test.ts` on a SQLite file and by `shortcuts.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { migrateCore } from '../db/migrate';
import {
  MAX_OWN_SHORTCUTS,
  MAX_SHORTCUT_ICON_BYTES,
  ShortcutError,
  ShortcutManager,
  type ShortcutInput,
} from '../shortcuts/manager';
import { png } from './image-fixtures';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function shortcutsSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  let shortcuts: ShortcutManager;

  const owner = { id: 'u-owner', role: ROLE_OWNER };
  const admin = { id: 'u-admin', role: ROLE_ADMIN };
  const ada = { id: 'u-ada', role: ROLE_USER };
  const grace = { id: 'u-grace', role: ROLE_USER };

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    await migrateCore(db, MIGRATIONS);
    shortcuts = new ShortcutManager(db, { development: false });
  });

  afterAll(async () => {
    await db.close().catch(() => undefined);
    await target.cleanup();
  });

  beforeEach(async () => {
    for (const table of ['launcher_shortcuts', 'capability_overrides', 'users']) {
      await db.run(`delete from ${table}`);
    }
    const now = db.family === 'postgres' ? new Date() : Date.now();
    for (const { id, role } of [owner, admin, ada, grace]) {
      await db.run(
        'insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)',
        [id, id, `${id}@sovereign.local`, db.family === 'postgres' ? true : 1, role, now, now],
      );
    }
  });

  const drive: ShortcutInput = { name: 'Proton Drive', url: 'https://drive.proton.me' };
  const refused = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      if (error instanceof ShortcutError) return error;
      throw error;
    }
    throw new Error('it was not refused');
  };

  describe('for everyone', () => {
    it('is added by someone who manages apps, and shown to every person', async () => {
      const made = await shortcuts.create(admin, 'shared', { ...drive, symbol: 'hard-drive' });
      expect(made).toMatchObject({
        ownerId: undefined,
        name: 'Proton Drive',
        url: 'https://drive.proton.me',
        icon: { kind: 'symbol', symbol: 'hard-drive' },
      });
      expect((await shortcuts.forLauncher(ada.id)).map((s) => s.id)).toEqual([made.id]);
      expect((await shortcuts.forLauncher(grace.id)).map((s) => s.id)).toEqual([made.id]);
    });

    it('is refused to a person who does not manage apps, and nothing is kept', async () => {
      expect((await refused(() => shortcuts.create(ada, 'shared', drive))).code).toBe('forbidden');
      expect(await shortcuts.forLauncher(ada.id)).toEqual([]);
    });

    it('is not changed or removed by a person who does not manage apps', async () => {
      const made = await shortcuts.create(owner, 'shared', drive);
      expect((await refused(() => shortcuts.update(ada, 'shared', made.id, drive))).code).toBe(
        'forbidden',
      );
      expect((await refused(() => shortcuts.remove(ada, 'shared', made.id))).code).toBe(
        'forbidden',
      );
      // Nor through their own scope, which never reaches one for everyone.
      expect((await refused(() => shortcuts.remove(ada, 'own', made.id))).code).toBe('not-found');
      expect(await shortcuts.forLauncher(ada.id)).toHaveLength(1);
    });
  });

  describe('a person’s own', () => {
    it('is seen by them alone', async () => {
      const mine = await shortcuts.create(ada, 'own', drive);
      expect(mine.ownerId).toBe(ada.id);
      expect((await shortcuts.forLauncher(ada.id)).map((s) => s.id)).toEqual([mine.id]);
      expect(await shortcuts.forLauncher(grace.id)).toEqual([]);
      expect(await shortcuts.list(owner, 'shared')).toEqual([]);
    });

    it('cannot be read, changed or removed by anyone else, who is told it is not there', async () => {
      const mine = await shortcuts.create(ada, 'own', drive);
      expect(await shortcuts.get(grace, 'own', mine.id)).toBeUndefined();
      expect((await refused(() => shortcuts.update(grace, 'own', mine.id, drive))).code).toBe(
        'not-found',
      );
      expect((await refused(() => shortcuts.remove(grace, 'own', mine.id))).code).toBe('not-found');
      expect((await refused(() => shortcuts.remove(owner, 'shared', mine.id))).code).toBe(
        'not-found',
      );
      expect(await shortcuts.forLauncher(ada.id)).toHaveLength(1);
    });

    it('is refused to someone the matrix denies the launcher', async () => {
      await db.run(
        'insert into capability_overrides (role, capability, granted, updated_at) values (?, ?, ?, ?)',
        [ROLE_USER, 'launcher:access', 0, Date.now()],
      );
      expect((await refused(() => shortcuts.create(ada, 'own', drive))).code).toBe('forbidden');
    });

    it(`is kept up to ${MAX_OWN_SHORTCUTS} at a time`, async () => {
      for (let n = 0; n < MAX_OWN_SHORTCUTS; n += 1) {
        await shortcuts.create(ada, 'own', { ...drive, name: `Site ${n}` });
      }
      expect((await refused(() => shortcuts.create(ada, 'own', drive))).code).toBe('too-many');
      // Another person's count is their own.
      await shortcuts.create(grace, 'own', drive);
    });
  });

  describe('what is entered', () => {
    it.each([
      ['javascript:alert(1)', 'url'],
      ['data:text/html,hi', 'url'],
      ['http://drive.proton.me', 'url'],
      ['https://user:pw@drive.proton.me', 'url'],
      ['', 'url'],
    ])('refuses the address %j', async (url, field) => {
      const error = await refused(() => shortcuts.create(ada, 'own', { ...drive, url }));
      expect(error.code).toBe('invalid');
      expect(error.problems.map((p) => p.field)).toContain(field);
    });

    it('keeps an app’s own address beside the web one, changes it, and drops it when left empty', async () => {
      const spotify = { ...drive, name: 'Music', appUrl: 'spotify:playlist:37i9dQZF1DX' };
      const made = await shortcuts.create(ada, 'own', spotify);
      expect(made.appUrl).toBe('spotify:playlist:37i9dQZF1DX');
      expect(made.url).toBe('https://drive.proton.me');
      const [listed] = await shortcuts.forLauncher(ada.id);
      expect(listed?.appUrl).toBe('spotify:playlist:37i9dQZF1DX');
      const moved = await shortcuts.update(ada, 'own', made.id, {
        ...spotify,
        appUrl: 'obsidian://open?vault=Notes',
      });
      expect(moved.appUrl).toBe('obsidian://open?vault=Notes');
      expect(
        (await shortcuts.update(ada, 'own', made.id, { ...spotify, appUrl: '  ' })).appUrl,
      ).toBeUndefined();
      expect((await shortcuts.create(ada, 'own', drive)).appUrl).toBeUndefined();
    });

    it.each([
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,x',
      'https://drive.proton.me',
      'intent://x#Intent;end',
    ])('refuses %s as an app’s address, and keeps nothing', async (appUrl) => {
      const error = await refused(() => shortcuts.create(ada, 'own', { ...drive, appUrl }));
      expect(error.problems.map((p) => p.field)).toEqual(['appUrl']);
      expect(await shortcuts.forLauncher(ada.id)).toEqual([]);
    });

    it('allows http on localhost only on a development instance', async () => {
      const local = { ...drive, url: 'http://localhost:4000' };
      expect((await refused(() => shortcuts.create(ada, 'own', local))).code).toBe('invalid');
      const development = new ShortcutManager(db, { development: true });
      expect((await development.create(ada, 'own', local)).url).toBe('http://localhost:4000');
    });

    it('needs a name of at most 60 characters and a description of at most 280', async () => {
      const error = await refused(() =>
        shortcuts.create(ada, 'own', { ...drive, name: ' ', description: 'x'.repeat(281) }),
      );
      expect(error.problems.map((p) => p.field).sort()).toEqual(['description', 'name']);
      expect(
        (await refused(() => shortcuts.create(ada, 'own', { ...drive, name: 'x'.repeat(61) })))
          .problems[0]?.field,
      ).toBe('name');
    });

    it('takes only an icon from the offered set, and not with a picture as well', async () => {
      expect(
        (await refused(() => shortcuts.create(ada, 'own', { ...drive, symbol: 'banana' })))
          .problems[0]?.field,
      ).toBe('icon');
      expect(
        (
          await refused(() =>
            shortcuts.create(ada, 'own', { ...drive, symbol: 'link', image: png(32, 32) }),
          )
        ).problems[0]?.field,
      ).toBe('icon');
    });
  });

  describe('a picture', () => {
    it('is kept as its bytes prove it to be, and served to whoever may see the shortcut', async () => {
      const bytes = png(64, 64);
      const shared = await shortcuts.create(owner, 'shared', { ...drive, image: bytes });
      expect(shared.icon).toMatchObject({ kind: 'image' });
      const icon = await shortcuts.icon(ada.id, shared.id);
      expect(icon?.contentType).toBe('image/png');
      expect(icon?.bytes.equals(bytes)).toBe(true);
    });

    it('of a person’s own shortcut is served to them alone', async () => {
      const mine = await shortcuts.create(ada, 'own', { ...drive, image: png(64, 64) });
      expect(await shortcuts.icon(ada.id, mine.id)).toBeDefined();
      expect(await shortcuts.icon(grace.id, mine.id)).toBeUndefined();
    });

    it('is rebuilt when it is an SVG, so a script in it never leaves', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
      );
      const made = await shortcuts.create(ada, 'own', { ...drive, image: svg });
      const icon = await shortcuts.icon(ada.id, made.id);
      expect(icon?.contentType).toBe('image/svg+xml');
      expect(icon?.bytes.toString()).not.toContain('script');
    });

    it('is refused when it is not a picture, or larger than 256 KB', async () => {
      expect(
        (
          await refused(() =>
            shortcuts.create(ada, 'own', { ...drive, image: Buffer.from('not a picture') }),
          )
        ).problems[0]?.field,
      ).toBe('icon');
      const large = Buffer.concat([png(64, 64), Buffer.alloc(MAX_SHORTCUT_ICON_BYTES)]);
      expect(
        (await refused(() => shortcuts.create(ada, 'own', { ...drive, image: large }))).message,
      ).toContain('256 KB');
    });

    it('is kept on a change that uploads nothing, and dropped for a symbol or on request', async () => {
      const made = await shortcuts.create(ada, 'own', { ...drive, image: png(64, 64) });
      const kept = await shortcuts.update(ada, 'own', made.id, { ...drive, keepImage: true });
      expect(kept.icon).toMatchObject({ kind: 'image' });
      const symbol = await shortcuts.update(ada, 'own', made.id, { ...drive, symbol: 'link' });
      expect(symbol.icon).toEqual({ kind: 'symbol', symbol: 'link' });
      expect(await shortcuts.icon(ada.id, made.id)).toBeUndefined();
      const none = await shortcuts.update(ada, 'own', made.id, drive);
      expect(none.icon).toBeUndefined();
    });
  });

  it('lists in name order', async () => {
    await shortcuts.create(owner, 'shared', { ...drive, name: 'Zulip' });
    await shortcuts.create(ada, 'own', { ...drive, name: 'Atlas' });
    await shortcuts.create(owner, 'shared', { ...drive, name: 'Mail' });
    expect((await shortcuts.forLauncher(ada.id)).map((s) => s.name)).toEqual([
      'Atlas',
      'Mail',
      'Zulip',
    ]);
  });
}
