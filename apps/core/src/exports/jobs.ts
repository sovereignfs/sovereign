import { randomBytes } from 'node:crypto';
import type { Database } from '@sovereignfs/database';

export type ExportKind = 'instance' | 'person';
export type ExportState = 'pending' | 'running' | 'ready' | 'failed' | 'sent';
export type ExportArchive = 'tar.age' | 'zip' | 'tar';

export type ExportJob = {
  id: string;
  kind: ExportKind;
  sub: string | null;
  sessionId: string;
  state: ExportState;
  archive: ExportArchive;
  file: string | null;
  size: number | null;
  requestedAt: number;
  finishedAt: number | null;
  failure: string | null;
};

/** How long a ready export waits to be downloaded, and a failed one is shown (core-app §4.7.3). */
export const KEPT_MS = 60 * 60 * 1000;
/** How long one instance of core holds a job it is making before another may take it over. */
export const LEASE_MS = 10 * 60 * 1000;

export class ExportBusyError extends Error {
  override name = 'ExportBusyError';
}

function toJob(row: Record<string, unknown>): ExportJob {
  const number = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    id: String(row.id),
    kind: row.kind as ExportKind,
    sub: (row.sub as string | null) ?? null,
    sessionId: String(row.session_id),
    state: row.state as ExportState,
    archive: row.archive as ExportArchive,
    file: (row.file as string | null) ?? null,
    size: number(row.size),
    requestedAt: Number(row.requested_at),
    finishedAt: number(row.finished_at),
    failure: (row.failure as string | null) ?? null,
  };
}

const COLUMNS =
  'id, kind, sub, session_id, state, archive, file, size, requested_at, finished_at, failure';

/**
 * The exports being made and waiting (core-app §4.7.3): one at a time for the instance and one for each person, claimed with a
 * conditional update so that two instances of core never make one twice, downloaded once, and forgotten an hour after. It holds no file;
 * the caller removes the files a method says are done with.
 */
export class ExportJobs {
  readonly #database: Database;
  readonly #now: () => number;

  constructor(database: Database, now: () => number = Date.now) {
    this.#database = database;
    this.#now = now;
  }

  #owner(kind: ExportKind, sub: string | undefined): { sql: string; args: unknown[] } {
    return kind === 'instance'
      ? { sql: "kind = 'instance'", args: [] }
      : { sql: "kind = 'person' and sub = ?", args: [sub] };
  }

  /** The latest export of the instance, or of one person, whatever its state. */
  async latest(kind: ExportKind, sub?: string): Promise<ExportJob | undefined> {
    const owner = this.#owner(kind, sub);
    const { rows } = await this.#database.run(
      `select ${COLUMNS} from export_jobs where ${owner.sql} order by requested_at desc limit 1`,
      owner.args,
    );
    return rows[0] ? toJob(rows[0] as Record<string, unknown>) : undefined;
  }

  /**
   * Asks for a new export. Refused while one is being made; an earlier one that is ready or failed is replaced, and its file is returned
   * for the caller to remove.
   */
  async request(input: {
    kind: ExportKind;
    sub?: string;
    sessionId: string;
    archive: ExportArchive;
  }): Promise<{ job: ExportJob; replaced: string[] }> {
    const owner = this.#owner(input.kind, input.sub);
    return this.#database.transaction(async (tx) => {
      const { rows } = await tx.run(
        `select ${COLUMNS} from export_jobs where ${owner.sql}`,
        owner.args,
      );
      const existing = rows.map((row) => toJob(row as Record<string, unknown>));
      if (existing.some((job) => job.state === 'pending' || job.state === 'running')) {
        throw new ExportBusyError('An export is already being made.');
      }
      await tx.run(
        `delete from export_jobs where ${owner.sql} and state in ('ready', 'failed')`,
        owner.args,
      );
      const job: ExportJob = {
        id: randomBytes(16).toString('base64url'),
        kind: input.kind,
        sub: input.sub ?? null,
        sessionId: input.sessionId,
        state: 'pending',
        archive: input.archive,
        file: null,
        size: null,
        requestedAt: this.#now(),
        finishedAt: null,
        failure: null,
      };
      await tx.run(
        "insert into export_jobs (id, kind, sub, session_id, state, archive, requested_at) values (?, ?, ?, ?, 'pending', ?, ?)",
        [job.id, job.kind, job.sub, job.sessionId, job.archive, job.requestedAt],
      );
      return {
        job,
        replaced: existing
          .filter((old) => old.state !== 'sent' && old.file)
          .map((old) => old.file as string),
      };
    });
  }

  /** Takes the next export due: a pending one, or one whose maker stopped. Nothing when there is none or another took it. */
  async claim(): Promise<ExportJob | undefined> {
    const now = this.#now();
    const { rows } = await this.#database.run(
      `select ${COLUMNS} from export_jobs where state = 'pending' or (state = 'running' and lease_until < ?) order by requested_at limit 5`,
      [now],
    );
    for (const row of rows) {
      const job = toJob(row as Record<string, unknown>);
      const taken = await this.#database.run(
        "update export_jobs set state = 'running', lease_until = ? where id = ? and (state = 'pending' or (state = 'running' and lease_until < ?))",
        [now + LEASE_MS, job.id, now],
      );
      if (taken.rowsAffected === 1) return { ...job, state: 'running' };
    }
    return undefined;
  }

  /** Holds a job a while longer, for a maker still at work. */
  async renew(id: string): Promise<void> {
    await this.#database.run(
      "update export_jobs set lease_until = ? where id = ? and state = 'running'",
      [this.#now() + LEASE_MS, id],
    );
  }

  async finish(id: string, file: string, size: number): Promise<void> {
    await this.#database.run(
      "update export_jobs set state = 'ready', file = ?, size = ?, finished_at = ?, lease_until = null where id = ? and state = 'running'",
      [file, size, this.#now(), id],
    );
  }

  /** Records a failure by its kind, never by what was being written. */
  async fail(id: string, failure: string): Promise<void> {
    await this.#database.run(
      "update export_jobs set state = 'failed', failure = ?, finished_at = ?, lease_until = null where id = ? and state = 'running'",
      [failure.slice(0, 64), this.#now(), id],
    );
  }

  /**
   * Hands over a ready export once: to the session that asked for it, within the hour, for the owner it belongs to. Nothing for anyone
   * else, or a second time.
   */
  async take(input: {
    id: string;
    kind: ExportKind;
    sub?: string;
    sessionId: string;
  }): Promise<ExportJob | undefined> {
    const owner = this.#owner(input.kind, input.sub);
    const now = this.#now();
    const taken = await this.#database.run(
      `update export_jobs set state = 'sent' where id = ? and ${owner.sql} and session_id = ? and state = 'ready' and finished_at > ?`,
      [input.id, ...owner.args, input.sessionId, now - KEPT_MS],
    );
    if (taken.rowsAffected !== 1) return undefined;
    const { rows } = await this.#database.run(`select ${COLUMNS} from export_jobs where id = ?`, [
      input.id,
    ]);
    return rows[0] ? toJob(rows[0] as Record<string, unknown>) : undefined;
  }

  /** Forgets exports that were downloaded, or waited or failed past the hour; returns their files, for the caller to remove. */
  async purge(): Promise<string[]> {
    const cutoff = this.#now() - KEPT_MS;
    return this.#database.transaction(async (tx) => {
      const { rows } = await tx.run(
        "select file from export_jobs where file is not null and (state = 'sent' or (state in ('ready', 'failed') and finished_at < ?))",
        [cutoff],
      );
      await tx.run(
        "delete from export_jobs where state = 'sent' or (state in ('ready', 'failed') and finished_at < ?)",
        [cutoff],
      );
      return rows.map((row) => String((row as Record<string, unknown>).file));
    });
  }

  /** Forgets every export of a person, when their account is deleted; returns their files. */
  async forget(sub: string): Promise<string[]> {
    return this.#database.transaction(async (tx) => {
      const { rows } = await tx.run(
        "select file from export_jobs where kind = 'person' and sub = ? and file is not null",
        [sub],
      );
      await tx.run("delete from export_jobs where kind = 'person' and sub = ?", [sub]);
      return rows.map((row) => String((row as Record<string, unknown>).file));
    });
  }
}
