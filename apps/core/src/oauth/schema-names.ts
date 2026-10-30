import { getTableColumns, getTableName } from 'drizzle-orm';
import * as schema from '../db/schema/sqlite';

/**
 * The names of the provider's tables and columns, read from the generated Drizzle schema, so that the SQL
 * that revokes tokens (a data layer function that runs on one transaction, on any dialect) is written
 * against what the schema says and not against a name typed twice. The two dialects' schemas are a pair
 * (`schema-parity.test.ts`), so SQLite's names are PostgreSQL's.
 */
const name = (table: Parameters<typeof getTableName>[0]) => getTableName(table);
const columns = (table: Parameters<typeof getTableColumns>[0]) =>
  getTableColumns(table) as Record<string, { name: string }>;

const access = columns(schema.oauthAccessTokens);
const refresh = columns(schema.oauthRefreshTokens);
const consent = columns(schema.oauthConsents);
const client = columns(schema.oauthClients);
const managed = columns(schema.managedClients);

const col = (found: Record<string, { name: string }>, key: string): string => {
  const column = found[key];
  if (!column) throw new Error(`the schema has no column ${key}`);
  return column.name;
};

export const NAMES = {
  accessTokens: name(schema.oauthAccessTokens),
  refreshTokens: name(schema.oauthRefreshTokens),
  consents: name(schema.oauthConsents),
  clients: name(schema.oauthClients),
  sessions: name(schema.sessions),
  access: {
    id: col(access, 'id'),
    userId: col(access, 'userId'),
    clientId: col(access, 'clientId'),
    sessionId: col(access, 'sessionId'),
    revoked: col(access, 'revoked'),
  },
  refresh: {
    id: col(refresh, 'id'),
    userId: col(refresh, 'userId'),
    clientId: col(refresh, 'clientId'),
    sessionId: col(refresh, 'sessionId'),
    revoked: col(refresh, 'revoked'),
    scopes: col(refresh, 'scopes'),
  },
  consent: {
    userId: col(consent, 'userId'),
    clientId: col(consent, 'clientId'),
  },
  managed: {
    table: name(schema.managedClients),
    key: col(managed, 'key'),
    clientId: col(managed, 'clientId'),
    createdAt: col(managed, 'createdAt'),
  },
  client: {
    clientId: col(client, 'clientId'),
    backchannelLogoutUri: col(client, 'backchannelLogoutUri'),
    disabled: col(client, 'disabled'),
    authMethod: col(client, 'tokenEndpointAuthMethod'),
    appScopes: col(client, 'clientCredentialsScopes'),
  },
};
