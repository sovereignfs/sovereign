import type { Database } from '@sovereignfs/database';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as postgres from '../db/schema/postgres';
import * as sqlite from '../db/schema/sqlite';
import { oidcPlugins } from '../oauth/provider';
import { authSettings } from './auth-harness';

/**
 * The tables behind the OpenID Connect provider are written by hand in both dialects (`schema/*.ts`), and
 * better-auth's plugins read and write them by field name. A plugin upgrade that adds, renames or
 * loosens a field would otherwise fail only at the first request that touches it. This reads what the
 * installed plugins declare and checks every field has a column of that name, with the same
 * required-ness, in both dialects, and that no column is left over that nothing writes.
 */
const MODELS = {
  jwks: 'jwks',
  oauthClient: 'oauthClients',
  oauthResource: 'oauthResources',
  oauthClientResource: 'oauthClientResources',
  oauthRefreshToken: 'oauthRefreshTokens',
  oauthAccessToken: 'oauthAccessTokens',
  oauthConsent: 'oauthConsents',
  oauthClientAssertion: 'oauthClientAssertions',
} as const;

/**
 * Where a column is looser than the plugin's declaration, and why: an access token for a resource is a
 * signed JWT that is never stored, so its `token` is empty; the plugin's own generator makes it nullable.
 */
const LOOSER = new Set(['oauthAccessToken.token']);

type Field = { required?: boolean };
type Declared = Record<string, { fields: Record<string, Field> }>;

const declared: Declared = Object.assign(
  {},
  ...oidcPlugins({} as Database, authSettings()).map(
    (plugin) => (plugin as { schema?: Declared }).schema ?? {},
  ),
);

describe('the OpenID Connect provider’s tables', () => {
  it('are the ones the installed plugins declare, no more and no fewer', () => {
    expect(Object.keys(declared).sort()).toEqual(Object.keys(MODELS).sort());
  });

  describe.each([
    ['SQLite', sqlite],
    ['PostgreSQL', postgres],
  ] as const)('on %s', (_dialect, schema) => {
    describe.each(Object.entries(MODELS))('%s', (model, exported) => {
      const table = (schema as unknown as Record<string, Parameters<typeof getTableColumns>[0]>)[
        exported
      ] as Parameters<typeof getTableColumns>[0];
      const columns = getTableColumns(table) as unknown as Record<string, { notNull: boolean }>;
      const fields = declared[model]?.fields ?? {};

      it('has a column for every field the plugin writes, as required as it says', () => {
        for (const [name, field] of Object.entries(fields)) {
          expect(columns[name], `${model}.${name} has no column`).toBeDefined();
          // better-auth takes a field to be required unless it says `required: false`.
          const required = field.required !== false && !LOOSER.has(`${model}.${name}`);
          expect(
            columns[name]?.notNull,
            `${model}.${name} ${required ? 'must be NOT NULL' : 'must allow NULL'}`,
          ).toBe(required);
        }
      });

      it('has no column the plugin does not write', () => {
        const extra = Object.keys(columns).filter((name) => name !== 'id' && !(name in fields));
        expect(extra).toEqual([]);
      });
    });
  });
});
