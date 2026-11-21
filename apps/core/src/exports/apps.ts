import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Database } from '@sovereignfs/database';
import {
  ExportError,
  readExport,
  type ExportWriter,
  type MissingReason,
} from '@sovereignfs/export';
import { parseMetadata } from '../oauth/client-metadata';
import { NAMES } from '../oauth/schema-names';

export const EXPORT_REQUESTED_EVENT = 'urn:sovereignfs:event:export-requested';
/** How long an app is given to answer, and how much it may send (core-app §4.7.2). */
export const APP_TIMEOUT_MS = 5 * 60 * 1000;
export const APP_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export type AppPartsDeps = {
  database: Database;
  /** Signs the export request for one app and one person (`export-request+jwt`). */
  sign: (clientId: string, sub: string) => Promise<string>;
  /** Where an app's answer is held while it is checked: the exports' folder. */
  spoolDirectory: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  log?: (line: string) => void;
};

type UsedApp = {
  clientId: string;
  name: string;
  address: string | undefined;
  key: string | undefined;
};

const SLUG = /^[a-z][a-z0-9-]*$/;

/** The apps a person has used, in core-app §4.5's sense, with their export address and the name core files their part under. */
async function usedApps(database: Database, sub: string): Promise<UsedApp[]> {
  const used = await database.run(
    `select ${NAMES.consent.clientId} as client_id from ${NAMES.consents} where ${NAMES.consent.userId} = ?
     union select ${NAMES.access.clientId} from ${NAMES.accessTokens} where ${NAMES.access.userId} = ?
     union select ${NAMES.refresh.clientId} from ${NAMES.refreshTokens} where ${NAMES.refresh.userId} = ?
     union select client_id from token_revocations where user_id = ? and client_id <> ''`,
    [sub, sub, sub, sub],
  );
  const apps: UsedApp[] = [];
  for (const row of used.rows) {
    const clientId = String(row.client_id);
    const client = (
      await database.run(
        `select ${NAMES.client.metadata} as metadata, name from ${NAMES.clients} where ${NAMES.client.clientId} = ?`,
        [clientId],
      )
    ).rows[0];
    if (!client) continue;
    const managed = (
      await database.run('select key from managed_clients where client_id = ?', [clientId])
    ).rows[0];
    const address = parseMetadata(client.metadata).exportUri;
    apps.push({
      clientId,
      name: String(client.name ?? clientId),
      address: typeof address === 'string' && address !== '' ? address : undefined,
      key: managed ? String(managed.key) : undefined,
    });
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

/** The folder an app's part goes under: the name the toolkit manages it by, or one made from its name, never two alike. */
export function folderFor(
  app: { name: string; key: string | undefined; clientId: string },
  taken: Set<string>,
): string {
  const fromKey = app.key?.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const fromName = app.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let base =
    [fromKey, fromName, 'app'].find((value) => value !== undefined && SLUG.test(value)) ?? 'app';
  base = base.slice(0, 48);
  let name = base;
  for (let n = 2; taken.has(name) || name === 'core'; n += 1) name = `${base}-${n}`;
  taken.add(name);
  return name;
}

class Missing extends Error {
  constructor(readonly reason: MissingReason) {
    super(reason);
  }
}

/** Asks one app for its part and holds the answer on disk, refusing more than allowed; returns the file. */
async function fetchPart(
  app: UsedApp & { address: string },
  sub: string,
  deps: AppPartsDeps,
  folder: string,
): Promise<string> {
  const token = await deps.sign(app.clientId, sub);
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(app.address, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/x-tar' },
      body: new URLSearchParams({ export_request_token: token }).toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(deps.timeoutMs ?? APP_TIMEOUT_MS),
    });
  } catch {
    throw new Missing('unreachable');
  }
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Missing('refused');
  }
  const max = deps.maxBytes ?? APP_MAX_BYTES;
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > max) {
    await response.body.cancel().catch(() => undefined);
    throw new Missing('too_large');
  }
  const file = path.join(folder, 'answer.tar');
  let size = 0;
  try {
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          size += chunk.byteLength;
          if (size > max) throw new Missing('too_large');
          yield chunk;
        }
      },
      createWriteStream(file, { mode: 0o600, flags: 'wx' }),
    );
  } catch (error) {
    if (error instanceof Missing) throw error;
    throw new Missing('unreachable');
  }
  return file;
}

/**
 * Adds each app's part to a person's export (core-app §4.7.2): asks each app they used that has an export address, one after another,
 * holds its answer on disk, checks it whole (the format, and that it is this person's from this app's own folder), and only then places
 * it under `apps/<name>/`. An app that cannot be asked, does not answer, or answers wrongly is listed as missing, with why.
 */
export async function addAppParts(
  writer: ExportWriter,
  sub: string,
  deps: AppPartsDeps,
): Promise<void> {
  const taken = new Set<string>();
  for (const app of await usedApps(deps.database, sub)) {
    const name = folderFor(app, taken);
    if (!app.address) {
      writer.addPart({ name, status: 'missing', reason: 'not_supported' });
      continue;
    }
    const folder = await mkdtemp(path.join(deps.spoolDirectory, 'app-part-'));
    try {
      const file = await fetchPart({ ...app, address: app.address }, sub, deps, folder);
      let read;
      try {
        read = await readExport(
          Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
        );
      } catch (error) {
        if (error instanceof ExportError) throw new Missing('invalid');
        throw error;
      }
      const own = read.head.app ? `apps/${read.head.app}/` : undefined;
      if (
        read.head.kind !== 'person' ||
        read.head.sub !== sub ||
        !own ||
        read.contents.files.some((entry) => !entry.path.startsWith(own))
      ) {
        throw new Missing('invalid');
      }
      const records = new Map(read.contents.records.map((entry) => [entry.path, entry]));
      await readExport(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, {
        onFile: async ({ path: inside, size, body }) => {
          const placed = `apps/${name}/${inside.slice(own.length)}`;
          const listed = records.get(inside);
          await writer.addFile(
            placed,
            body,
            size,
            listed
              ? { kind: listed.kind, count: listed.count, endToEnd: listed.endToEnd }
              : undefined,
          );
        },
      });
      writer.addPart({ name, status: 'complete', version: read.head.producer.version });
    } catch (error) {
      if (!(error instanceof Missing)) throw error;
      deps.log?.(`An app's part of an export is missing (${app.name}: ${error.reason}).`);
      writer.addPart({ name, status: 'missing', reason: error.reason });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
}
