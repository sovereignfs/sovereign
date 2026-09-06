import type { Table } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Same fake-Drizzle approach as `conversations.test.ts` — no real SQLite
 * (this workspace blocks plain `better-sqlite3`'s build script). `and()` is
 * new here (not needed by `conversations.ts`): every query in
 * `model-visibility.ts` filters on all three of tenant/user/modelKey at
 * once, so the fake combines predicates into an array and matches all of
 * them rather than mocking `and()` as a no-op.
 */
interface Predicate {
  columnName: string;
  value?: unknown;
  /** `inArray` — matches any of these. */
  values?: unknown[];
}

interface OverrideRow {
  id: string;
  tenantId: string;
  userId: string;
  modelKey: string;
  createdAt: number;
}

let rows: OverrideRow[] = [];
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
    and: (...predicates: Predicate[]): Predicate[] => predicates,
    inArray: (column: { name: string }, values: unknown[]): Predicate => ({
      columnName: toCamelCase(column.name),
      values,
    }),
  };
});

function matches(row: OverrideRow, predicates: Predicate[]): boolean {
  return predicates.every((p) => {
    const actual = (row as Record<string, unknown>)[p.columnName];
    return p.values ? p.values.includes(actual) : actual === p.value;
  });
}

const fakeDb = {
  select(shape?: Record<string, unknown>) {
    return {
      from(_table: Table) {
        return {
          where(predicates: Predicate[]) {
            const filtered = rows.filter((r) => matches(r, predicates));
            const projected = shape
              ? filtered.map((r) =>
                  Object.fromEntries(
                    Object.keys(shape).map((k) => [k, (r as Record<string, unknown>)[k]]),
                  ),
                )
              : filtered;
            return {
              limit: async (n: number) => projected.slice(0, n),
              then: (resolve: (v: unknown) => void) => resolve(projected),
            };
          },
        };
      },
    };
  },
  insert(_table: Table) {
    return {
      values: async (row: OverrideRow | OverrideRow[]) => {
        rows.push(...(Array.isArray(row) ? row : [row]));
      },
    };
  },
  delete(_table: Table) {
    return {
      where: async (predicates: Predicate[]) => {
        rows = rows.filter((r) => !matches(r, predicates));
      },
    };
  },
};

vi.mock('@sovereignfs/sdk', () => ({
  sdk: { db: { getClient: vi.fn(async () => fakeDb) } },
}));

const {
  isModelVisible,
  isVisibleByDefault,
  listVisibilityOverrides,
  setModelVisibility,
  setModelVisibilityMany,
} = await import('../model-visibility');

beforeEach(() => {
  rows = [];
  nextId = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isVisibleByDefault', () => {
  it('is true only for the local model', () => {
    expect(isVisibleByDefault('local')).toBe(true);
    expect(isVisibleByDefault('conn-1:gpt-4o')).toBe(false);
  });
});

describe('isModelVisible', () => {
  it('the local model is visible with no override', () => {
    expect(isModelVisible('local', new Set())).toBe(true);
  });

  it('a provider model is hidden with no override', () => {
    expect(isModelVisible('conn-1:gpt-4o', new Set())).toBe(false);
  });

  it('an override flips the local model to hidden', () => {
    expect(isModelVisible('local', new Set(['local']))).toBe(false);
  });

  it('an override flips a provider model to visible', () => {
    expect(isModelVisible('conn-1:gpt-4o', new Set(['conn-1:gpt-4o']))).toBe(true);
  });
});

describe('setModelVisibility', () => {
  it('setting a provider model visible (away from its hidden default) stores an override', async () => {
    await setModelVisibility('user-1', 'tenant-1', 'conn-1:gpt-4o', true);
    const overrides = await listVisibilityOverrides('user-1', 'tenant-1');
    expect(overrides).toEqual(new Set(['conn-1:gpt-4o']));
  });

  it('setting a provider model hidden (matching its default) stores no override', async () => {
    await setModelVisibility('user-1', 'tenant-1', 'conn-1:gpt-4o', false);
    expect(await listVisibilityOverrides('user-1', 'tenant-1')).toEqual(new Set());
  });

  it('setting local hidden (away from its visible default) stores an override', async () => {
    await setModelVisibility('user-1', 'tenant-1', 'local', false);
    expect(await listVisibilityOverrides('user-1', 'tenant-1')).toEqual(new Set(['local']));
  });

  it('setting local visible (matching its default) stores no override', async () => {
    await setModelVisibility('user-1', 'tenant-1', 'local', true);
    expect(await listVisibilityOverrides('user-1', 'tenant-1')).toEqual(new Set());
  });

  it('toggling back to the default removes a previously stored override', async () => {
    await setModelVisibility('user-1', 'tenant-1', 'conn-1:gpt-4o', true);
    expect(rows).toHaveLength(1);
    await setModelVisibility('user-1', 'tenant-1', 'conn-1:gpt-4o', false);
    expect(rows).toHaveLength(0);
  });

  it('is idempotent — setting the same non-default value twice does not duplicate the row', async () => {
    await setModelVisibility('user-1', 'tenant-1', 'conn-1:gpt-4o', true);
    await setModelVisibility('user-1', 'tenant-1', 'conn-1:gpt-4o', true);
    expect(rows.filter((r) => r.modelKey === 'conn-1:gpt-4o')).toHaveLength(1);
  });

  it("does not affect another user's override for the same model key", async () => {
    await setModelVisibility('user-1', 'tenant-1', 'conn-1:gpt-4o', true);
    await setModelVisibility('user-2', 'tenant-1', 'conn-1:gpt-4o', true);
    await setModelVisibility('user-1', 'tenant-1', 'conn-1:gpt-4o', false);
    expect(await listVisibilityOverrides('user-1', 'tenant-1')).toEqual(new Set());
    expect(await listVisibilityOverrides('user-2', 'tenant-1')).toEqual(new Set(['conn-1:gpt-4o']));
  });
});

describe('setModelVisibilityMany', () => {
  it('shows a provider group with one bulk insert, skipping keys already shown', async () => {
    await setModelVisibility('user-1', 'tenant-1', 'conn-1:a', true);
    await setModelVisibilityMany('user-1', 'tenant-1', ['conn-1:a', 'conn-1:b', 'conn-1:c'], true);
    const overrides = await listVisibilityOverrides('user-1', 'tenant-1');
    expect([...overrides].sort()).toEqual(['conn-1:a', 'conn-1:b', 'conn-1:c']);
    // Still exceptions-only: exactly one row per shown provider model.
    expect(rows).toHaveLength(3);
  });

  it('hides a provider group by deleting its override rows, leaving other providers alone', async () => {
    await setModelVisibilityMany('user-1', 'tenant-1', ['conn-1:a', 'conn-1:b', 'conn-2:z'], true);
    await setModelVisibilityMany('user-1', 'tenant-1', ['conn-1:a', 'conn-1:b'], false);
    const overrides = await listVisibilityOverrides('user-1', 'tenant-1');
    expect([...overrides]).toEqual(['conn-2:z']);
  });

  it('treats the local model by its own default: hiding it inserts, showing it deletes', async () => {
    await setModelVisibilityMany('user-1', 'tenant-1', ['local'], false);
    expect(isModelVisible('local', await listVisibilityOverrides('user-1', 'tenant-1'))).toBe(
      false,
    );
    await setModelVisibilityMany('user-1', 'tenant-1', ['local'], true);
    expect(rows).toHaveLength(0);
  });
});
