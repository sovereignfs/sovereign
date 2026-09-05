import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const provideExport = vi.fn();
const provideImport = vi.fn();
const provideDelete = vi.fn();
vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    portability: {
      provideExport: (...args: unknown[]) => provideExport(...args),
      provideImport: (...args: unknown[]) => provideImport(...args),
      provideDelete: (...args: unknown[]) => provideDelete(...args),
    },
    // The export and import resolvers both read/write via `sdk.db.getClient()`
    // (the deletion handler gets its client via `ctx.db` instead).
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
    // The import handler is the first user of `and(...)` in this file —
    // combines sub-predicates rather than wrapping real drizzle SQL, so
    // `matches` below can evaluate it the same way it does a single `eq`.
    and: (...conditions: unknown[]) => ({ and: conditions as Predicate[] }),
  };
});

type Predicate =
  | { columnName: string; value: unknown }
  | { columnName: string; values: unknown[] }
  | { and: Predicate[] };

function matches(row: Record<string, unknown>, predicate: Predicate): boolean {
  if ('and' in predicate) return predicate.and.every((p) => matches(row, p));
  return 'values' in predicate
    ? predicate.values.includes(row[predicate.columnName])
    : row[predicate.columnName] === predicate.value;
}

let sessionRows: Array<{
  id: string;
  tenantId?: string;
  userId: string;
  title?: string | null;
  pinnedAt?: number | null;
  lastActiveAt?: number;
  createdAt?: number;
}>;
let messageRows: Array<{
  id: string;
  sessionId: string;
  role?: string;
  content?: string;
  providerId?: string | null;
  model?: string;
  createdAt?: number;
}>;
let visibilityRows: Array<{
  id: string;
  tenantId?: string;
  userId: string;
  modelKey: string;
  createdAt?: number;
}>;
let settingsRows: Array<{
  id: string;
  tenantId?: string;
  userId: string;
  defaultModelKey: string | null;
  createdAt?: number;
}>;

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
          // `.where(...)` is awaitable directly (every existing caller does
          // this) *and* supports a chained `.limit(n)` (the import handler's
          // existence checks do this) — a real Promise, with `.limit`
          // attached as an extra own property, satisfies both call shapes.
          where(predicate: Predicate) {
            const filtered = rowsFor(tableName).filter((r) => matches(r, predicate));
            return Object.assign(Promise.resolve(filtered), {
              limit: async (n: number) => filtered.slice(0, n),
            });
          },
        };
      },
    })),
    insert: vi.fn((table: Table) => ({
      values: async (row: AnyRow) => {
        const tableName = getTableName(table);
        replaceRows(tableName, [...rowsFor(tableName), row]);
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

describe('registerPortability — import', () => {
  const remapId = vi.fn((id: string) => `new-${id}`);
  const importCtx = { userId: 'user-1', tenantId: 'tenant-1', remapId };

  beforeEach(() => {
    remapId.mockClear();
  });

  async function getImporter() {
    await registerPortability();
    return provideImport.mock.calls[0][0] as (
      section: { pluginId: string; schemaVersion: number; data: unknown },
      ctx: typeof importCtx,
    ) => Promise<void>;
  }

  it('throws on an unrecognized schema version', async () => {
    const importer = await getImporter();
    await expect(
      importer(
        {
          pluginId: 'fs.sovereign.warden',
          schemaVersion: 2,
          data: { sessions: [], modelVisibility: [], defaultModelKey: null },
        },
        importCtx,
      ),
    ).rejects.toThrow(/unrecognized shape/);
  });

  it('throws on a malformed section (missing sessions array)', async () => {
    const importer = await getImporter();
    await expect(
      importer(
        {
          pluginId: 'fs.sovereign.warden',
          schemaVersion: 3,
          data: { modelVisibility: [], defaultModelKey: null },
        },
        importCtx,
      ),
    ).rejects.toThrow(/unrecognized shape/);
  });

  it('imports every session and its messages, remapping ids via ctx.remapId', async () => {
    const importer = await getImporter();
    await importer(
      {
        pluginId: 'fs.sovereign.warden',
        schemaVersion: 3,
        data: {
          sessions: [
            {
              id: 'orig-session-1',
              title: 'First chat',
              pinnedAt: null,
              lastActiveAt: 2,
              createdAt: 1,
              messages: [
                {
                  id: 'orig-m1',
                  role: 'user',
                  content: 'hi',
                  providerId: 'conn-old',
                  model: 'gpt-4o-mini',
                  createdAt: 1,
                },
                {
                  id: 'orig-m2',
                  role: 'assistant',
                  content: 'hello',
                  providerId: 'conn-old',
                  model: 'gpt-4o-mini',
                  createdAt: 2,
                },
              ],
            },
          ],
          modelVisibility: [],
          defaultModelKey: null,
        },
      },
      importCtx,
    );

    expect(sessionRows).toEqual([
      {
        id: 'new-orig-session-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'First chat',
        pinnedAt: null,
        lastActiveAt: 2,
        createdAt: 1,
      },
    ]);
    expect(messageRows).toEqual([
      {
        id: 'new-orig-m1',
        sessionId: 'new-orig-session-1',
        role: 'user',
        content: 'hi',
        providerId: 'conn-old',
        model: 'gpt-4o-mini',
        createdAt: 1,
      },
      {
        id: 'new-orig-m2',
        sessionId: 'new-orig-session-1',
        role: 'assistant',
        content: 'hello',
        providerId: 'conn-old',
        model: 'gpt-4o-mini',
        createdAt: 2,
      },
    ]);
    // Every message's sessionId was remapped to the *same* new session id
    // its parent session got — not re-derived independently.
    expect(remapId).toHaveBeenCalledWith('orig-session-1');
  });

  it("preserves a session's pinnedAt exactly as exported, even beyond the interactive pin cap", async () => {
    const importer = await getImporter();
    const pinnedSession = (n: number) => ({
      id: `orig-${n}`,
      title: null,
      pinnedAt: 100 + n,
      lastActiveAt: 1,
      createdAt: 1,
      messages: [],
    });
    // 6 pinned sessions — one more than MAX_PINNED_SESSIONS (5). The import
    // path preserves exported state faithfully rather than re-enforcing the
    // interactive pinSession() cap; nothing breaks, the user can unpin down
    // to the cap afterward the same way they always can.
    await importer(
      {
        pluginId: 'fs.sovereign.warden',
        schemaVersion: 3,
        data: {
          sessions: [1, 2, 3, 4, 5, 6].map(pinnedSession),
          modelVisibility: [],
          defaultModelKey: null,
        },
      },
      importCtx,
    );
    expect(sessionRows.filter((s) => s.pinnedAt !== null)).toHaveLength(6);
  });

  it('coerces an unrecognized stored role to "user", defensively', async () => {
    const importer = await getImporter();
    await importer(
      {
        pluginId: 'fs.sovereign.warden',
        schemaVersion: 3,
        data: {
          sessions: [
            {
              id: 's1',
              title: null,
              pinnedAt: null,
              lastActiveAt: 1,
              createdAt: 1,
              messages: [
                {
                  id: 'm1',
                  role: 'system',
                  content: 'x',
                  providerId: null,
                  model: 'local',
                  createdAt: 1,
                },
              ],
            },
          ],
          modelVisibility: [],
          defaultModelKey: null,
        },
      },
      importCtx,
    );
    expect(messageRows[0]?.role).toBe('user');
  });

  it('adds a model-visibility override only for keys the account does not already have one for', async () => {
    visibilityRows = [
      { id: 'existing', tenantId: 'tenant-1', userId: 'user-1', modelKey: 'local', createdAt: 0 },
    ];
    const importer = await getImporter();
    await importer(
      {
        pluginId: 'fs.sovereign.warden',
        schemaVersion: 3,
        data: {
          sessions: [],
          modelVisibility: ['local', 'conn-1:gpt-4o-mini'],
          defaultModelKey: null,
        },
      },
      importCtx,
    );
    expect(visibilityRows).toHaveLength(2);
    expect(visibilityRows.map((r) => r.modelKey).sort()).toEqual(['conn-1:gpt-4o-mini', 'local']);
    // The pre-existing 'local' row was left alone, not duplicated or replaced.
    expect(visibilityRows.find((r) => r.modelKey === 'local')?.id).toBe('existing');
  });

  it('seeds defaultModelKey only when the account has no settings row yet', async () => {
    const importer = await getImporter();
    await importer(
      {
        pluginId: 'fs.sovereign.warden',
        schemaVersion: 3,
        data: { sessions: [], modelVisibility: [], defaultModelKey: 'conn-1:gpt-4o-mini' },
      },
      importCtx,
    );
    expect(settingsRows).toHaveLength(1);
    expect(settingsRows[0]?.defaultModelKey).toBe('conn-1:gpt-4o-mini');
  });

  it('never overwrites an existing settings row, even if the export has a different default', async () => {
    settingsRows = [
      {
        id: 'existing',
        tenantId: 'tenant-1',
        userId: 'user-1',
        defaultModelKey: 'local',
        createdAt: 0,
      },
    ];
    const importer = await getImporter();
    await importer(
      {
        pluginId: 'fs.sovereign.warden',
        schemaVersion: 3,
        data: { sessions: [], modelVisibility: [], defaultModelKey: 'conn-1:gpt-4o-mini' },
      },
      importCtx,
    );
    expect(settingsRows).toEqual([
      {
        id: 'existing',
        tenantId: 'tenant-1',
        userId: 'user-1',
        defaultModelKey: 'local',
        createdAt: 0,
      },
    ]);
  });

  it('does nothing for defaultModelKey when the export has none', async () => {
    const importer = await getImporter();
    await importer(
      {
        pluginId: 'fs.sovereign.warden',
        schemaVersion: 3,
        data: { sessions: [], modelVisibility: [], defaultModelKey: null },
      },
      importCtx,
    );
    expect(settingsRows).toEqual([]);
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
