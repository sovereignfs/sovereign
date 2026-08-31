import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const provideExport = vi.fn();
const provideDelete = vi.fn();
vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    portability: {
      provideExport: (...args: unknown[]) => provideExport(...args),
      provideDelete: (...args: unknown[]) => provideDelete(...args),
    },
  },
}));

const listSessions = vi.fn();
const listMessages = vi.fn();
vi.mock('../sessions', () => ({
  listSessions: (...args: unknown[]) => listSessions(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
}));

function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (column: { name: string }, value: unknown) => ({
      columnName: toCamelCase(column.name),
      value,
    }),
    inArray: (column: { name: string }, values: unknown[]) => ({
      columnName: toCamelCase(column.name),
      values,
    }),
  };
});

type Predicate = { columnName: string; value: unknown } | { columnName: string; values: unknown[] };

function matches(row: Record<string, unknown>, predicate: Predicate): boolean {
  return 'values' in predicate
    ? predicate.values.includes(row[predicate.columnName])
    : row[predicate.columnName] === predicate.value;
}

let sessionRows: Array<{ id: string; userId: string }>;
let messageRows: Array<{ id: string; sessionId: string }>;

function fakeDb() {
  return {
    select: vi.fn(() => ({
      from(table: Table) {
        const tableName = getTableName(table);
        return {
          where: async (predicate: Predicate) => {
            const rows = tableName === 'warden_sessions' ? sessionRows : messageRows;
            return rows.filter((r) => matches(r as Record<string, unknown>, predicate));
          },
        };
      },
    })),
    delete: vi.fn((table: Table) => {
      const tableName = getTableName(table);
      return {
        where: async (predicate: Predicate) => {
          if (tableName === 'warden_messages') {
            messageRows = messageRows.filter(
              (m) => !matches(m as Record<string, unknown>, predicate),
            );
          } else {
            sessionRows = sessionRows.filter(
              (s) => !matches(s as Record<string, unknown>, predicate),
            );
          }
        },
      };
    }),
  };
}

const { registerPortability } = await import('../portability');

beforeEach(() => {
  vi.clearAllMocks();
  sessionRows = [];
  messageRows = [];
});

describe('registerPortability — export', () => {
  it('registers an export resolver that returns every session, grouped with its own messages', async () => {
    await registerPortability();
    const resolver = provideExport.mock.calls[0][0];

    listSessions.mockResolvedValue([
      { id: 'session-1', title: 'First chat', pinnedAt: null, lastActiveAt: 2, createdAt: 1 },
      { id: 'session-2', title: null, pinnedAt: 5, lastActiveAt: 4, createdAt: 3 },
    ]);
    listMessages.mockImplementation(async (_userId, _tenantId, sessionId) =>
      sessionId === 'session-1' ? [{ id: 'm1', role: 'user', content: 'hi' }] : [],
    );

    const section = await resolver({
      userId: 'user-1',
      tenantId: 'tenant-1',
      options: { includeFiles: true },
    });

    expect(listSessions).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(section).toEqual({
      pluginId: 'fs.sovereign.warden',
      schemaVersion: 2,
      data: {
        sessions: [
          {
            id: 'session-1',
            title: 'First chat',
            pinnedAt: null,
            lastActiveAt: 2,
            createdAt: 1,
            messages: [{ id: 'm1', role: 'user', content: 'hi' }],
          },
          {
            id: 'session-2',
            title: null,
            pinnedAt: 5,
            lastActiveAt: 4,
            createdAt: 3,
            messages: [],
          },
        ],
      },
    });
  });

  it('never includes provider connection or secret data in the export', async () => {
    await registerPortability();
    const resolver = provideExport.mock.calls[0][0];
    listSessions.mockResolvedValue([]);
    const section = await resolver({
      userId: 'user-1',
      tenantId: 'tenant-1',
      options: { includeFiles: true },
    });
    expect(JSON.stringify(section)).not.toMatch(/secret|apiKey|connection/i);
  });
});

describe('registerPortability — delete', () => {
  it('deletes every message and the session row for the user being deleted, via ctx.db directly', async () => {
    sessionRows = [{ id: 'session-1', userId: 'user-1' }];
    messageRows = [
      { id: 'm1', sessionId: 'session-1' },
      { id: 'm2', sessionId: 'session-1' },
    ];

    await registerPortability();
    const handler = provideDelete.mock.calls[0][0];
    const result = await handler({ userId: 'user-1', tenantId: 'tenant-1', db: fakeDb() });

    expect(result).toEqual({ deleted: 3 }); // 2 messages + 1 session row
    expect(messageRows).toEqual([]);
    expect(sessionRows).toEqual([]);
  });

  it("leaves another user's sessions and messages untouched", async () => {
    sessionRows = [
      { id: 'session-1', userId: 'user-1' },
      { id: 'session-2', userId: 'user-2' },
    ];
    messageRows = [{ id: 'm1', sessionId: 'session-2' }];

    await registerPortability();
    const handler = provideDelete.mock.calls[0][0];
    await handler({ userId: 'user-1', tenantId: 'tenant-1', db: fakeDb() });

    expect(sessionRows).toEqual([{ id: 'session-2', userId: 'user-2' }]);
    expect(messageRows).toEqual([{ id: 'm1', sessionId: 'session-2' }]);
  });

  it('returns zero deleted for a user with no sessions yet', async () => {
    await registerPortability();
    const handler = provideDelete.mock.calls[0][0];
    const result = await handler({ userId: 'user-1', tenantId: 'tenant-1', db: fakeDb() });
    expect(result).toEqual({ deleted: 0 });
  });

  it('deletes 3+ sessions and all their messages with a fixed, non-scaling number of database calls (task 22.7 regression guard, carried forward)', async () => {
    sessionRows = [
      { id: 'session-1', userId: 'user-1' },
      { id: 'session-2', userId: 'user-1' },
      { id: 'session-3', userId: 'user-1' },
    ];
    messageRows = [
      { id: 'm1', sessionId: 'session-1' },
      { id: 'm2', sessionId: 'session-1' },
      { id: 'm3', sessionId: 'session-2' },
      { id: 'm4', sessionId: 'session-3' },
      { id: 'm5', sessionId: 'session-3' },
      { id: 'm6', sessionId: 'session-3' },
    ];

    await registerPortability();
    const handler = provideDelete.mock.calls[0][0];
    const db = fakeDb();
    const result = await handler({ userId: 'user-1', tenantId: 'tenant-1', db });

    // 6 messages + 3 sessions, exactly as before — the return contract is
    // unchanged, only the table names are.
    expect(result).toEqual({ deleted: 9 });
    expect(sessionRows).toEqual([]);
    expect(messageRows).toEqual([]);

    // Fixed at 4 total database calls regardless of session count: one
    // select (session ids), one select (message ids for the count), one
    // delete (messages), one delete (sessions) — not a per-session loop.
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.delete).toHaveBeenCalledTimes(2);
  });
});
