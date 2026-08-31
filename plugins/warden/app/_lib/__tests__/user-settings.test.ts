import type { Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Predicate {
  columnName: string;
  value: unknown;
}

interface SettingsRow {
  id: string;
  tenantId: string;
  userId: string;
  defaultModelKey: string | null;
  createdAt: number;
}

let rows: SettingsRow[] = [];
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
  };
});

const fakeDb = {
  select() {
    return {
      from(_table: Table) {
        return {
          where(predicate: Predicate) {
            return {
              limit: async (n: number) =>
                rows
                  .filter((r) => r[predicate.columnName as keyof SettingsRow] === predicate.value)
                  .slice(0, n),
            };
          },
        };
      },
    };
  },
  insert(_table: Table) {
    return {
      values: async (row: SettingsRow) => {
        rows.push(row);
      },
    };
  },
  update(_table: Table) {
    return {
      set(patch: Partial<SettingsRow>) {
        return {
          where: async (predicate: Predicate) => {
            for (const row of rows) {
              if (row[predicate.columnName as keyof SettingsRow] === predicate.value) {
                Object.assign(row, patch);
              }
            }
          },
        };
      },
    };
  },
};

vi.mock('@sovereignfs/sdk', () => ({
  sdk: { db: { getClient: vi.fn(async () => fakeDb) } },
}));

const { getDefaultModelKey, setDefaultModelKey } = await import('../user-settings');

beforeEach(() => {
  rows = [];
  nextId = 0;
});

describe('getDefaultModelKey', () => {
  it('returns null for a user with no row yet, creating one lazily', async () => {
    expect(await getDefaultModelKey('user-1', 'tenant-1')).toBeNull();
    expect(rows.filter((r) => r.userId === 'user-1')).toHaveLength(1);
  });

  it('never creates a second row for the same user across repeated calls', async () => {
    await getDefaultModelKey('user-1', 'tenant-1');
    await getDefaultModelKey('user-1', 'tenant-1');
    expect(rows.filter((r) => r.userId === 'user-1')).toHaveLength(1);
  });

  it('keeps two users on separate rows', async () => {
    await getDefaultModelKey('user-1', 'tenant-1');
    await getDefaultModelKey('user-2', 'tenant-1');
    expect(rows).toHaveLength(2);
  });
});

describe('setDefaultModelKey', () => {
  it('sets a value that getDefaultModelKey then returns', async () => {
    await setDefaultModelKey('user-1', 'tenant-1', 'conn-1:gpt-4o');
    expect(await getDefaultModelKey('user-1', 'tenant-1')).toBe('conn-1:gpt-4o');
  });

  it('clears back to null', async () => {
    await setDefaultModelKey('user-1', 'tenant-1', 'conn-1:gpt-4o');
    await setDefaultModelKey('user-1', 'tenant-1', null);
    expect(await getDefaultModelKey('user-1', 'tenant-1')).toBeNull();
  });

  it('never affects another user’s setting', async () => {
    await setDefaultModelKey('user-1', 'tenant-1', 'conn-1:gpt-4o');
    await setDefaultModelKey('user-2', 'tenant-1', 'local');
    expect(await getDefaultModelKey('user-1', 'tenant-1')).toBe('conn-1:gpt-4o');
    expect(await getDefaultModelKey('user-2', 'tenant-1')).toBe('local');
  });

  it('works even when called before any getDefaultModelKey call for that user', async () => {
    await setDefaultModelKey('user-1', 'tenant-1', 'local');
    expect(rows.filter((r) => r.userId === 'user-1')).toHaveLength(1);
    expect(await getDefaultModelKey('user-1', 'tenant-1')).toBe('local');
  });
});
