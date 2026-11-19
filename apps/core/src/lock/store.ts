import type { Executor } from '@sovereignfs/database';

/**
 * A person's lock on a device, and the lock state of their sessions there (RFC 0006 B1, B2). The only writer of `device_locks` and
 * `session_locks`.
 */

/** The idle times a person may choose, in minutes, and the one they get unless they choose. */
export const IDLE_MINUTES = [1, 5, 15, 60] as const;
export const DEFAULT_IDLE_MINUTES = 15;

export type DeviceLock = { idleSeconds: number; onLeave: boolean };

/**
 * Activity is written at most this often, so a busy page costs one write each ten seconds. The watcher tells core at most every 15
 * seconds (`app/lock-watcher.tsx`), which is always written, so what core knows of the person's use is never more than about 15 seconds
 * behind, well inside the shortest idle time.
 */
const ACTIVITY_EVERY_MS = 10_000;

/**
 * How long a page may be gone before leaving counts (B2). A page is hidden by a navigation to another of core's pages as much as by
 * leaving the app, and the page that follows says it is there as soon as it runs; a session left for longer than this is locked.
 */
export const LEAVE_GRACE_MS = 15_000;

type Run = Pick<Executor, 'run'>;
const truthy = (value: unknown) => value === true || value === 1;

export async function deviceLock(
  db: Run,
  userId: string,
  deviceId: string,
): Promise<DeviceLock | undefined> {
  const { rows } = await db.run(
    'select idle_seconds, on_leave from device_locks where user_id = ? and device_id = ?',
    [userId, deviceId],
  );
  const row = rows[0];
  return row ? { idleSeconds: Number(row.idle_seconds), onLeave: truthy(row.on_leave) } : undefined;
}

/** Turns the lock on for this account on this device, or changes it. The idle time is one of `IDLE_MINUTES`. */
export async function setDeviceLock(
  db: Run & { family: string },
  userId: string,
  deviceId: string,
  lock: { idleMinutes: number; onLeave: boolean },
  now: number = Date.now(),
): Promise<void> {
  if (!(IDLE_MINUTES as readonly number[]).includes(lock.idleMinutes)) {
    throw new Error(`An idle time of ${lock.idleMinutes} minutes is not one of the choices.`);
  }
  const onLeave = db.family === 'postgres' ? lock.onLeave : lock.onLeave ? 1 : 0;
  await db.run(
    `insert into device_locks (user_id, device_id, idle_seconds, on_leave, created_at, updated_at) values (?, ?, ?, ?, ?, ?)
     on conflict (user_id, device_id) do update set idle_seconds = ?, on_leave = ?, updated_at = ?`,
    [
      userId,
      deviceId,
      lock.idleMinutes * 60,
      onLeave,
      now,
      now,
      lock.idleMinutes * 60,
      onLeave,
      now,
    ],
  );
}

/**
 * Turns the lock off for this account on this device. The sessions it held go with it, so turning it on again starts every idle time
 * afresh rather than finding an old one long past.
 */
export async function removeDeviceLock(db: Run, userId: string, deviceId: string): Promise<void> {
  await db.run(
    'delete from session_locks where device_id = ? and session_id in (select id from sessions where user_id = ?)',
    [deviceId, userId],
  );
  await db.run('delete from device_locks where user_id = ? and device_id = ?', [userId, deviceId]);
}

/**
 * Whether the session is locked, deciding it now (B2). A session is put under a device's lock the first time it is seen with that
 * device's cookie, and from then on the lock follows the session: a browser that drops the cookie, or a session token used from another
 * browser, is still locked. A session locks once it has been idle longer than the lock's time, by this check. A session never seen on a
 * device with a lock is never locked, and costs one read.
 */
export async function lockStatus(
  db: Run,
  who: { sessionId: string; userId: string; deviceId: string | undefined },
  now: number = Date.now(),
): Promise<{ lock: DeviceLock | undefined; locked: boolean; deviceId?: string }> {
  const { rows } = await db.run(
    'select device_id, last_active_at, locked_at, left_at from session_locks where session_id = ?',
    [who.sessionId],
  );
  const row = rows[0];
  if (!row) {
    if (!who.deviceId) return { lock: undefined, locked: false };
    const lock = await deviceLock(db, who.userId, who.deviceId);
    if (!lock) return { lock: undefined, locked: false };
    await db.run(
      'insert into session_locks (session_id, device_id, last_active_at) values (?, ?, ?) on conflict (session_id) do nothing',
      [who.sessionId, who.deviceId, now],
    );
    return { lock, locked: false, deviceId: who.deviceId };
  }
  const deviceId = String(row.device_id);
  const lock = await deviceLock(db, who.userId, deviceId);
  if (!lock) return { lock: undefined, locked: false };
  const set = (value: unknown) => value !== null && value !== undefined;
  if (set(row.locked_at)) return { lock, locked: true, deviceId };
  const idle = now - Number(row.last_active_at) > lock.idleSeconds * 1000;
  const left = lock.onLeave && set(row.left_at) && now - Number(row.left_at) > LEAVE_GRACE_MS;
  if (idle || left) {
    await lockSession(db, who.sessionId, now);
    return { lock, locked: true, deviceId };
  }
  // Back within the grace, or the lock no longer asks: the page that hid was only going to another page.
  if (set(row.left_at)) {
    await db.run(
      'update session_locks set left_at = null where session_id = ? and locked_at is null',
      [who.sessionId],
    );
  }
  return { lock, locked: false, deviceId };
}

/** The person did something in this session: its idle time starts again. Written at most each ten seconds, never for a locked session. */
export async function noteActivity(
  db: Run,
  sessionId: string,
  now: number = Date.now(),
): Promise<void> {
  await db.run(
    'update session_locks set last_active_at = ? where session_id = ? and locked_at is null and last_active_at < ?',
    [now, sessionId, now - ACTIVITY_EVERY_MS],
  );
}

/**
 * The session's page was hidden (B2): leaving the app, or going to another page. It locks if the session is not back within
 * `LEAVE_GRACE_MS`, decided by `lockStatus`; the first time it was left is kept.
 */
export async function markLeft(
  db: Run,
  sessionId: string,
  now: number = Date.now(),
): Promise<void> {
  await db.run(
    'update session_locks set left_at = coalesce(left_at, ?) where session_id = ? and locked_at is null',
    [now, sessionId],
  );
}

/** Locks the session now, once its idle time has passed or it was left. Only a session under a lock has a row to lock. */
export async function lockSession(
  db: Run,
  sessionId: string,
  now: number = Date.now(),
): Promise<void> {
  await db.run('update session_locks set locked_at = coalesce(locked_at, ?) where session_id = ?', [
    now,
    sessionId,
  ]);
}

/** Unlocks the session: the person proved who they are on the lock page (B4). Its idle time starts again. */
export async function unlockSession(
  db: Run,
  sessionId: string,
  now: number = Date.now(),
): Promise<void> {
  await db.run(
    'update session_locks set locked_at = null, left_at = null, last_active_at = ? where session_id = ?',
    [now, sessionId],
  );
}
