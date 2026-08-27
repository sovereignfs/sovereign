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

const listMessages = vi.fn();
vi.mock('../conversations', () => ({
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
  };
});

let conversations: Array<{ id: string; userId: string }>;
let messages: Array<{ id: string; conversationId: string }>;

function fakeDb() {
  return {
    select() {
      return {
        from(table: Table) {
          const tableName = getTableName(table);
          return {
            where: async (predicate: { columnName: string; value: unknown }) => {
              const rows = tableName === 'warden_conversation' ? conversations : messages;
              return rows.filter(
                (r) => (r as Record<string, unknown>)[predicate.columnName] === predicate.value,
              );
            },
          };
        },
      };
    },
    delete(table: Table) {
      const tableName = getTableName(table);
      return {
        where: async (predicate: { columnName: string; value: unknown }) => {
          if (tableName === 'warden_messages') {
            messages = messages.filter(
              (m) => (m as Record<string, unknown>)[predicate.columnName] !== predicate.value,
            );
          } else {
            conversations = conversations.filter(
              (c) => (c as Record<string, unknown>)[predicate.columnName] !== predicate.value,
            );
          }
        },
      };
    },
  };
}

const { registerPortability } = await import('../portability');

beforeEach(() => {
  vi.clearAllMocks();
  conversations = [];
  messages = [];
});

describe('registerPortability — export', () => {
  it("registers an export resolver that returns the user's messages, plugin-scoped", async () => {
    await registerPortability();
    const resolver = provideExport.mock.calls[0][0];

    listMessages.mockResolvedValue([{ id: 'm1', role: 'user', content: 'hi' }]);
    const section = await resolver({
      userId: 'user-1',
      tenantId: 'tenant-1',
      options: { includeFiles: true },
    });

    expect(listMessages).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(section).toEqual({
      pluginId: 'fs.sovereign.warden',
      schemaVersion: 1,
      data: { messages: [{ id: 'm1', role: 'user', content: 'hi' }] },
    });
  });

  it('never includes provider connection or secret data in the export', async () => {
    await registerPortability();
    const resolver = provideExport.mock.calls[0][0];
    listMessages.mockResolvedValue([]);
    const section = await resolver({
      userId: 'user-1',
      tenantId: 'tenant-1',
      options: { includeFiles: true },
    });
    expect(JSON.stringify(section)).not.toMatch(/secret|apiKey|connection/i);
  });
});

describe('registerPortability — delete', () => {
  it('deletes every message and the conversation row for the user being deleted, via ctx.db directly', async () => {
    conversations = [{ id: 'conv-1', userId: 'user-1' }];
    messages = [
      { id: 'm1', conversationId: 'conv-1' },
      { id: 'm2', conversationId: 'conv-1' },
    ];

    await registerPortability();
    const handler = provideDelete.mock.calls[0][0];
    const result = await handler({ userId: 'user-1', tenantId: 'tenant-1', db: fakeDb() });

    expect(result).toEqual({ deleted: 3 }); // 2 messages + 1 conversation row
    expect(messages).toEqual([]);
    expect(conversations).toEqual([]);
  });

  it("leaves another user's conversation and messages untouched", async () => {
    conversations = [
      { id: 'conv-1', userId: 'user-1' },
      { id: 'conv-2', userId: 'user-2' },
    ];
    messages = [{ id: 'm1', conversationId: 'conv-2' }];

    await registerPortability();
    const handler = provideDelete.mock.calls[0][0];
    await handler({ userId: 'user-1', tenantId: 'tenant-1', db: fakeDb() });

    expect(conversations).toEqual([{ id: 'conv-2', userId: 'user-2' }]);
    expect(messages).toEqual([{ id: 'm1', conversationId: 'conv-2' }]);
  });

  it('returns zero deleted for a user with no conversation yet', async () => {
    await registerPortability();
    const handler = provideDelete.mock.calls[0][0];
    const result = await handler({ userId: 'user-1', tenantId: 'tenant-1', db: fakeDb() });
    expect(result).toEqual({ deleted: 0 });
  });
});
