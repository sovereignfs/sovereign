import { getTableName, type Table } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A minimal in-memory fake of the Drizzle chain shapes `sessions.ts`
 * actually uses — same `getTableName()`-dispatch approach
 * `conversations.test.ts` originally used, extended with `update().set()`
 * for pin/unpin/rename/lastActiveAt writes. `eq`/`asc`/`desc` are mocked to
 * simple descriptor objects this fake understands, rather than real SQL
 * fragments.
 */
type Predicate = { columnName: string; value: unknown } | { columnName: string; values: unknown[] };

function matches(row: Record<string, unknown>, predicate: Predicate): boolean {
  return 'values' in predicate
    ? predicate.values.includes(row[predicate.columnName])
    : row[predicate.columnName] === predicate.value;
}
interface Order {
  columnName: string;
  direction: 'asc' | 'desc';
}

interface SessionRow {
  id: string;
  tenantId: string;
  userId: string;
  title: string | null;
  pinnedAt: number | null;
  lastActiveAt: number;
  createdAt: number;
}
interface MessageRow {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  providerId: string | null;
  model: string;
  createdAt: number;
}

let sessions: SessionRow[] = [];
let messages: MessageRow[] = [];
let nextId = 0;

vi.stubGlobal('crypto', { randomUUID: () => `id-${nextId++}` });

function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (column: { name: string }, value: unknown): Predicate => ({
      columnName: toCamelCase(column.name),
      value,
    }),
    inArray: (column: { name: string }, values: unknown[]): Predicate => ({
      columnName: toCamelCase(column.name),
      values,
    }),
    asc: (column: { name: string }): Order => ({
      columnName: toCamelCase(column.name),
      direction: 'asc',
    }),
    desc: (column: { name: string }): Order => ({
      columnName: toCamelCase(column.name),
      direction: 'desc',
    }),
  };
});

function rowsFor(tableName: string): Array<Record<string, unknown>> {
  return tableName === 'warden_sessions' ? sessions : messages;
}

function applyUpdate(tableName: string, predicate: Predicate, patch: Record<string, unknown>) {
  const rows = rowsFor(tableName);
  for (const row of rows) {
    if (matches(row, predicate)) Object.assign(row, patch);
  }
}

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        return {
          where(predicate: Predicate) {
            const filtered = rowsFor(tableName).filter((r) => matches(r, predicate));
            return {
              limit: async (n: number) => filtered.slice(0, n),
              orderBy: (order: Order) => {
                const sorted = [...filtered].sort((a, b) => {
                  const av = a[order.columnName] as number;
                  const bv = b[order.columnName] as number;
                  return order.direction === 'asc' ? av - bv : bv - av;
                });
                return {
                  limit: async (n: number) => sorted.slice(0, n),
                  then: (resolve: (v: unknown) => void) => resolve(sorted),
                };
              },
              then: (resolve: (v: unknown) => void) => resolve(filtered),
            };
          },
        };
      },
    };
  },
  insert(table: Table) {
    const tableName = getTableName(table);
    return {
      values: async (row: Record<string, unknown>) => {
        rowsFor(tableName).push(row);
      },
    };
  },
  update(table: Table) {
    const tableName = getTableName(table);
    return {
      set(patch: Record<string, unknown>) {
        return {
          where: async (predicate: Predicate) => applyUpdate(tableName, predicate, patch),
        };
      },
    };
  },
  delete(table: Table) {
    const tableName = getTableName(table);
    return {
      where: async (predicate: Predicate) => {
        if (tableName === 'warden_messages') {
          messages = messages.filter((m) => !matches(m, predicate));
        } else {
          sessions = sessions.filter((s) => !matches(s, predicate));
        }
      },
    };
  },
};

vi.mock('@sovereignfs/sdk', () => ({
  sdk: { db: { getClient: vi.fn(async () => fakeDb) } },
}));

const {
  appendMessage,
  createSession,
  deleteInactiveSessions,
  deleteSession,
  getMostRecentSession,
  getRecentMessagesForContext,
  listMessages,
  listSessions,
  MAX_PINNED_SESSIONS,
  pinSession,
  renameSession,
  SessionNotFoundError,
  SessionPinLimitError,
  unpinSession,
} = await import('../sessions');

let fakeNow = 1_000_000;

beforeEach(() => {
  sessions = [];
  messages = [];
  nextId = 0;
  fakeNow = 1_000_000;
  // Strictly increasing on every call — a tight test loop's Date.now()
  // calls would otherwise tie at millisecond precision, making ordering
  // genuinely ambiguous (same reasoning sessions.ts's own comment gives).
  vi.spyOn(Date, 'now').mockImplementation(() => fakeNow++);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSession / getMostRecentSession / listSessions', () => {
  it('creates a distinct session on every call — never collapsing to one per user', async () => {
    await createSession('user-1', 'tenant-1');
    await createSession('user-1', 'tenant-1');
    expect(sessions.filter((s) => s.userId === 'user-1')).toHaveLength(2);
  });

  it('returns null for a user with no sessions yet', async () => {
    expect(await getMostRecentSession('user-1', 'tenant-1')).toBeNull();
  });

  it('returns the most recently active session, not the most recently created one', async () => {
    const first = await createSession('user-1', 'tenant-1');
    const second = await createSession('user-1', 'tenant-1');
    // Bump the first session's activity after the second was created.
    await appendMessage('user-1', 'tenant-1', first.id, {
      role: 'user',
      content: 'hi',
      providerId: null,
      model: 'local',
    });
    const mostRecent = await getMostRecentSession('user-1', 'tenant-1');
    expect(mostRecent?.id).toBe(first.id);
    expect(mostRecent?.id).not.toBe(second.id);
  });

  it('lists only this user’s sessions, most recently active first', async () => {
    const a = await createSession('user-1', 'tenant-1');
    await createSession('user-2', 'tenant-1');
    const b = await createSession('user-1', 'tenant-1');
    await appendMessage('user-1', 'tenant-1', a.id, {
      role: 'user',
      content: 'hi',
      providerId: null,
      model: 'local',
    });
    const listed = await listSessions('user-1', 'tenant-1');
    expect(listed.map((s) => s.id)).toEqual([a.id, b.id]);
  });
});

describe('cross-user isolation', () => {
  it('never returns another user’s session from any ownership-checked operation', async () => {
    const foreign = await createSession('user-2', 'tenant-1');

    await expect(listMessages('user-1', 'tenant-1', foreign.id)).rejects.toThrow(
      SessionNotFoundError,
    );
    await expect(getRecentMessagesForContext('user-1', 'tenant-1', foreign.id, 10)).rejects.toThrow(
      SessionNotFoundError,
    );
    await expect(
      appendMessage('user-1', 'tenant-1', foreign.id, {
        role: 'user',
        content: 'hi',
        providerId: null,
        model: 'local',
      }),
    ).rejects.toThrow(SessionNotFoundError);
    await expect(renameSession('user-1', 'tenant-1', foreign.id, 'x')).rejects.toThrow(
      SessionNotFoundError,
    );
    await expect(pinSession('user-1', 'tenant-1', foreign.id)).rejects.toThrow(
      SessionNotFoundError,
    );
    await expect(unpinSession('user-1', 'tenant-1', foreign.id)).rejects.toThrow(
      SessionNotFoundError,
    );

    // delete is deliberately idempotent/silent on a foreign id (matches
    // deleteProvider's own convention), not an error — and it must not
    // actually delete another user's session either.
    await deleteSession('user-1', 'tenant-1', foreign.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(foreign.id);
  });
});

describe('appendMessage / listMessages / getRecentMessagesForContext', () => {
  it('returns messages for one session, oldest first', async () => {
    const session = await createSession('user-1', 'tenant-1');
    await appendMessage('user-1', 'tenant-1', session.id, {
      role: 'user',
      content: 'hi',
      providerId: null,
      model: 'local',
    });
    await appendMessage('user-1', 'tenant-1', session.id, {
      role: 'assistant',
      content: 'hello',
      providerId: null,
      model: 'local',
    });
    const result = await listMessages('user-1', 'tenant-1', session.id);
    expect(result.map((m) => m.content)).toEqual(['hi', 'hello']);
  });

  it('keeps two sessions’ messages fully separate', async () => {
    const a = await createSession('user-1', 'tenant-1');
    const b = await createSession('user-1', 'tenant-1');
    await appendMessage('user-1', 'tenant-1', a.id, {
      role: 'user',
      content: 'in a',
      providerId: null,
      model: 'local',
    });
    await appendMessage('user-1', 'tenant-1', b.id, {
      role: 'user',
      content: 'in b',
      providerId: null,
      model: 'local',
    });
    expect((await listMessages('user-1', 'tenant-1', a.id)).map((m) => m.content)).toEqual([
      'in a',
    ]);
    expect((await listMessages('user-1', 'tenant-1', b.id)).map((m) => m.content)).toEqual([
      'in b',
    ]);
  });

  it('bumps lastActiveAt only when a message is actually sent', async () => {
    const session = await createSession('user-1', 'tenant-1');
    const beforeSend = (await getMostRecentSession('user-1', 'tenant-1'))?.lastActiveAt;
    await appendMessage('user-1', 'tenant-1', session.id, {
      role: 'user',
      content: 'hi',
      providerId: null,
      model: 'local',
    });
    const afterSend = (await getMostRecentSession('user-1', 'tenant-1'))?.lastActiveAt;
    expect(afterSend).toBeGreaterThan(beforeSend as number);
  });

  it('sets the session title from the first user message, and never overwrites it again', async () => {
    const session = await createSession('user-1', 'tenant-1');
    await appendMessage('user-1', 'tenant-1', session.id, {
      role: 'user',
      content: '  Tell me about the weather today  ',
      providerId: null,
      model: 'local',
    });
    let sessions_ = await listSessions('user-1', 'tenant-1');
    expect(sessions_[0].title).toBe('Tell me about the weather today');

    await appendMessage('user-1', 'tenant-1', session.id, {
      role: 'assistant',
      content: 'It is sunny.',
      providerId: null,
      model: 'local',
    });
    await appendMessage('user-1', 'tenant-1', session.id, {
      role: 'user',
      content: 'A completely different follow-up',
      providerId: null,
      model: 'local',
    });
    sessions_ = await listSessions('user-1', 'tenant-1');
    expect(sessions_[0].title).toBe('Tell me about the weather today');
  });

  it('truncates a very long first message into a title', async () => {
    const session = await createSession('user-1', 'tenant-1');
    await appendMessage('user-1', 'tenant-1', session.id, {
      role: 'user',
      content: 'x'.repeat(200),
      providerId: null,
      model: 'local',
    });
    const [row] = await listSessions('user-1', 'tenant-1');
    expect(row.title?.length).toBeLessThanOrEqual(60);
    expect(row.title?.endsWith('…')).toBe(true);
  });

  it('getRecentMessagesForContext returns only the last N messages, still oldest first', async () => {
    const session = await createSession('user-1', 'tenant-1');
    for (let i = 0; i < 5; i++) {
      await appendMessage('user-1', 'tenant-1', session.id, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `msg-${i}`,
        providerId: null,
        model: 'local',
      });
    }
    const recent = await getRecentMessagesForContext('user-1', 'tenant-1', session.id, 2);
    expect(recent.map((m) => m.content)).toEqual(['msg-3', 'msg-4']);
  });
});

describe('renameSession', () => {
  it('sets a trimmed title', async () => {
    const session = await createSession('user-1', 'tenant-1');
    const renamed = await renameSession('user-1', 'tenant-1', session.id, '  My chat  ');
    expect(renamed.title).toBe('My chat');
  });

  it('clears the title back to null when renamed to blank', async () => {
    const session = await createSession('user-1', 'tenant-1');
    await renameSession('user-1', 'tenant-1', session.id, 'Something');
    const cleared = await renameSession('user-1', 'tenant-1', session.id, '   ');
    expect(cleared.title).toBeNull();
  });

  it('throws for a session that does not exist at all', async () => {
    await expect(renameSession('user-1', 'tenant-1', 'nope', 'x')).rejects.toThrow(
      SessionNotFoundError,
    );
  });
});

describe('pinSession / unpinSession', () => {
  it('pins a session, stamping pinnedAt', async () => {
    const session = await createSession('user-1', 'tenant-1');
    const pinned = await pinSession('user-1', 'tenant-1', session.id);
    expect(pinned.pinnedAt).not.toBeNull();
  });

  it('is idempotent when pinning an already-pinned session', async () => {
    const session = await createSession('user-1', 'tenant-1');
    const first = await pinSession('user-1', 'tenant-1', session.id);
    const second = await pinSession('user-1', 'tenant-1', session.id);
    expect(second.pinnedAt).toBe(first.pinnedAt);
  });

  it(`rejects pinning a ${MAX_PINNED_SESSIONS + 1}th session outright, not by evicting the oldest pin`, async () => {
    const pinnedIds: string[] = [];
    for (let i = 0; i < MAX_PINNED_SESSIONS; i++) {
      const session = await createSession('user-1', 'tenant-1');
      await pinSession('user-1', 'tenant-1', session.id);
      pinnedIds.push(session.id);
    }
    const oneTooMany = await createSession('user-1', 'tenant-1');

    await expect(pinSession('user-1', 'tenant-1', oneTooMany.id)).rejects.toThrow(
      SessionPinLimitError,
    );

    // The oldest pin is still pinned — no silent auto-eviction happened.
    const stillPinned = (await listSessions('user-1', 'tenant-1')).filter(
      (s) => s.pinnedAt !== null,
    );
    expect(stillPinned.map((s) => s.id).sort()).toEqual([...pinnedIds].sort());
  });

  it('unpinning frees a slot for a new pin', async () => {
    const pinnedIds: string[] = [];
    for (let i = 0; i < MAX_PINNED_SESSIONS; i++) {
      const session = await createSession('user-1', 'tenant-1');
      await pinSession('user-1', 'tenant-1', session.id);
      pinnedIds.push(session.id);
    }
    await unpinSession('user-1', 'tenant-1', pinnedIds[0]);
    const oneMore = await createSession('user-1', 'tenant-1');
    await expect(pinSession('user-1', 'tenant-1', oneMore.id)).resolves.toMatchObject({
      id: oneMore.id,
    });
  });
});

describe('deleteSession', () => {
  it('deletes the session and all of its messages', async () => {
    const session = await createSession('user-1', 'tenant-1');
    await appendMessage('user-1', 'tenant-1', session.id, {
      role: 'user',
      content: 'hi',
      providerId: null,
      model: 'local',
    });
    await deleteSession('user-1', 'tenant-1', session.id);
    expect(sessions).toEqual([]);
    expect(messages).toEqual([]);
  });

  it('leaves other sessions and their messages untouched', async () => {
    const keep = await createSession('user-1', 'tenant-1');
    const remove = await createSession('user-1', 'tenant-1');
    await appendMessage('user-1', 'tenant-1', keep.id, {
      role: 'user',
      content: 'keep me',
      providerId: null,
      model: 'local',
    });
    await deleteSession('user-1', 'tenant-1', remove.id);
    expect(sessions.map((s) => s.id)).toEqual([keep.id]);
    expect((await listMessages('user-1', 'tenant-1', keep.id)).map((m) => m.content)).toEqual([
      'keep me',
    ]);
  });

  it('is a silent no-op for an already-gone session id', async () => {
    await expect(deleteSession('user-1', 'tenant-1', 'never-existed')).resolves.toBeUndefined();
  });
});

describe('deleteInactiveSessions', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Directly backdates a session's `lastActiveAt` in the fake store —
   *  the mocked `Date.now()` counter increments by 1ms per call, far too
   *  small to simulate real day-scale gaps through normal API calls. */
  function ageSession(sessionId: string, daysAgo: number) {
    const row = sessions.find((s) => s.id === sessionId);
    if (row) row.lastActiveAt = Date.now() - daysAgo * DAY_MS;
  }

  it('deletes only sessions older than the threshold, along with their messages', async () => {
    const stale = await createSession('user-1', 'tenant-1');
    const fresh = await createSession('user-1', 'tenant-1');
    await appendMessage('user-1', 'tenant-1', stale.id, {
      role: 'user',
      content: 'old',
      providerId: null,
      model: 'local',
    });
    ageSession(stale.id, 40);
    ageSession(fresh.id, 5);

    const deleted = await deleteInactiveSessions('user-1', 'tenant-1', 30);

    expect(deleted).toBe(1);
    expect(sessions.map((s) => s.id)).toEqual([fresh.id]);
    expect(messages).toEqual([]);
  });

  it('never deletes a pinned session, no matter how inactive', async () => {
    const stalePinned = await createSession('user-1', 'tenant-1');
    await pinSession('user-1', 'tenant-1', stalePinned.id);
    ageSession(stalePinned.id, 400);

    const deleted = await deleteInactiveSessions('user-1', 'tenant-1', 30);

    expect(deleted).toBe(0);
    expect(sessions.map((s) => s.id)).toEqual([stalePinned.id]);
  });

  it('never touches another user’s sessions', async () => {
    const mine = await createSession('user-1', 'tenant-1');
    const theirs = await createSession('user-2', 'tenant-1');
    ageSession(mine.id, 40);
    ageSession(theirs.id, 40);

    const deleted = await deleteInactiveSessions('user-1', 'tenant-1', 30);

    expect(deleted).toBe(1);
    expect(sessions.map((s) => s.id)).toEqual([theirs.id]);
  });

  it('returns 0 and issues no delete when nothing is stale', async () => {
    const fresh = await createSession('user-1', 'tenant-1');
    ageSession(fresh.id, 1);
    expect(await deleteInactiveSessions('user-1', 'tenant-1', 30)).toBe(0);
    expect(sessions).toHaveLength(1);
  });
});
