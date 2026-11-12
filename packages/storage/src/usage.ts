import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** How much a person keeps: bytes, files, and when that was last counted from the files themselves. */
export type Usage = { bytes: number; files: number; countedAt: number };

/** A record older than this is counted again from the files, which mends any drift (a crash between a write and its record). */
export const RECOUNT_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Where a person's usage is kept, and how a change to it is made one at a time (RFC 0004 §2). `update` runs `change` with the usage as it
 * is, and keeps what `change` returns, with no other update for that person in between, so two uploads at once cannot both see room
 * that is there for one.
 *
 * The default keeps a file beside the person's files and orders updates within one process. An app that runs more than one process
 * passes a store backed by its database instead.
 */
export interface UsageStore {
  update<T>(
    sub: string,
    recount: () => Promise<Usage>,
    change: (usage: Usage) => { usage: Usage; result: T },
  ): Promise<T>;
}

/** The default store: `.usage.json` in the person's folder, and a queue per person in this process. */
export class FileUsageStore implements UsageStore {
  readonly #fileOf: (sub: string) => string;
  readonly #now: () => number;
  readonly #queues = new Map<string, Promise<unknown>>();

  constructor(fileOf: (sub: string) => string, now: () => number = Date.now) {
    this.#fileOf = fileOf;
    this.#now = now;
  }

  async update<T>(
    sub: string,
    recount: () => Promise<Usage>,
    change: (usage: Usage) => { usage: Usage; result: T },
  ): Promise<T> {
    const before = this.#queues.get(sub) ?? Promise.resolve();
    const run = before
      .catch(() => undefined)
      .then(async () => {
        let usage = await this.#read(sub);
        if (!usage || this.#now() - usage.countedAt > RECOUNT_AFTER_MS) usage = await recount();
        const done = change(usage);
        await this.#write(sub, done.usage);
        return done.result;
      });
    const settled = run.catch(() => undefined);
    this.#queues.set(sub, settled);
    void settled.then(() => {
      if (this.#queues.get(sub) === settled) this.#queues.delete(sub);
    });
    return run;
  }

  async #read(sub: string): Promise<Usage | undefined> {
    try {
      const value = JSON.parse(await readFile(this.#fileOf(sub), 'utf8')) as Partial<Usage>;
      const ok = (n: unknown): n is number =>
        typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
      return ok(value.bytes) && ok(value.files) && ok(value.countedAt)
        ? { bytes: value.bytes, files: value.files, countedAt: value.countedAt }
        : undefined;
    } catch {
      return undefined;
    }
  }

  async #write(sub: string, usage: Usage): Promise<void> {
    const file = this.#fileOf(sub);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(usage)}\n`, { mode: 0o600 });
    await rename(temporary, file);
  }
}
