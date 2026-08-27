import { getTableName, type Table } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A minimal in-memory fake of the Drizzle chain shapes `conversations.ts`
 * actually uses — same `getTableName()`-dispatch approach as
 * plugins/sovereign-plugin-plainwrite.local's `actions-sync-transaction.test.ts`
 * (a real in-memory better-sqlite3 instance isn't used here: this workspace
 * deliberately blocks plain `better-sqlite3`'s native build script in
 * `pnpm-workspace.yaml`, only allowing the `-multiple-ciphers` fork to build).
 * `eq`/`asc`/`desc` are mocked to simple descriptor objects this fake
 * understands, rather than real SQL fragments.
 */
interface Predicate {
  columnName: string;
  value: unknown;
}
interface Order {
  columnName: string;
  direction: 'asc' | 'desc';
}

let conversations: Array<{ id: string; tenantId: string; userId: string; createdAt: number }> = [];
let messages: Array<{
  id: string;
  conversationId: string;
  role: string;
  content: string;
  providerId: string | null;
  model: string;
  createdAt: number;
}> = [];
let nextId = 0;

vi.stubGlobal('crypto', { randomUUID: () => `id-${nextId++}` });

// Drizzle columns' `.name` is the *SQL* column name (snake_case), but the
// fake rows below are inserted with the JS-side (camelCase) keys
// `conversations.ts` actually uses (`{ userId, createdAt, ... }`) — convert
// so the fake's filtering looks up the same key the rows were stored under.
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

function rowsFor(tableName: string): Record<string, unknown>[] {
  return tableName === 'warden_conversation' ? conversations : messages;
}

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        return {
          where(predicate: Predicate) {
            const filtered = rowsFor(tableName).filter(
              (r) => r[predicate.columnName] === predicate.value,
            );
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
  delete(table: Table) {
    const tableName = getTableName(table);
    return {
      where: async (predicate: Predicate) => {
        if (tableName === 'warden_messages') {
          messages = messages.filter((m) => m[predicate.columnName] !== predicate.value);
        }
      },
    };
  },
};

vi.mock('@sovereignfs/sdk', () => ({
  sdk: { db: { getClient: vi.fn(async () => fakeDb) } },
}));

const { appendMessage, clearMessages, getRecentMessagesForContext, listMessages } =
  await import('../conversations');

let fakeNow = 1_000_000;

beforeEach(() => {
  conversations = [];
  messages = [];
  nextId = 0;
  fakeNow = 1_000_000;
  // Strictly increasing on every call — appendMessage's `Date.now()` calls
  // inside a tight test loop would otherwise tie (millisecond-precision
  // wall-clock time doesn't advance meaningfully within one synchronous
  // loop), which would make "last N" ordering genuinely ambiguous, exactly
  // the ambiguity documented in conversations.ts's own module comment.
  vi.spyOn(Date, 'now').mockImplementation(() => fakeNow++);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getOrCreateConversation (via listMessages)', () => {
  it('creates exactly one conversation for a user across repeated calls', async () => {
    await listMessages('user-1', 'tenant-1');
    await listMessages('user-1', 'tenant-1');
    expect(conversations.filter((c) => c.userId === 'user-1')).toHaveLength(1);
  });

  it('never mixes two users into the same conversation', async () => {
    await listMessages('user-1', 'tenant-1');
    await listMessages('user-2', 'tenant-1');
    expect(conversations).toHaveLength(2);
  });
});

describe('appendMessage / listMessages', () => {
  it('returns messages oldest first', async () => {
    await appendMessage('user-1', 'tenant-1', {
      role: 'user',
      content: 'hi',
      providerId: null,
      model: 'local',
    });
    await appendMessage('user-1', 'tenant-1', {
      role: 'assistant',
      content: 'hello',
      providerId: null,
      model: 'local',
    });
    const result = await listMessages('user-1', 'tenant-1');
    expect(result.map((m) => m.content)).toEqual(['hi', 'hello']);
  });

  it('tags a message with the provider id and model used', async () => {
    await appendMessage('user-1', 'tenant-1', {
      role: 'assistant',
      content: 'hi from openrouter',
      providerId: 'conn-1',
      model: 'gpt-4o-mini',
    });
    const [message] = await listMessages('user-1', 'tenant-1');
    expect(message).toMatchObject({ providerId: 'conn-1', model: 'gpt-4o-mini' });
  });
});

describe('getRecentMessagesForContext', () => {
  it('returns only the last N messages, still oldest first', async () => {
    for (let i = 0; i < 5; i++) {
      await appendMessage('user-1', 'tenant-1', {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `msg-${i}`,
        providerId: null,
        model: 'local',
      });
    }
    const recent = await getRecentMessagesForContext('user-1', 'tenant-1', 2);
    expect(recent.map((m) => m.content)).toEqual(['msg-3', 'msg-4']);
  });
});

describe('clearMessages', () => {
  it('deletes every message but keeps the conversation row', async () => {
    await appendMessage('user-1', 'tenant-1', {
      role: 'user',
      content: 'hi',
      providerId: null,
      model: 'local',
    });
    await clearMessages('user-1', 'tenant-1');
    expect(await listMessages('user-1', 'tenant-1')).toEqual([]);
    expect(conversations.filter((c) => c.userId === 'user-1')).toHaveLength(1);
  });
});
