/**
 * What operators do with invitations (core-app §3.3.1, §3.10) against a real database: making, listing and
 * cancelling them, what an invitation link stands for, and that sign-up under invite-only honours exactly
 * those. One suite, run by `invite-manage.test.ts` on a SQLite file and by `invite-manage.db.test.ts` on
 * whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { migrateCore } from '../db/migrate';
import {
  InviteError,
  InviteManager,
  listInvites,
  lookupInvite,
  type InviteManagerHooks,
} from '../invites/manage';
import { changeCapabilities } from '../roles/configure';
import { changeRole } from '../roles/people';
import { INVITE_ONLY, makeAuth, signUp } from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'capability_overrides',
  'invites',
  'rate_limits',
  'sessions',
  'accounts',
  'verifications',
  'users',
];
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);

export function inviteManageSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;

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
    for (const table of TABLES) await db.run(`delete from ${table}`);
  });

  const count = async (where = '', args: unknown[] = []) =>
    Number((await db.run(`select count(*) as n from invites ${where}`, args)).rows[0]?.n);

  /** An owner, an admin and an ordinary person, and a manager that sends nothing unless told to. */
  async function instance(hooks: InviteManagerHooks = {}) {
    const auth = makeAuth(db);
    const owner = await signUp(auth, { name: 'Olive Owner', email: 'olive@example.com' });
    const admin = await signUp(auth, { name: 'Ada Admin', email: 'ada@example.com' });
    const pat = await signUp(auth, { name: 'Pat Person', email: 'pat@example.com' });
    const idOf = async (email: string) =>
      String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
    const asOwner = { id: await idOf(owner.email), role: ROLE_OWNER };
    const asAdmin = { id: await idOf(admin.email), role: ROLE_ADMIN };
    const asUser = { id: await idOf(pat.email), role: ROLE_USER };
    await changeRole(db, asOwner, asAdmin.id, ROLE_ADMIN);
    let clock = NOW;
    const manager = new InviteManager(db, {
      now: () => clock,
      log: () => undefined,
      ...hooks,
    });
    return {
      manager,
      asOwner,
      asAdmin,
      asUser,
      at: (time: number) => {
        clock = time;
      },
    };
  }

  const refused = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      return error instanceof InviteError ? error.code : error;
    }
    return undefined;
  };

  describe('inviting', () => {
    it('saves an invitation for the address, in lower case, from the operator, expiring when asked', async () => {
      const { manager, asAdmin } = await instance();
      const { invite } = await manager.create(asAdmin, {
        email: '  New.Person@Example.COM ',
        days: 3,
      });
      expect(invite).toMatchObject({
        email: 'new.person@example.com',
        invitedBy: 'Ada Admin',
        createdAt: NOW,
        expiresAt: NOW + 3 * DAY,
      });
      const row = (await db.run('select * from invites where id = ?', [invite.id])).rows[0];
      expect(row).toMatchObject({ email: 'new.person@example.com' });
      expect(Number(row?.expires_at)).toBe(NOW + 3 * DAY);
      expect(row?.accepted_at ?? null).toBeNull();
      expect(row?.cancelled_at ?? null).toBeNull();
    });

    it('lets an invitation have no expiry', async () => {
      const { manager, asOwner } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com' });
      expect(invite.expiresAt).toBeUndefined();
      expect(
        (await db.run('select expires_at from invites')).rows[0]?.expires_at ?? null,
      ).toBeNull();
    });

    it('gives each invitation an id that cannot be guessed', async () => {
      const { manager, asOwner } = await instance();
      const a = (await manager.create(asOwner, { email: 'a@example.com' })).invite.id;
      const b = (await manager.create(asOwner, { email: 'b@example.com' })).invite.id;
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it.each([
      ['empty', ''],
      ['spaces', '   '],
      ['no at sign', 'person.example.com'],
      ['two addresses', 'a@example.com, b@example.com'],
      ['a line break', 'a@example.com\nBcc: b@example.com'],
      ['no domain dot', 'a@localhost'],
    ])('refuses an address that is %s', async (_name, email) => {
      const { manager, asOwner } = await instance();
      expect(await refused(() => manager.create(asOwner, { email }))).toBe('invalid-email');
      expect(await count()).toBe(0);
    });

    it.each([0, -1, 366, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses %s days',
      async (days) => {
        const { manager, asOwner } = await instance();
        expect(await refused(() => manager.create(asOwner, { email: 'a@example.com', days }))).toBe(
          'invalid-expiry',
        );
        expect(await count()).toBe(0);
      },
    );

    it('accepts one day and a year', async () => {
      const { manager, asOwner } = await instance();
      expect(
        (await manager.create(asOwner, { email: 'a@example.com', days: 1 })).invite.expiresAt,
      ).toBe(NOW + DAY);
      expect(
        (await manager.create(asOwner, { email: 'b@example.com', days: 365 })).invite.expiresAt,
      ).toBe(NOW + 365 * DAY);
    });

    it('refuses an address that already has an account, whatever its case, and saves nothing', async () => {
      const { manager, asOwner } = await instance();
      expect(await refused(() => manager.create(asOwner, { email: 'PAT@example.com' }))).toBe(
        'exists',
      );
      expect(await count()).toBe(0);
    });

    it('keeps one open invitation for an address: a new one replaces the one before', async () => {
      const { manager, asOwner } = await instance();
      const first = (await manager.create(asOwner, { email: 'a@example.com', days: 1 })).invite;
      const second = (await manager.create(asOwner, { email: 'A@example.com', days: 5 })).invite;
      expect((await listInvites(db)).map((invite) => invite.id)).toEqual([second.id]);
      expect(await lookupInvite(db, first.id, NOW)).toEqual({ state: 'invalid' });
      expect(await lookupInvite(db, second.id, NOW)).toEqual({
        state: 'valid',
        email: 'a@example.com',
      });
      expect(await count('where cancelled_at is not null')).toBe(1);
    });

    it('leaves other addresses alone when it replaces one', async () => {
      const { manager, asOwner } = await instance();
      await manager.create(asOwner, { email: 'a@example.com' });
      await manager.create(asOwner, { email: 'b@example.com' });
      await manager.create(asOwner, { email: 'a@example.com' });
      expect((await listInvites(db)).map((invite) => invite.email).sort()).toEqual([
        'a@example.com',
        'b@example.com',
      ]);
    });
  });

  describe('who may', () => {
    it('lets the owner and an admin, and nobody else, invite and cancel', async () => {
      const { manager, asOwner, asAdmin, asUser } = await instance();
      expect(await refused(() => manager.create(asUser, { email: 'a@example.com' }))).toBe(
        'forbidden',
      );
      const { invite } = await manager.create(asAdmin, { email: 'a@example.com' });
      expect(await refused(() => manager.cancel(asUser, invite.id))).toBe('forbidden');
      expect(await refused(() => manager.cancel(asOwner, invite.id))).toBeUndefined();
    });

    it('treats a role the system does not know as holding nothing', async () => {
      const { manager } = await instance();
      for (const role of [undefined, null, 'platform:root', 'admin', 42]) {
        expect(
          await refused(() => manager.create({ id: 'x', role }, { email: 'a@example.com' })),
        ).toBe('forbidden');
      }
      expect(await count()).toBe(0);
    });

    it('follows the matrix in force: an admin who loses user:manage may do nothing, at once', async () => {
      const { manager, asOwner, asAdmin } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com' });
      await changeCapabilities(db, asOwner, [
        { role: ROLE_ADMIN, capability: 'user:manage', granted: false },
      ]);
      expect(await refused(() => manager.create(asAdmin, { email: 'b@example.com' }))).toBe(
        'forbidden',
      );
      expect(await refused(() => manager.cancel(asAdmin, invite.id))).toBe('forbidden');
      expect(await count('where cancelled_at is not null')).toBe(0);
    });

    it('lets an ordinary person invite once the matrix gives them user:manage', async () => {
      const { manager, asOwner, asUser } = await instance();
      await changeCapabilities(db, asOwner, [
        { role: ROLE_USER, capability: 'user:manage', granted: true },
      ]);
      expect(
        await refused(() => manager.create(asUser, { email: 'a@example.com' })),
      ).toBeUndefined();
    });
  });

  describe('sending', () => {
    it('hands the id, address and expiry to the sender, and reports it sent', async () => {
      const sent: unknown[] = [];
      const { manager, asOwner } = await instance({
        send: (invite) => {
          sent.push(invite);
          return Promise.resolve(true);
        },
      });
      const { invite, sent: ok } = await manager.create(asOwner, {
        email: 'a@example.com',
        days: 2,
      });
      expect(ok).toBe(true);
      expect(sent).toEqual([
        { id: invite.id, email: 'a@example.com', expiresAt: new Date(NOW + 2 * DAY) },
      ]);
    });

    it('sends nothing for an invitation that is refused', async () => {
      const sent: unknown[] = [];
      const { manager, asOwner, asUser } = await instance({
        send: (invite) => {
          sent.push(invite);
          return Promise.resolve(true);
        },
      });
      await refused(() => manager.create(asUser, { email: 'a@example.com' }));
      await refused(() => manager.create(asOwner, { email: 'not an address' }));
      await refused(() => manager.create(asOwner, { email: 'pat@example.com' }));
      expect(sent).toEqual([]);
    });

    it('keeps the invitation and says it was not sent when the email fails', async () => {
      const logged: string[] = [];
      const { manager, asOwner } = await instance({
        send: () => Promise.reject(new Error('SMTP is down')),
        log: (message) => logged.push(message),
      });
      const result = await manager.create(asOwner, { email: 'a@example.com' });
      expect(result.sent).toBe(false);
      expect(await count()).toBe(1);
      expect(logged.join()).toContain('SMTP is down');
    });

    it('says it was not sent when email is not set up and the sender says so', async () => {
      const { manager, asOwner } = await instance({ send: () => Promise.resolve(false) });
      expect((await manager.create(asOwner, { email: 'a@example.com' })).sent).toBe(false);
    });

    it('says it was not sent when nothing can send', async () => {
      const { manager, asOwner } = await instance();
      expect((await manager.create(asOwner, { email: 'a@example.com' })).sent).toBe(false);
    });
  });

  describe('listing', () => {
    it('lists open invitations, newest first, with who made them', async () => {
      const { manager, asOwner, asAdmin, at } = await instance();
      await manager.create(asOwner, { email: 'a@example.com' });
      at(NOW + 1000);
      await manager.create(asAdmin, { email: 'b@example.com' });
      expect((await listInvites(db)).map((invite) => [invite.email, invite.invitedBy])).toEqual([
        ['b@example.com', 'Ada Admin'],
        ['a@example.com', 'Olive Owner'],
      ]);
    });

    it('includes an invitation past its expiry, so it can be seen and cleared', async () => {
      const { manager, asOwner, at } = await instance();
      await manager.create(asOwner, { email: 'a@example.com', days: 1 });
      at(NOW + 5 * DAY);
      expect((await listInvites(db)).map((invite) => invite.email)).toEqual(['a@example.com']);
    });

    it('leaves out cancelled and used invitations', async () => {
      const { manager, asOwner } = await instance();
      const cancelled = (await manager.create(asOwner, { email: 'a@example.com' })).invite;
      await manager.cancel(asOwner, cancelled.id);
      const used = (await manager.create(asOwner, { email: 'b@example.com' })).invite;
      await db.run('update invites set accepted_at = ? where id = ?', [NOW, used.id]);
      await manager.create(asOwner, { email: 'c@example.com' });
      expect((await listInvites(db)).map((invite) => invite.email)).toEqual(['c@example.com']);
    });

    it('names nobody once the person who invited has gone', async () => {
      const { manager, asAdmin, asOwner } = await instance();
      await manager.create(asAdmin, { email: 'a@example.com' });
      await db.run('update invites set invited_by = null');
      expect((await listInvites(db))[0]?.invitedBy).toBeUndefined();
      expect(asOwner.id).not.toBe(asAdmin.id);
    });
  });

  describe('cancelling', () => {
    it('cancels an open invitation, once', async () => {
      const { manager, asOwner } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com' });
      expect(await manager.cancel(asOwner, invite.id)).toEqual({ changed: true });
      expect(await manager.cancel(asOwner, invite.id)).toEqual({ changed: false });
      expect(await listInvites(db)).toEqual([]);
    });

    it('stops the link working at once', async () => {
      const { manager, asOwner } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com' });
      await manager.cancel(asOwner, invite.id);
      expect(await lookupInvite(db, invite.id, NOW)).toEqual({ state: 'invalid' });
    });

    it('refuses an invitation that does not exist', async () => {
      const { manager, asOwner } = await instance();
      expect(await refused(() => manager.cancel(asOwner, 'no-such-invite'))).toBe('not-found');
    });

    it('refuses an invitation that was used, and leaves it used', async () => {
      const { manager, asOwner } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com' });
      await db.run('update invites set accepted_at = ? where id = ?', [NOW, invite.id]);
      expect(await refused(() => manager.cancel(asOwner, invite.id))).toBe('used');
      expect(await count('where cancelled_at is not null')).toBe(0);
    });

    it('cancels an expired invitation too, to clear it', async () => {
      const { manager, asOwner, at } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com', days: 1 });
      at(NOW + 3 * DAY);
      expect(await manager.cancel(asOwner, invite.id)).toEqual({ changed: true });
    });
  });

  describe('what a link stands for', () => {
    it('is valid for an open invitation, with the address it was sent to', async () => {
      const { manager, asOwner } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com', days: 1 });
      expect(await lookupInvite(db, invite.id, NOW)).toEqual({
        state: 'valid',
        email: 'a@example.com',
      });
    });

    it('is valid right up to the moment of expiry, and not at it', async () => {
      const { manager, asOwner } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com', days: 1 });
      expect((await lookupInvite(db, invite.id, NOW + DAY - 1)).state).toBe('valid');
      expect((await lookupInvite(db, invite.id, NOW + DAY)).state).toBe('invalid');
    });

    it('does not expire when it was made with no expiry', async () => {
      const { manager, asOwner } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com' });
      expect((await lookupInvite(db, invite.id, NOW + 10_000 * DAY)).state).toBe('valid');
    });

    it('is the same answer for an unknown, a used, an overlong and an empty id', async () => {
      const { manager, asOwner } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'a@example.com' });
      await db.run('update invites set accepted_at = ? where id = ?', [NOW, invite.id]);
      for (const id of [invite.id, 'unknown', 'x'.repeat(101), '', "' or 1=1 --"]) {
        expect(await lookupInvite(db, id, NOW)).toEqual({ state: 'invalid' });
      }
    });
  });

  describe('signing up under invite-only', () => {
    const inviteOnly = () => makeAuth(db, {}, INVITE_ONLY);

    it('lets an invited person sign up, and uses the invitation up', async () => {
      const { manager, asOwner } = await instance();
      const { invite } = await manager.create(asOwner, { email: 'Newcomer@Example.com', days: 2 });
      const made = await signUp(inviteOnly(), { email: 'newcomer@example.com' });
      expect(made.reply.status).toBe(200);
      expect(await listInvites(db)).toEqual([]);
      expect(await lookupInvite(db, invite.id, NOW)).toEqual({ state: 'invalid' });
      const role = (
        await db.run('select role from users where email = ?', ['newcomer@example.com'])
      ).rows[0]?.role;
      expect(role).toBe(ROLE_USER);
    });

    it('lets a person sign up with their address in a different case than the invitation', async () => {
      const { manager, asOwner } = await instance();
      await manager.create(asOwner, { email: 'newcomer@example.com' });
      const made = await signUp(inviteOnly(), { email: 'NEWCOMER@example.com' });
      expect(made.reply.status).toBe(200);
    });

    it('refuses an address nobody invited', async () => {
      const { manager, asOwner } = await instance();
      await manager.create(asOwner, { email: 'someone@example.com' });
      const made = await signUp(inviteOnly(), { email: 'other@example.com' });
      expect(made.reply.status).toBe(422);
      expect(made.reply.body).toMatchObject({ code: 'INVITE_REQUIRED' });
    });

    it('refuses an invitation that has expired', async () => {
      const { manager, asOwner, at } = await instance();
      at(Date.now() - 10 * DAY);
      await manager.create(asOwner, { email: 'late@example.com', days: 1 });
      const made = await signUp(inviteOnly(), { email: 'late@example.com' });
      expect(made.reply.status).toBe(422);
      expect(made.reply.body).toMatchObject({ code: 'INVITE_REQUIRED' });
    });

    it('accepts an invitation that is still inside its expiry', async () => {
      const { manager, asOwner, at } = await instance();
      at(Date.now());
      await manager.create(asOwner, { email: 'timely@example.com', days: 1 });
      expect((await signUp(inviteOnly(), { email: 'timely@example.com' })).reply.status).toBe(200);
    });

    it('refuses an invitation that was cancelled', async () => {
      const { manager, asOwner, at } = await instance();
      at(Date.now());
      const { invite } = await manager.create(asOwner, { email: 'gone@example.com' });
      await manager.cancel(asOwner, invite.id);
      const made = await signUp(inviteOnly(), { email: 'gone@example.com' });
      expect(made.reply.status).toBe(422);
    });

    it('refuses a second sign-up on an invitation that was used', async () => {
      const { manager, asOwner, at } = await instance();
      at(Date.now());
      await manager.create(asOwner, { email: 'once@example.com' });
      expect((await signUp(inviteOnly(), { email: 'once@example.com' })).reply.status).toBe(200);
      await db.run('delete from sessions');
      await db.run('delete from accounts where user_id in (select id from users where email = ?)', [
        'once@example.com',
      ]);
      await db.run('delete from users where email = ?', ['once@example.com']);
      const again = await signUp(inviteOnly(), { email: 'once@example.com' });
      expect(again.reply.status).toBe(422);
    });
  });
}
