import { describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { ALL_CAPABILITIES, DEFAULT_MATRIX, can, type Capability } from '../roles/capabilities';
import { applyOverrides, MatrixStore, type Override } from '../roles/matrix';

const row = (role: string, capability: string, granted: boolean): Override => ({
  role,
  capability,
  granted,
});

describe('applyOverrides', () => {
  it('is the default when nothing is overridden, and not the same object', () => {
    const matrix = applyOverrides(DEFAULT_MATRIX, []);
    expect(matrix[ROLE_ADMIN]).toEqual(DEFAULT_MATRIX[ROLE_ADMIN]);
    expect(matrix[ROLE_USER]).toEqual(DEFAULT_MATRIX[ROLE_USER]);
    expect(matrix[ROLE_ADMIN]).not.toBe(DEFAULT_MATRIX[ROLE_ADMIN]);
  });

  it('gives and takes away, for each editable row on its own', () => {
    const matrix = applyOverrides(DEFAULT_MATRIX, [
      row(ROLE_USER, 'user:view', true),
      row(ROLE_ADMIN, 'client:manage', false),
    ]);
    expect(can(ROLE_USER, 'user:view', matrix)).toBe(true);
    expect(can(ROLE_ADMIN, 'user:view', matrix)).toBe(true);
    expect(can(ROLE_ADMIN, 'client:manage', matrix)).toBe(false);
    expect(can(ROLE_USER, 'client:manage', matrix)).toBe(false);
  });

  it('never changes the default it starts from', () => {
    const before = [...DEFAULT_MATRIX[ROLE_ADMIN]];
    applyOverrides(DEFAULT_MATRIX, [row(ROLE_ADMIN, 'user:manage', false)]);
    expect([...DEFAULT_MATRIX[ROLE_ADMIN]]).toEqual(before);
  });

  it.each(ALL_CAPABILITIES.filter((c) => !can(ROLE_ADMIN, c) && c.includes(':')))(
    'never gives an owner-only capability to another role, from a stored row: %s',
    (capability) => {
      const matrix = applyOverrides(DEFAULT_MATRIX, [
        row(ROLE_ADMIN, capability, true),
        row(ROLE_USER, capability, true),
      ]);
      const ownerOnly: Capability[] = [
        'instance:configure-secrets',
        'role:assign',
        'capability:configure',
        'ownership:transfer',
      ];
      if (ownerOnly.includes(capability)) {
        expect(matrix[ROLE_ADMIN].has(capability)).toBe(false);
        expect(matrix[ROLE_USER].has(capability)).toBe(false);
        expect(can(ROLE_ADMIN, capability, matrix)).toBe(false);
      }
    },
  );

  it('ignores a row for a role that cannot be edited, or does not exist, or a capability that does not', () => {
    const matrix = applyOverrides(DEFAULT_MATRIX, [
      row(ROLE_OWNER, 'user:manage', false),
      row('platform:superuser', 'user:manage', true),
      row('constructor', 'user:manage', true),
      row(ROLE_ADMIN, 'made:up', true),
      row(ROLE_ADMIN, 'constructor', true),
      row(ROLE_ADMIN, '__proto__', true),
    ]);
    expect(matrix[ROLE_ADMIN]).toEqual(DEFAULT_MATRIX[ROLE_ADMIN]);
    expect(matrix[ROLE_USER]).toEqual(DEFAULT_MATRIX[ROLE_USER]);
    expect(can(ROLE_OWNER, 'user:manage', matrix)).toBe(true);
  });

  it('lets a later row for the same cell win', () => {
    const matrix = applyOverrides(DEFAULT_MATRIX, [
      row(ROLE_USER, 'user:view', true),
      row(ROLE_USER, 'user:view', false),
    ]);
    expect(matrix[ROLE_USER].has('user:view')).toBe(false);
  });
});

describe('the matrix store', () => {
  const matrixOf = (admin: Capability[]) => ({
    [ROLE_ADMIN]: new Set(admin),
    [ROLE_USER]: new Set<Capability>(),
  });

  it('reads once and answers from memory until the time is up', async () => {
    let now = 0;
    const load = vi.fn(() => Promise.resolve(matrixOf(['user:view'])));
    const store = new MatrixStore({ load, cacheMs: 5000, now: () => now });
    await store.get();
    now = 4999;
    await store.get();
    expect(load).toHaveBeenCalledTimes(1);
    now = 5000;
    await store.get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shows a change made elsewhere after the cache time, far inside the 300 seconds the spec allows', async () => {
    let now = 0;
    let admin: Capability[] = ['user:manage'];
    const store = new MatrixStore({
      load: () => Promise.resolve(matrixOf(admin)),
      now: () => now,
    });
    expect((await store.get())[ROLE_ADMIN].has('user:manage')).toBe(true);
    admin = [];
    now = 299_000;
    expect((await store.get())[ROLE_ADMIN].has('user:manage')).toBe(false);
  });

  it('forgets at once when told, so a change made here shows on the next check', async () => {
    let admin: Capability[] = ['user:manage'];
    const store = new MatrixStore({ load: () => Promise.resolve(matrixOf(admin)), now: () => 0 });
    await store.get();
    admin = [];
    expect((await store.get())[ROLE_ADMIN].has('user:manage')).toBe(true);
    store.invalidate();
    expect((await store.get())[ROLE_ADMIN].has('user:manage')).toBe(false);
  });

  it('does not let a read that began before a change put the old matrix back', async () => {
    let release: (() => void) | undefined;
    let admin: Capability[] = ['user:manage'];
    const load = vi
      .fn<() => Promise<ReturnType<typeof matrixOf>>>()
      .mockImplementationOnce(async () => {
        const old = matrixOf(admin);
        await new Promise<void>((resolve) => (release = resolve));
        return old;
      })
      .mockImplementation(() => Promise.resolve(matrixOf(admin)));
    const store = new MatrixStore({ load, now: () => 0 });
    const slow = store.get();
    admin = [];
    store.invalidate();
    release?.();
    await slow;
    expect((await store.get())[ROLE_ADMIN].has('user:manage')).toBe(false);
  });

  it('does not remember a failed read', async () => {
    const load = vi
      .fn<() => Promise<ReturnType<typeof matrixOf>>>()
      .mockRejectedValueOnce(new Error('database is down'))
      .mockResolvedValue(matrixOf([]));
    const store = new MatrixStore({ load, now: () => 0 });
    await expect(store.get()).rejects.toThrow('database is down');
    await expect(store.get()).resolves.toBeDefined();
  });
});
