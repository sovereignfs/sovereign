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
    // The export resolver reads the two preference tables directly (the
    // deletion handler gets its client via `ctx.db` instead).
    db: { getClient: async () => fakeDb() },
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
let visibilityRows: Array<{ id: string; userId: string; modelKey: string }>;
let settingsRows: Array<{ id: string; userId: string; defaultModelKey: string | null }>;

type AnyRow = Record<string, unknown>;

function rowsFor(tableName: string): AnyRow[] {
  switch (tableName) {
    case 'warden_sessions':
      return sessionRows;
    case 'warden_model_visibility_overrides':
      return visibilityRows;
    case 'warden_user_settings':
      return settingsRows;
    default:
      return messageRows;
  }
}

function replaceRows(tableName: string, next: AnyRow[]): void {
  switch (tableName) {
    case 'warden_sessions':
      sessionRows = next as typeof sessionRows;
      break;
    case 'warden_model_visibility_overrides':
      visibilityRows = next as typeof visibilityRows;
      break;
    case 'warden_user_settings':
      settingsRows = next as typeof settingsRows;
      break;
    default:
      messageRows = next as typeof messageRows;
  }
}

function fakeDb() {
  return {
    select: vi.fn(() => ({
      from(table: Table) {
        const tableName = getTableName(table);
        return {
          where: async (predicate: Predicate) =>
            rowsFor(tableName).filter((r) => matches(r, predicate)),
        };
      },
    })),
    delete: vi.fn((table: Table) => {
      const tableName = getTableName(table);
      return {
        where: async (predicate: Predicate) => {
          replaceRows(
            tableName,
            rowsFor(tableName).filter((r) => !matches(r, predicate)),
          );
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
  visibilityRows = [];
  settingsRows = [];
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
      schemaVersion: 3,
      data: {
        modelVisibility: [],
        defaultModelKey: null,
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

  it('includes the model-visibility overrides and default model', async () => {
    visibilityRows = [
      { id: 'v1', userId: 'user-1', modelKey: 'conn-1:gpt-4o-mini' },
      { id: 'v2', userId: 'user-1', modelKey: 'local' },
      { id: 'v3', userId: 'user-2', modelKey: 'conn-9:other' },
    ];
    settingsRows = [{ id: 's1', userId: 'user-1', defaultModelKey: 'conn-1:gpt-4o-mini' }];
    listSessions.mockResolvedValue([]);

    await registerPortability();
    const resolver = provideExport.mock.calls[0][0];
    const section = await resolver({
      userId: 'user-1',
      tenantId: 'tenant-1',
      options: { includeFiles: true },
    });

    expect(section.data.modelVisibility).toEqual(['conn-1:gpt-4o-mini', 'local']);
    expect(section.data.defaultModelKey).toBe('conn-1:gpt-4o-mini');
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

  /**
   * Warden owns four user-scoped tables. The two preference tables were
   * missed when they were added (task 22.9), so a deleted account left its
   * model-visibility choices — which reveal exactly which models it used —
   * and its default model behind indefinitely.
   */
  it('clears the model-visibility overrides and user settings too', async () => {
    sessionRows = [{ id: 'session-1', userId: 'user-1' }];
    messageRows = [{ id: 'm1', sessionId: 'session-1' }];
    visibilityRows = [
      { id: 'v1', userId: 'user-1', modelKey: 'local' },
      { id: 'v2', userId: 'user-2', modelKey: 'local' },
    ];
    settingsRows = [
      { id: 's1', userId: 'user-1', defaultModelKey: 'local' },
      { id: 's2', userId: 'user-2', defaultModelKey: null },
    ];

    await registerPortability();
    const handler = provideDelete.mock.calls[0][0];
    const result = await handler({ userId: 'user-1', tenantId: 'tenant-1', db: fakeDb() });

    // 1 message + 1 session + 1 visibility override + 1 settings row.
    expect(result).toEqual({ deleted: 4 });
    expect(visibilityRows).toEqual([{ id: 'v2', userId: 'user-2', modelKey: 'local' }]);
    expect(settingsRows).toEqual([{ id: 's2', userId: 'user-2', defaultModelKey: null }]);
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

    // Fixed at 8 total database calls regardless of session count: four
    // selects (session ids, message ids, visibility rows, settings rows —
    // the last three only for the returned count) and four deletes, one per
    // owned table. Still flat, not a per-session loop.
    expect(db.select).toHaveBeenCalledTimes(4);
    expect(db.delete).toHaveBeenCalledTimes(4);
  });
});
