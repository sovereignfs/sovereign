import { createTestDatabase, type TestDatabase } from '@sovereignfs/database/testing';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../auth/auth';
import { migrateCore } from '../db/migrate';
import { BASE_URL, makeAuth } from './auth-harness';

vi.stubEnv('SV_DB_DIALECT', 'sqlite');
vi.stubEnv('SV_SQLITE_URL', `file:${path.join(tmpdir(), 'sv-core-wellknown.db')}`);

let auth: Auth;
vi.mock('../auth', () => ({ getAuth: () => Promise.resolve(auth) }));

let target: TestDatabase;
let openid: typeof import('../../app/.well-known/openid-configuration/route');
let oauth: typeof import('../../app/.well-known/oauth-authorization-server/route');

beforeAll(async () => {
  target = await createTestDatabase();
  const db = await target.open();
  await migrateCore(db, path.join(import.meta.dirname, '../../migrations'));
  auth = makeAuth(db);
  openid = await import('../../app/.well-known/openid-configuration/route');
  oauth = await import('../../app/.well-known/oauth-authorization-server/route');
});

afterAll(async () => {
  await target.cleanup();
});

const ask = (path: string) => new Request(`${BASE_URL}${path}`);

describe('discovery at the root of the instance', () => {
  it('serves the OpenID Connect document, with the instance URL as the issuer', async () => {
    const response = await openid.GET(ask('/.well-known/openid-configuration'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const document = (await response.json()) as Record<string, unknown>;
    expect(document.issuer).toBe(BASE_URL);
    expect(document.authorization_endpoint).toBe(`${BASE_URL}/api/auth/oauth2/authorize`);
    expect(document.jwks_uri).toBe(`${BASE_URL}/api/auth/jwks`);
  });

  it('serves the OAuth document at its own address, saying the same about the issuer', async () => {
    const response = await oauth.GET(ask('/.well-known/oauth-authorization-server'));
    expect(response.status).toBe(200);
    const document = (await response.json()) as Record<string, unknown>;
    expect(document.issuer).toBe(BASE_URL);
    expect(document.token_endpoint).toBe(`${BASE_URL}/api/auth/oauth2/token`);
  });

  it('is the document the provider itself gives, not a copy that could drift', async () => {
    const response = await openid.GET(ask('/.well-known/openid-configuration'));
    expect(await response.json()).toEqual(
      JSON.parse(JSON.stringify(await auth.api.getOpenIdConfig())),
    );
  });

  it('is built for each request, never prerendered', () => {
    expect(openid.dynamic).toBe('force-dynamic');
    expect(oauth.dynamic).toBe('force-dynamic');
  });
});
