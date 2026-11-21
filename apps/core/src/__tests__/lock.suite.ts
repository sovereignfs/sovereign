/**
 * The lock's store (core-app §3.5.3, RFC 0006 B1, B2): a person's lock on a device, and when each of their sessions there locks. One
 * suite, run by `lock.test.ts` on a SQLite file and by `lock.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateCore } from '../db/migrate';
import {
  deviceLock,
  LEAVE_GRACE_MS,
  lockSession,
  markLeft,
  lockStatus,
  noteActivity,
  removeDeviceLock,
  setDeviceLock,
  unlockSession,
} from '../lock/store';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const MINUTE = 60_000;

export function lockSuite(createDatabase: () => Promise<TestDatabase>): void {
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

  const at = (ms: number) => (db.family === 'postgres' ? new Date(ms) : ms);

  beforeEach(async () => {
    for (const table of ['lock_challenges', 'session_locks', 'device_locks', 'sessions', 'users']) {
      await db.run(`delete from ${table}`);
    }
    const now = Date.now();
    for (const id of ['ada', 'grace']) {
      await db.run(
        'insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          id,
          `${id}@sovereign.local`,
          db.family === 'postgres' ? true : 1,
          'platform:user',
          at(now),
          at(now),
        ],
      );
    }
    for (const [id, user] of [
      ['s-ada', 'ada'],
      ['s-ada-2', 'ada'],
      ['s-grace', 'grace'],
    ]) {
      await db.run(
        'insert into sessions (id, expires_at, token, created_at, updated_at, user_id) values (?, ?, ?, ?, ?, ?)',
        [id, at(now + 1e7), `${id}-token`, at(now), at(now), user],
      );
    }
  });

  const T = 1_800_000_000_000;
  const ada = { sessionId: 's-ada', userId: 'ada', deviceId: 'phone' };

  describe('the setting on a device', () => {
    it('is kept per account and device, and changed in place', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 15, onLeave: false }, T);
      expect(await deviceLock(db, 'ada', 'phone')).toEqual({ idleSeconds: 900, onLeave: false });
      expect(await deviceLock(db, 'ada', 'laptop')).toBeUndefined();
      expect(await deviceLock(db, 'grace', 'phone')).toBeUndefined();

      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 1, onLeave: true }, T);
      expect(await deviceLock(db, 'ada', 'phone')).toEqual({ idleSeconds: 60, onLeave: true });
      const { rows } = await db.run('select count(*) as n from device_locks');
      expect(Number(rows[0]?.n)).toBe(1);
    });

    it('takes only one of the offered idle times', async () => {
      for (const idleMinutes of [0, 2, 30, 1440, -1, 15.5]) {
        await expect(
          setDeviceLock(db, 'ada', 'phone', { idleMinutes, onLeave: false }, T),
        ).rejects.toThrow(/not one of the choices/);
      }
      expect(await deviceLock(db, 'ada', 'phone')).toBeUndefined();
    });

    it('is removed for that account and device only', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 15, onLeave: false }, T);
      await setDeviceLock(db, 'grace', 'phone', { idleMinutes: 15, onLeave: false }, T);
      await removeDeviceLock(db, 'ada', 'phone');
      expect(await deviceLock(db, 'ada', 'phone')).toBeUndefined();
      expect(await deviceLock(db, 'grace', 'phone')).toBeDefined();
    });

    it('goes with the account', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 15, onLeave: false }, T);
      await db.run("delete from users where id = 'ada'");
      const { rows } = await db.run('select count(*) as n from device_locks');
      expect(Number(rows[0]?.n)).toBe(0);
    });
  });

  describe('a session', () => {
    it('never locks on a device with no lock, or with no device named', async () => {
      expect(await lockStatus(db, ada, T)).toEqual({ lock: undefined, locked: false });
      expect(await lockStatus(db, { ...ada, deviceId: undefined }, T)).toEqual({
        lock: undefined,
        locked: false,
      });
      await lockSession(db, 's-ada', T);
      expect((await lockStatus(db, ada, T)).locked).toBe(false);
      const { rows } = await db.run('select count(*) as n from session_locks');
      expect(Number(rows[0]?.n)).toBe(0);
    });

    it('follows the session once seen on a device with a lock, not the browser’s cookie', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 15, onLeave: false }, T);
      await lockStatus(db, ada, T);
      await lockSession(db, 's-ada', T + MINUTE);
      // The cookie dropped, or the session's token taken to another browser: still locked.
      expect((await lockStatus(db, { ...ada, deviceId: undefined }, T + MINUTE)).locked).toBe(true);
      expect((await lockStatus(db, { ...ada, deviceId: 'laptop' }, T + MINUTE)).locked).toBe(true);
    });

    it('locks once it has been idle longer than the chosen time, decided by the next check', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 15, onLeave: false }, T);
      expect(await lockStatus(db, ada, T)).toEqual({
        lock: { idleSeconds: 900, onLeave: false },
        locked: false,
        deviceId: 'phone',
      });
      expect((await lockStatus(db, ada, T + 15 * MINUTE)).locked).toBe(false);
      expect((await lockStatus(db, ada, T + 15 * MINUTE + 1)).locked).toBe(true);
      // Locked stays locked, even if the clock seems to go back.
      expect((await lockStatus(db, ada, T)).locked).toBe(true);
    });

    it('starts its idle time again with activity, written at most each ten seconds', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 1, onLeave: false }, T);
      await lockStatus(db, ada, T);
      await noteActivity(db, 's-ada', T + 5_000);
      expect((await lockStatus(db, ada, T + MINUTE + 1)).locked).toBe(true);

      await unlockSession(db, 's-ada', T + 2 * MINUTE);
      await noteActivity(db, 's-ada', T + 2 * MINUTE + 15_000);
      expect((await lockStatus(db, ada, T + 3 * MINUTE + 10_000)).locked).toBe(false);
    });

    it('locks once left for longer than the grace, when the lock asks for it', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 60, onLeave: true }, T);
      await lockStatus(db, ada, T);
      await markLeft(db, 's-ada', T + MINUTE);
      expect((await lockStatus(db, ada, T + MINUTE + LEAVE_GRACE_MS)).locked).toBe(false);
      // That check was the session back within the grace: a page that hid was only going to another page.
      await markLeft(db, 's-ada', T + 2 * MINUTE);
      expect((await lockStatus(db, ada, T + 2 * MINUTE + LEAVE_GRACE_MS + 1)).locked).toBe(true);
    });

    it('keeps the first time it was left, and is not locked by leaving when the lock does not ask', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 60, onLeave: true }, T);
      await lockStatus(db, ada, T);
      await markLeft(db, 's-ada', T);
      await markLeft(db, 's-ada', T + 10_000);
      expect((await lockStatus(db, ada, T + LEAVE_GRACE_MS + 1)).locked).toBe(true);

      await unlockSession(db, 's-ada', T + MINUTE);
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 60, onLeave: false }, T + MINUTE);
      await markLeft(db, 's-ada', T + MINUTE);
      expect((await lockStatus(db, ada, T + 2 * MINUTE)).locked).toBe(false);
    });

    it('gives the device whose lock the session is under, whatever cookie came', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 15, onLeave: false }, T);
      expect((await lockStatus(db, ada, T)).deviceId).toBe('phone');
      expect((await lockStatus(db, { ...ada, deviceId: undefined }, T)).deviceId).toBe('phone');
      expect((await lockStatus(db, { ...ada, deviceId: 'laptop' }, T)).deviceId).toBe('phone');
    });

    it('is not woken by activity once locked', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 15, onLeave: false }, T);
      await lockStatus(db, ada, T);
      await lockSession(db, 's-ada', T + MINUTE);
      await noteActivity(db, 's-ada', T + 10 * MINUTE);
      expect((await lockStatus(db, ada, T + 10 * MINUTE)).locked).toBe(true);
    });

    it('locks at once when asked, keeping the first time it locked', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 60, onLeave: true }, T);
      await lockStatus(db, ada, T);
      await lockSession(db, 's-ada', T + MINUTE);
      await lockSession(db, 's-ada', T + 2 * MINUTE);
      expect((await lockStatus(db, ada, T + 2 * MINUTE)).locked).toBe(true);
      const { rows } = await db.run(
        "select locked_at from session_locks where session_id = 's-ada'",
      );
      expect(Number(rows[0]?.locked_at)).toBe(T + MINUTE);
    });

    it('is free once the lock is turned off, and starts afresh when it is turned on again', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 1, onLeave: false }, T);
      await lockStatus(db, ada, T);
      await lockSession(db, 's-ada', T);
      await removeDeviceLock(db, 'ada', 'phone');
      expect((await lockStatus(db, ada, T + 60 * MINUTE)).locked).toBe(false);
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 1, onLeave: false }, T + 60 * MINUTE);
      expect((await lockStatus(db, ada, T + 60 * MINUTE)).locked).toBe(false);
      expect((await lockStatus(db, ada, T + 60 * MINUTE + 30_000)).locked).toBe(false);
      expect((await lockStatus(db, ada, T + 61 * MINUTE + 1)).locked).toBe(true);
    });

    it('is unlocked with its idle time started again, and the others stay as they are', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 15, onLeave: false }, T);
      const ada2 = { ...ada, sessionId: 's-ada-2' };
      await lockStatus(db, ada, T);
      await lockStatus(db, ada2, T);
      await lockSession(db, 's-ada', T);
      await lockSession(db, 's-ada-2', T);
      await unlockSession(db, 's-ada', T + 30 * MINUTE);
      expect((await lockStatus(db, ada, T + 30 * MINUTE)).locked).toBe(false);
      expect((await lockStatus(db, ada2, T + 30 * MINUTE)).locked).toBe(true);
    });

    it('goes with the session', async () => {
      await setDeviceLock(db, 'ada', 'phone', { idleMinutes: 15, onLeave: false }, T);
      await lockStatus(db, ada, T);
      await db.run("delete from sessions where id = 's-ada'");
      const { rows } = await db.run('select count(*) as n from session_locks');
      expect(Number(rows[0]?.n)).toBe(0);
    });
  });
}
