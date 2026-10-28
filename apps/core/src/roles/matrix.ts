import type { Executor } from '@sovereignfs/database';
import { getDatabase } from '../database';
import { ROLE_ADMIN, ROLE_USER } from '../auth/roles';
import { CAPABILITIES, DEFAULT_MATRIX, type Capability, type Matrix } from './capabilities';

/** One stored difference from the default matrix. */
export type Override = { role: string; capability: string; granted: boolean };

/**
 * The matrix in force: the default in code with the owner's saved differences applied (core-app
 * §3.2.3). Only the admin and user rows can differ, and only for capabilities that exist and are not
 * owner-only; a stored row that says anything else is ignored, so a mistaken or tampered table cannot
 * hand an owner-only capability to another role. It never changes the default it starts from.
 */
export function applyOverrides(defaults: Matrix, overrides: readonly Override[]): Matrix {
  const admin = new Set(defaults[ROLE_ADMIN]);
  const user = new Set(defaults[ROLE_USER]);
  const rows = { [ROLE_ADMIN]: admin, [ROLE_USER]: user } as Record<string, Set<Capability>>;
  for (const { role, capability, granted } of overrides) {
    const row = Object.hasOwn(rows, role) ? rows[role] : undefined;
    if (!row || !Object.hasOwn(CAPABILITIES, capability)) continue;
    const known = capability as Capability;
    if (CAPABILITIES[known].ownerOnly) continue;
    if (granted) row.add(known);
    else row.delete(known);
  }
  return { [ROLE_ADMIN]: admin, [ROLE_USER]: user };
}

/** The owner's saved differences, oldest rows first so the result does not depend on read order. */
export async function readOverrides(database: Executor): Promise<Override[]> {
  const { rows } = await database.run(
    'select role, capability, granted from capability_overrides order by role, capability',
  );
  return rows.map((row) => ({
    role: String(row.role),
    capability: String(row.capability),
    granted: Number(row.granted) === 1,
  }));
}

/** The matrix in force, read from the database. */
export async function loadMatrix(database: Executor): Promise<Matrix> {
  return applyOverrides(DEFAULT_MATRIX, await readOverrides(database));
}

/**
 * Keeps the matrix for a few seconds so a check is not a query, and forgets it at once when this
 * instance changes it. Another instance's change shows within `cacheMs`, which is far inside the session
 * cookie's lifetime that §3.2.3 allows, and no check reads the cookie: a role and the matrix are read
 * from the database for what core guards, so there is no per-session version to carry.
 */
export class MatrixStore {
  readonly #load: () => Promise<Matrix>;
  readonly #cacheMs: number;
  readonly #now: () => number;
  #cached: { at: number; matrix: Matrix } | undefined;
  /** Bumped by every change, so a read that began before it cannot put the old matrix back. */
  #generation = 0;

  constructor(options: { load: () => Promise<Matrix>; cacheMs?: number; now?: () => number }) {
    this.#load = options.load;
    this.#cacheMs = options.cacheMs ?? 5000;
    this.#now = options.now ?? (() => Date.now());
  }

  async get(): Promise<Matrix> {
    const cached = this.#cached;
    if (cached && this.#now() - cached.at < this.#cacheMs) return cached.matrix;
    const generation = this.#generation;
    const matrix = await this.#load();
    if (generation === this.#generation) this.#cached = { at: this.#now(), matrix };
    return matrix;
  }

  invalidate(): void {
    this.#generation += 1;
    this.#cached = undefined;
  }
}

const store = new MatrixStore({ load: async () => loadMatrix(await getDatabase()) });

/** The capability matrix in force. Every check asks for it (`requireCapability`). */
export function getCapabilityMatrix(): Promise<Matrix> {
  return store.get();
}

/** Forget what was read, so the next check reads the database: called after this instance changes the matrix. */
export function invalidateCapabilityMatrix(): void {
  store.invalidate();
}
