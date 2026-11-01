/**
 * A person's name and picture (core-app §3.11, §3.15) against a real database: the rules on a name,
 * that no request sets the picture, and the store that keeps it, including the binary column on every
 * dialect. One suite, run by `profile.test.ts` on a SQLite file (a plain `pnpm test` covers it) and by
 * `profile.db.test.ts` on whichever dialect the CI leg started.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateCore } from '../db/migrate';
import { ImageError } from '../images/validate';
import { AvatarStore, avatarPath } from '../profile/avatars';
import { call, freshEmail, makeAuth, PASSWORD, signedInAs, signUp } from './auth-harness';
import { JPEG_1X1, png } from './image-fixtures';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function profileSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  const auth = () => makeAuth(db);

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    await migrateCore(db, MIGRATIONS);
  });

  afterAll(async () => {
    await db.close().catch(() => undefined);
    await target.cleanup();
  });

  beforeEach(async () => {
    for (const table of [
      'rate_limits',
      'sessions',
      'avatars',
      'accounts',
      'verifications',
      'users',
    ]) {
      await db.run(`delete from ${table}`);
    }
  });

  const columnOf = async (email: string, column: string) =>
    (await db.run(`select ${column} as value from users where email = ?`, [email])).rows[0]?.value;
  const idOf = async (email: string) => String(await columnOf(email, 'id'));
  const count = async (table: string) =>
    Number((await db.run(`select count(*) as n from ${table}`)).rows[0]?.n);

  describe('a name', () => {
    it.each([
      ['Ada Lovelace', 'Ada Lovelace'],
      ['  Ada  ', 'Ada'],
      ['Zoë Müller-Åström', 'Zoë Müller-Åström'],
      ['田中 太郎', '田中 太郎'],
      ['A', 'A'],
      ['x'.repeat(100), 'x'.repeat(100)],
    ])('is kept, trimmed, at sign-up: %j', async (given, kept) => {
      const email = freshEmail();
      const { reply } = await signUp(auth(), { email, name: given });
      expect(reply.status).toBe(200);
      expect(await columnOf(email, 'name')).toBe(kept);
    });

    it.each([
      ['empty', ''],
      ['only spaces', '   '],
      ['over 100 characters', 'x'.repeat(101)],
      ['with a line break, which would reach an email subject', 'Ada\nBcc: evil@sovereign.local'],
      ['with a tab', 'Ada\tLovelace'],
      ['with a line separator', 'Ada Lovelace'],
      ['with a NUL', 'Ada\u0000'],
    ])('is refused at sign-up when it is %s, and nothing is stored', async (_name, given) => {
      const { reply } = await signUp(auth(), { name: given });
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('INVALID_NAME');
      expect(await count('users')).toBe(0);
    });

    it('can be changed, and the person’s session shows the new one straight away', async () => {
      const a = auth();
      const { jar, email } = await signUp(a, { name: 'Ada' });
      const reply = await call(a, 'POST', '/update-user', {
        jar,
        body: { name: '  Ada Lovelace ' },
      });
      expect(reply.status).toBe(200);
      expect(await columnOf(email, 'name')).toBe('Ada Lovelace');
      // through the signed cache too: the answer to this very request refreshed it
      const cached = await call(a, 'GET', '/get-session', { jar });
      expect(signedInAs(cached)?.name).toBe('Ada Lovelace');
    });

    it.each(['', '   ', 'x'.repeat(101), 'Ada\nLovelace'])(
      'is refused when changed to %j, and stays as it was',
      async (given) => {
        const a = auth();
        const { jar, email } = await signUp(a, { name: 'Ada' });
        const reply = await call(a, 'POST', '/update-user', { jar, body: { name: given } });
        expect(reply.status).toBe(400);
        expect(reply.body.code).toBe('INVALID_NAME');
        expect(await columnOf(email, 'name')).toBe('Ada');
      },
    );
  });

  describe('the email address', () => {
    it('is not changed by an update of the account', async () => {
      const a = auth();
      const { jar, email } = await signUp(a);
      await call(a, 'POST', '/update-user', {
        jar,
        body: { email: 'other@sovereign.local', name: 'Same' },
      });
      expect(await columnOf(email, 'email')).toBe(email);
      expect(await count('users')).toBe(1);
    });

    it('has no endpoint to change it in Phase 1', async () => {
      const a = auth();
      const { jar, email } = await signUp(a);
      const reply = await call(a, 'POST', '/change-email', {
        jar,
        body: { newEmail: 'other@sovereign.local' },
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(await columnOf(email, 'email')).toBe(email);
    });
  });

  describe('the picture’s address', () => {
    it('cannot be set by an update of the account, which would put any address in a page', async () => {
      const a = auth();
      const { jar, email } = await signUp(a);
      for (const image of [
        'https://evil.example/pixel.gif',
        'javascript:alert(1)',
        '/api/avatars/other',
      ]) {
        const reply = await call(a, 'POST', '/update-user', { jar, body: { image } });
        expect(reply.status, image).toBe(400);
        expect(reply.body.code).toBe('FIELD_NOT_ALLOWED');
      }
      expect(await columnOf(email, 'image')).toBeNull();
    });

    it('cannot be set at sign-up either', async () => {
      const reply = await call(auth(), 'POST', '/sign-up/email', {
        body: {
          name: 'Eve',
          email: freshEmail(),
          password: PASSWORD,
          agreedToTerms: true,
          image: 'https://evil.example/pixel.gif',
        },
      });
      expect(reply.status).toBe(400);
      expect(await count('users')).toBe(0);
    });

    it('cannot be cleared by an update either: only removing the picture does that', async () => {
      const a = auth();
      const { jar, email } = await signUp(a);
      const id = await idOf(email);
      await new AvatarStore(db).set(id, png(8, 8));
      const reply = await call(a, 'POST', '/update-user', { jar, body: { image: null } });
      expect(reply.status).toBe(400);
      expect(await columnOf(email, 'image')).not.toBeNull();
    });
  });

  describe('the picture store', () => {
    async function person() {
      const { email } = await signUp(auth());
      return { email, id: await idOf(email) };
    }

    it('keeps a picture byte for byte, whatever the bytes are, and names it on the account', async () => {
      const { email, id } = await person();
      // every byte value, NUL and all, behind a real PNG header, so the binary column is tried hard
      const bytes = Buffer.concat([
        png(16, 16),
        Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
        randomBytes(200_000),
      ]);
      const store = new AvatarStore(db);
      const { version, path: address } = await store.set(id, bytes);
      const read = await store.get(id);
      expect(read?.bytes.equals(bytes)).toBe(true);
      expect(read?.contentType).toBe('image/png');
      expect(read?.version).toBe(version);
      expect(address).toBe(avatarPath(id, version));
      expect(await columnOf(email, 'image')).toBe(address);
    });

    it('has one picture per person: a new one replaces the old, at a new address', async () => {
      const { id } = await person();
      const store = new AvatarStore(db);
      const first = await store.set(id, png(16, 16));
      const second = await store.set(id, Buffer.from(JPEG_1X1));
      expect(second.version).not.toBe(first.version);
      expect(await count('avatars')).toBe(1);
      expect((await store.get(id))?.contentType).toBe('image/jpeg');
    });

    it('gives the same version to the same bytes, so a repeat upload changes no address', async () => {
      const { id } = await person();
      const store = new AvatarStore(db);
      const a = await store.set(id, png(16, 16));
      const b = await store.set(id, png(16, 16));
      expect(b).toEqual(a);
    });

    it('refuses what is not a picture, and keeps nothing', async () => {
      const { id, email } = await person();
      for (const bytes of [
        Buffer.alloc(0),
        Buffer.from('<svg/>'),
        Buffer.from('text'),
        Buffer.alloc(1024 * 1024 + 1, 1),
      ]) {
        await expect(new AvatarStore(db).set(id, bytes)).rejects.toBeInstanceOf(ImageError);
      }
      expect(await count('avatars')).toBe(0);
      expect(await columnOf(email, 'image')).toBeNull();
    });

    it('refuses an account that does not exist', async () => {
      await expect(new AvatarStore(db).set('nobody', png(8, 8))).rejects.toBeInstanceOf(ImageError);
      expect(await count('avatars')).toBe(0);
    });

    it('removes a picture, and the account’s address for it', async () => {
      const { id, email } = await person();
      const store = new AvatarStore(db);
      await store.set(id, png(8, 8));
      expect(await store.remove(id)).toBe(true);
      expect(await store.get(id)).toBeUndefined();
      expect(await columnOf(email, 'image')).toBeNull();
      expect(await store.remove(id)).toBe(false);
    });

    it('does not give out the picture of a deactivated account', async () => {
      const { id } = await person();
      const store = new AvatarStore(db);
      await store.set(id, png(8, 8));
      await db.run('update users set deactivated_at = ? where id = ?', [
        db.family === 'postgres' ? new Date() : Date.now(),
        id,
      ]);
      expect(await store.get(id)).toBeUndefined();
    });

    it('goes with the account', async () => {
      const { id, email } = await person();
      await new AvatarStore(db).set(id, png(8, 8));
      await db.run('delete from users where email = ?', [email]);
      expect(await count('avatars')).toBe(0);
    });

    it('is not touched by someone else’s picture', async () => {
      const one = await person();
      const two = await person();
      const store = new AvatarStore(db);
      await store.set(one.id, png(8, 8));
      await store.set(two.id, Buffer.from(JPEG_1X1));
      await store.remove(one.id);
      expect((await store.get(two.id))?.contentType).toBe('image/jpeg');
    });
  });
}
