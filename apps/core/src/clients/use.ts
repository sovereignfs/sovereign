import type { Database } from '@sovereignfs/database';
import { NAMES } from '../oauth/schema-names';
import { storedList } from '../oauth/stored-list';

/**
 * What the services an app uses for itself (notifications, email, activity) ask about an app and a person, in one place so that
 * they ask it the same way: where an app's links may go, and whether a person has used it.
 */

/** An app's name and the origins it has registered: where a link of its may go (core-app §3.7.1). Undefined when there is no such app. */
export async function appOrigins(
  database: Database,
  clientId: string,
): Promise<{ name: string; origins: string[] } | undefined> {
  const { rows } = await database.run(
    `select name, ${NAMES.client.redirectUris} as redirect_uris, ${NAMES.client.metadata} as metadata from ${NAMES.clients} where ${NAMES.client.clientId} = ?`,
    [clientId],
  );
  const row = rows[0];
  if (!row) return undefined;
  const addresses = storedList(row.redirect_uris);
  let metadata: unknown = row.metadata;
  for (let step = 0; step < 3 && typeof metadata === 'string'; step += 1) {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = undefined;
    }
  }
  const launchUrl = (metadata as { launcher?: { launchUrl?: unknown } } | undefined)?.launcher
    ?.launchUrl;
  if (typeof launchUrl === 'string') addresses.push(launchUrl);
  const origins = new Set<string>();
  for (const address of addresses) {
    try {
      origins.add(new URL(address).origin);
    } catch {
      // Not an address; it names no origin.
    }
  }
  return {
    name: row.name === null || row.name === undefined ? 'An app' : String(row.name),
    origins: [...origins],
  };
}

/**
 * Why a link an app gave cannot be used, or undefined when it can: an `https` address (or `http` on localhost on a development
 * instance) with no user name or password, on an origin of the app's own addresses.
 */
export function linkProblem(
  value: unknown,
  origins: readonly string[],
  development: boolean,
): string | undefined {
  if (typeof value !== 'string' || value === '' || value.length > 2048) return 'must be an address';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'must be an address';
  }
  if (url.username !== '' || url.password !== '') return 'must not contain a user name or password';
  const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost');
  if (url.protocol !== 'https:' && !(development && local && url.protocol === 'http:')) {
    return 'must be https';
  }
  if (!origins.includes(url.origin)) return "must be on one of the app's own addresses";
  return undefined;
}

/** A person has used an app when they agreed to it, or hold tokens it was given that are not revoked. */
export async function hasUsed(
  database: Database,
  userId: string,
  clientId: string,
): Promise<boolean> {
  const found = async (sql: string) =>
    (await database.run(sql, [userId, clientId])).rows.length > 0;
  return (
    (await found(
      `select 1 from ${NAMES.consents} where ${NAMES.consent.userId} = ? and ${NAMES.consent.clientId} = ? limit 1`,
    )) ||
    (await found(
      `select 1 from ${NAMES.refreshTokens} where ${NAMES.refresh.userId} = ? and ${NAMES.refresh.clientId} = ? and ${NAMES.refresh.revoked} is null limit 1`,
    )) ||
    (await found(
      `select 1 from ${NAMES.accessTokens} where ${NAMES.access.userId} = ? and ${NAMES.access.clientId} = ? and ${NAMES.access.revoked} is null limit 1`,
    ))
  );
}
