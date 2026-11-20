import { ExportBusyError, type ExportJob, type ExportJobs } from './jobs.js';
import { removeExportFiles } from './files.js';

export { ExportBusyError };

/** A failure whose kind may be recorded and shown; anything else is recorded as `error`. Never what was being written. */
export class ExportFailure extends Error {
  override name = 'ExportFailure';
  constructor(readonly kind: string) {
    super(kind);
  }
}

export interface ExportRunnerOptions {
  jobs: ExportJobs;
  /** Where exports wait to be downloaded: one folder every process of the app shares. */
  folder: string;
  /** Makes one export into `folder`, and returns its file's name and size. */
  make: (job: ExportJob) => Promise<{ file: string; size: number }>;
  log?: (line: string) => void;
  /** How often to look for work. Default a minute. */
  everyMs?: number;
}

/**
 * Makes the exports that are due, one after another, and forgets the ones done with (core-app §4.7.3): what was asked for before a
 * process stopped is made again from the start, and a job held by a process that stopped is taken over once its lease has run out.
 */
export class ExportRunner {
  readonly #o: ExportRunnerOptions;
  #running: Promise<void> | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: ExportRunnerOptions) {
    this.#o = options;
  }

  /** Makes what is due now. Calls made while it runs share the one run. */
  runDue(): Promise<void> {
    this.#running ??= this.#run().finally(() => {
      this.#running = undefined;
    });
    return this.#running;
  }

  async #run(): Promise<void> {
    const { jobs, folder, make, log } = this.#o;
    try {
      await removeExportFiles(folder, await jobs.purge());
      for (;;) {
        const job = await jobs.claim();
        if (!job) return;
        const renew = setInterval(() => void jobs.renew(job.id).catch(() => undefined), 60_000);
        renew.unref?.();
        try {
          const made = await make(job);
          await jobs.finish(job.id, made.file, made.size);
        } catch (error) {
          const kind = error instanceof ExportFailure ? error.kind : 'error';
          log?.(`An export failed (${kind}).`);
          await jobs.fail(job.id, kind);
        } finally {
          clearInterval(renew);
        }
      }
    } catch (error) {
      log?.(`Making exports failed: ${error instanceof Error ? error.name : 'unknown error'}`);
    }
  }

  /** Looks for work now and then every minute, for the life of the process. Safe to call twice. */
  start(): void {
    if (this.#timer) return;
    void this.runDue();
    this.#timer = setInterval(() => void this.runDue(), this.#o.everyMs ?? 60_000);
    this.#timer.unref?.();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
