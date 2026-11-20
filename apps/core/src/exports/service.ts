import corePackage from '../../package.json' with { type: 'json' };
import { getAuthSettings } from '../auth/settings';
import { getDatabase } from '../database';
import { coreFilesRoot } from '../files';
import { readInstanceId } from '../instance/instance-id';
import { getSettings } from '../settings';
import { SETTINGS } from '../settings/definitions';
import { getAuth } from '../auth';
import { signNoticeToken } from '../accounts/deletion-delivery';
import { addAppParts, EXPORT_REQUESTED_EVENT } from './apps';
import { ExportJobs, ExportRunner } from '@sovereignfs/export';
import { exportsFolder, makeExport, removeExportFiles, type MakeContext } from './make';

/** Core keeps its jobs in `export_jobs`, made by its own migrations (core-app §4.7.3). */
export const CORE_EXPORT_JOBS_TABLE = 'export_jobs';

export async function getExportJobs(): Promise<ExportJobs> {
  return new ExportJobs(await getDatabase(), { table: CORE_EXPORT_JOBS_TABLE });
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
    appParts: async (writer, sub) =>
      addAppParts(writer, sub, {
        database,
        spoolDirectory: exportsFolder(coreFilesRoot()),
        sign: async (clientId, who) =>
          signNoticeToken(await getAuth(), {
            clientId,
            sub: who,
            typ: 'export-request+jwt',
            event: EXPORT_REQUESTED_EVENT,
          }),
        log: (line) => console.warn(line),
      }),
  };
}

/** Removes a person's files and their exports, once their account is deleted (core-app §4.6, §4.7.3). */
export async function removePersonData(
  sub: string,
  removeFiles: (sub: string) => Promise<unknown>,
): Promise<void> {
  await removeFiles(sub);
  await removeExportFiles(coreFilesRoot(), await (await getExportJobs()).forget(sub));
}

let runner: Promise<ExportRunner> | undefined;

function getRunner(): Promise<ExportRunner> {
  runner ??= (async () =>
    new ExportRunner({
      jobs: await getExportJobs(),
      folder: exportsFolder(coreFilesRoot()),
      make: async (job) => makeExport(job, await context()),
      log: (line) => console.warn(line),
    }))().catch((error: unknown) => {
    runner = undefined;
    throw error;
  });
  return runner;
}

/** Makes what is due now, and forgets what is done with. Says nothing of what an export held. */
export async function runDueExports(): Promise<void> {
  try {
    await (await getRunner()).runDue();
  } catch (error) {
    console.warn(`Making exports failed: ${error instanceof Error ? error.name : 'unknown error'}`);
  }
}

/** Starts making exports when core starts: what was asked for before it stopped is made again from the start. Safe to call twice. */
export function startExports(): void {
  void getRunner().then(
    (made) => made.start(),
    () => undefined,
  );
}
