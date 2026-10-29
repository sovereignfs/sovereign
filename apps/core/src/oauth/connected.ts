import type { Database } from '@sovereignfs/database';
import { SCOPE_COPY } from './consent';
import { NAMES } from './schema-names';

/** An app a person has allowed (core-app §3.11), as their Connected apps page shows it. */
export type ConnectedApp = {
  clientId: string;
  name: string;
  /** One plain sentence for each thing they allowed that is worth saying (the same words consent used). */
  permissions: string[];
  /** When they allowed it, in milliseconds since the epoch. */
  since: number | undefined;
};

/**
 * The scopes as the database kept them: a JSON list as text on SQLite and sqld (which the provider writes as
 * JSON text inside JSON text, so it is read through up to two layers), an array on PostgreSQL, and, if it
 * is ever plain text, words.
 */
function scopesOf(value: unknown): string[] {
  let list: unknown = value;
  for (let layer = 0; layer < 2 && typeof list === 'string'; layer++) {
    try {
      list = JSON.parse(list);
    } catch {
      break;
    }
  }
  if (typeof list === 'string') list = list.split(/\s+/);
  return Array.isArray(list) ? list.map(String).filter((scope) => scope !== '') : [];
}

const millis = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const time = new Date(value as string | number | Date).getTime();
  return Number.isFinite(time) ? time : undefined;
};

/**
 * The apps a person has agreed to share their account with, with what they agreed to, newest agreement first
 * within name order. It is read for one account only, whatever is asked: the caller names the account, and
 * nothing here takes it from a request. An app people are not asked about (one an operator trusts) holds no
 * consent and is not listed: there is nothing the person agreed to.
 */
export async function listConnectedApps(
  database: Database,
  userId: string,
): Promise<ConnectedApp[]> {
  const { rows } = await database.run(
    `select c.${NAMES.consent.clientId} as client_id, c.scopes as scopes, c.created_at as created_at,
            o.name as name
       from ${NAMES.consents} c
       join ${NAMES.clients} o on o.${NAMES.client.clientId} = c.${NAMES.consent.clientId}
      where c.${NAMES.consent.userId} = ?`,
    [userId],
  );
  // One row for each (account, app, set of scopes): an app asked for more later has two. They are one app.
  const byApp = new Map<string, ConnectedApp & { scopes: Set<string> }>();
  for (const row of rows) {
    const clientId = String(row.client_id);
    const found = byApp.get(clientId) ?? {
      clientId,
      name: row.name === null || row.name === undefined ? 'An app' : String(row.name),
      permissions: [],
      since: undefined,
      scopes: new Set<string>(),
    };
    for (const scope of scopesOf(row.scopes)) found.scopes.add(scope);
    const at = millis(row.created_at);
    if (at !== undefined && (found.since === undefined || at < found.since)) found.since = at;
    byApp.set(clientId, found);
  }
  return [...byApp.values()]
    .map(({ scopes, ...app }) => ({
      ...app,
      permissions: [...scopes].flatMap((scope) => {
        const copy = SCOPE_COPY[scope];
        return copy ? [copy] : [];
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.clientId.localeCompare(b.clientId));
}
