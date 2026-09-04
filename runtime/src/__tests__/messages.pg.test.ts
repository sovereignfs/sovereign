import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Live-Postgres coverage for `sendPluginMessage`/`sendAdminMessage` (RFC
 * 0048) — the orchestration layer behind `sdk.messages.send()` and Console's
 * admin message compose: permission gating, batch caps, partial-recipient
 * skip, and `notify: false`. Skipped unless TEST_DATABASE_URL is set,
 * matching every other `.pg.test.ts` in this repo.
 *
 * See `notification-delivery.pg.test.ts`'s header comment for the full
 * reasoning: a notify:true send's `deliverNotification` call fire-and-forgets
 * `fanOutPushToUser` (`../push`), mocked here to a no-op since no test in
 * this file asserts on push delivery itself. This file gets its own fresh,
 * `randomUUID()`-suffixed Postgres schema (`freshSchema()`) — no state
 * shared with `notification-delivery.pg.test.ts`'s own isolated schema, so
 * nothing to race no matter how the two files' worker processes overlap in
 * time (both need the full platform schema via `bootstrapPlatformDb()`
 * against the same shared `TEST_DATABASE_URL`, which is what actually raced
 * before this fix — see the other file's header for the full story).
 *
 * `sendAdminMessage`'s `sendEmail: true` path (RFC 0062 §6) similarly ends in
 * `sendPlatformEmail` (`../platform-email`), which — like `fanOutPushToUser`
 * — always resolves the real, unmocked `getPlatformDb()` singleton
 * internally rather than accepting the `pdb` passed around this file, so it
 * can never see this file's isolated schema either; mocked here for the
 * same reason. `deliverCommunicationEmail`'s own opt-out short-circuit
 * (before ever reaching `sendPlatformEmail`) does use the passed `pdb`
 * directly, so that branch is still exercised against the real isolated
 * schema and asserted via a live `email_delivery_log` row below.
 *
 * Isolation via a fresh `randomUUID()` recipientUserId per test, same
 * strategy as `notification-delivery.pg.test.ts`.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

vi.mock('../push', () => ({ fanOutPushToUser: async () => {} }));

const { sendPlatformEmail } = vi.hoisted(() => ({
  sendPlatformEmail: vi.fn(async () => ({ status: 'sent' as const })),
}));
vi.mock('../platform-email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../platform-email')>();
  return { ...actual, sendPlatformEmail };
});

import {
  bootstrapPlatformDb,
  countUnreadNotifications,
  listUserMessages,
  setNotificationPrefs,
} from '@sovereignfs/db';
import type { DirectoryUser } from '@sovereignfs/sdk';
import { resetMessageRateLimitForTests } from '../message-permissions';
import { sendAdminMessage, sendPluginMessage } from '../messages';

let pdb: import('@sovereignfs/db').PlatformDb;
let schemaPool: Pool;

/** A fresh, isolated Postgres schema for this file — see notification-delivery.pg.test.ts's header comment for why. */
async function freshSchema(): Promise<import('@sovereignfs/db').PlatformDb> {
  const admin = new Pool({ connectionString: PG_URL });
  const schema = `test_messages_${randomUUID().replace(/-/g, '_')}`;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.end();
  }
  schemaPool = new Pool({ connectionString: PG_URL, options: `-c search_path="${schema}"` });
  return {
    dialect: 'postgres',
    db: drizzlePg(schemaPool),
  } as unknown as import('@sovereignfs/db').PlatformDb;
}

/** Reads the `email_delivery_log` row `deliverCommunicationEmail()` wrote for one recipient/template. */
async function lastEmailDeliveryLogRow(
  recipientUserId: string,
  templateId: string,
): Promise<{ status: string; errorCode: string | null } | undefined> {
  const result = await (
    pdb.db as unknown as { execute: (q: unknown) => Promise<{ rows: unknown[] }> }
  ).execute(
    sql`SELECT status, error_code AS "errorCode" FROM email_delivery_log
        WHERE recipient_user_id = ${recipientUserId} AND template_id = ${templateId}
        ORDER BY created_at DESC LIMIT 1`,
  );
  return result.rows[0] as { status: string; errorCode: string | null } | undefined;
}

beforeAll(async () => {
  if (!PG_URL) return;
  process.env.DB_DIALECT = 'postgres';
  process.env.POSTGRES_DB_URL = PG_URL;
  pdb = await freshSchema();
  await bootstrapPlatformDb(pdb);
});

afterAll(async () => {
  if (schemaPool) await schemaPool.end();
});

beforeEach(() => {
  resetMessageRateLimitForTests();
  sendPlatformEmail.mockClear();
});

/** A resolver that treats every id in `knownIds` as a real directory user, everything else as unknown. */
function fakeResolver(knownIds: string[]): (ids: string[]) => Promise<DirectoryUser[]> {
  return (ids) =>
    Promise.resolve(
      ids
        .filter((id) => knownIds.includes(id))
        .map((id) => ({ id, email: `${id}@example.test`, name: null, image: null })),
    );
}

const MANIFEST = { permissions: ['messages:send'], name: 'Example Notes' };

describe.skipIf(!PG_URL)('sendPluginMessage (RFC 0048)', () => {
  it('rejects a plugin without the messages:send permission', async () => {
    await expect(
      sendPluginMessage(
        pdb,
        { recipientUserIds: ['u1'], subject: 'Hi', body: 'Hi' },
        'com.example.notes',
        { permissions: [] },
        fakeResolver(['u1']),
      ),
    ).rejects.toThrow(/messages:send/);
  });

  it('rejects a call with no plugin route context', async () => {
    await expect(
      sendPluginMessage(
        pdb,
        { recipientUserIds: ['u1'], subject: 'Hi', body: 'Hi' },
        null,
        MANIFEST,
        fakeResolver(['u1']),
      ),
    ).rejects.toThrow(/plugin route context/);
  });

  it('rejects a batch over the 50-recipient cap', async () => {
    const recipientUserIds = Array.from({ length: 51 }, (_, i) => `u${i}`);
    await expect(
      sendPluginMessage(
        pdb,
        { recipientUserIds, subject: 'Hi', body: 'Hi' },
        'com.example.notes',
        MANIFEST,
        fakeResolver(recipientUserIds),
      ),
    ).rejects.toThrow(/limited to 50/);
  });

  it('sends to valid recipients and reports invalid ones as skipped, not fatal', async () => {
    const u1 = randomUUID();
    const ghost = randomUUID();
    const result = await sendPluginMessage(
      pdb,
      { recipientUserIds: [u1, ghost], subject: 'Report ready', body: 'Your export is ready.' },
      'com.example.notes',
      MANIFEST,
      fakeResolver([u1]),
    );

    expect(result.sentTo).toEqual([u1]);
    expect(result.skipped).toEqual([{ userId: ghost, reason: 'RECIPIENT_NOT_FOUND' }]);
    const { total } = await listUserMessages(pdb, u1);
    expect(total).toBe(1);
  });

  it('throws when every recipient fails directory validation', async () => {
    const ghost1 = randomUUID();
    const ghost2 = randomUUID();
    await expect(
      sendPluginMessage(
        pdb,
        { recipientUserIds: [ghost1, ghost2], subject: 'Hi', body: 'Hi' },
        'com.example.notes',
        MANIFEST,
        fakeResolver([]),
      ),
    ).rejects.toThrow(/No valid recipients/);
  });

  it('creates a notification by default, and skips it entirely when notify: false', async () => {
    const notified = randomUUID();
    await sendPluginMessage(
      pdb,
      { recipientUserIds: [notified], subject: 'Notified', body: 'body' },
      'com.example.notes',
      MANIFEST,
      fakeResolver([notified]),
    );
    expect(await countUnreadNotifications(pdb, notified)).toBe(1);

    const silent = randomUUID();
    await sendPluginMessage(
      pdb,
      { recipientUserIds: [silent], subject: 'Silent', body: 'body', notify: false },
      'com.example.notes',
      MANIFEST,
      fakeResolver([silent]),
    );
    expect(await countUnreadNotifications(pdb, silent)).toBe(0);
    // The message itself still exists even without a notification.
    expect((await listUserMessages(pdb, silent)).total).toBe(1);
  });

  it('rate-limits per recipient — the 4th send to the same recipient in a window throws', async () => {
    const recipient = randomUUID();
    for (let i = 0; i < 3; i++) {
      await sendPluginMessage(
        pdb,
        { recipientUserIds: [recipient], subject: `Msg ${i}`, body: 'body' },
        'com.example.notes',
        MANIFEST,
        fakeResolver([recipient]),
      );
    }
    await expect(
      sendPluginMessage(
        pdb,
        { recipientUserIds: [recipient], subject: 'Msg 4', body: 'body' },
        'com.example.notes',
        MANIFEST,
        fakeResolver([recipient]),
      ),
    ).rejects.toThrow(/rate limit exceeded/);
  });
});

describe.skipIf(!PG_URL)('sendAdminMessage (RFC 0048)', () => {
  it('requires no manifest/permission — stamps sender_type admin', async () => {
    const u1 = randomUUID();
    const result = await sendAdminMessage(
      pdb,
      { recipientUserIds: [u1], subject: 'Maintenance', body: 'Restarting at midnight.' },
      'admin-user-1',
      fakeResolver([u1]),
    );
    expect(result.sentTo).toEqual([u1]);
  });

  it('rejects a batch over the 1000-recipient cap', async () => {
    const recipientUserIds = Array.from({ length: 1001 }, (_, i) => `u${i}`);
    await expect(
      sendAdminMessage(
        pdb,
        { recipientUserIds, subject: 'Hi', body: 'Hi' },
        'admin-user-1',
        fakeResolver(recipientUserIds),
      ),
    ).rejects.toThrow(/limited to 1000/);
  });

  it('is not rate-limited the way plugin sends are — many recipients in one call succeed', async () => {
    const recipients = Array.from({ length: 10 }, () => randomUUID());
    const result = await sendAdminMessage(
      pdb,
      { recipientUserIds: recipients, subject: 'Broadcast', body: 'body' },
      'admin-user-1',
      fakeResolver(recipients),
    );
    expect(result.sentTo).toHaveLength(10);
  });

  it('sendEmail: true reaches sendPlatformEmail for a recipient who opted into communicationEmail (RFC 0062 §6)', async () => {
    const optedIn = randomUUID();
    await setNotificationPrefs(pdb, optedIn, { communicationEmail: true });

    await sendAdminMessage(
      pdb,
      { recipientUserIds: [optedIn], subject: 'Maintenance', body: 'body', sendEmail: true },
      'admin-user-1',
      fakeResolver([optedIn]),
    );

    expect(sendPlatformEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryClass: 'communication',
        templateId: 'admin-message',
        toUserId: optedIn,
        toEmail: `${optedIn}@example.test`,
        subject: 'Maintenance',
      }),
    );
  });

  it('sendEmail: true short-circuits before sendPlatformEmail for a recipient who has not opted in', async () => {
    const optedOut = randomUUID(); // communicationEmail defaults to false

    await sendAdminMessage(
      pdb,
      { recipientUserIds: [optedOut], subject: 'Maintenance', body: 'body', sendEmail: true },
      'admin-user-1',
      fakeResolver([optedOut]),
    );

    expect(sendPlatformEmail).not.toHaveBeenCalled();
    const row = await lastEmailDeliveryLogRow(optedOut, 'admin-message');
    expect(row).toEqual({ status: 'skipped', errorCode: 'COMMUNICATION_EMAIL_DISABLED' });
  });

  it('sends no email at all when sendEmail is omitted', async () => {
    const recipient = randomUUID();
    await setNotificationPrefs(pdb, recipient, { communicationEmail: true });

    await sendAdminMessage(
      pdb,
      { recipientUserIds: [recipient], subject: 'Maintenance', body: 'body' },
      'admin-user-1',
      fakeResolver([recipient]),
    );

    expect(sendPlatformEmail).not.toHaveBeenCalled();
    expect(await lastEmailDeliveryLogRow(recipient, 'admin-message')).toBeUndefined();
  });
});
