import corePackage from '../../package.json' with { type: 'json' };
import { getAuthSettings } from '../auth/settings';
import { getDatabase } from '../database';
import { coreFilesRoot } from '../files';
import { readInstanceId } from '../instance/instance-id';
import { getSettings } from '../settings';
import { SETTINGS } from '../settings/definitions';
import { ExportJobs } from './jobs';
import { ExportFailure, makeExport, removeExportFiles, type MakeContext } from './make';

const EVERY_MS = 60_000;

export async function getExportJobs(): Promise<ExportJobs> {
  return new ExportJobs(await getDatabase());
}

let appParts: MakeContext['appParts'];
/** Set by the apps' requests (17.6's), so this module needs nothing of them. */
export function setAppParts(fill: MakeContext['appParts']): void {
  appParts = fill;
}

async function context(): Promise<MakeContext> {
  const database = await getDatabase();
  const settings = await getSettings();
  return {
    database,
    storageRoot: coreFilesRoot(),
    instance: { id: (await readInstanceId(database)) ?? 'unknown', url: getAuthSettings().baseUrl },
    coreVersion: corePackage.version,
    recipients: async () => {
      const line = await settings.value(SETTINGS.exportRecipients);
      return line ? line.split(' ') : [];
    },
    appParts,
  };
}

let running: Promise<void> | undefined;

/** Makes what is due, one export after another, and forgets what is done with. Says nothing of what an export held. */
export function runDueExports(): Promise<void> {
  running ??= (async () => {
    try {
      const jobs = await getExportJobs();
      const made = await context();
      await removeExportFiles(made.storageRoot, await jobs.purge());
      for (;;) {
        const job = await jobs.claim();
        if (!job) break;
        const renew = setInterval(() => void jobs.renew(job.id).catch(() => undefined), 60_000);
        renew.unref();
        try {
          const { file, size } = await makeExport(job, made);
          await jobs.finish(job.id, file, size);
        } catch (error) {
          const kind = error instanceof ExportFailure ? error.kind : 'error';
          console.warn(`An export failed (${kind}).`);
          await jobs.fail(job.id, kind);
        } finally {
          clearInterval(renew);
        }
      }
    } catch (error) {
      console.warn(
        `Making exports failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
    } finally {
      running = undefined;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Starts making exports when core starts: what was asked for before it stopped is made again from the start. Safe to call twice. */
export function startExports(): void {
  if (timer) return;
  void runDueExports();
  timer = setInterval(() => void runDueExports(), EVERY_MS);
  timer.unref();
}
