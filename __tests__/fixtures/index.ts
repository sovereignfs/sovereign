import { randomUUID } from 'node:crypto';

/**
 * In-memory fixture factories for unit and integration tests (RFC 0019).
 * Return plain objects that match the shape of the corresponding DB rows.
 * No running instance, no DB connection required — fast and deterministic.
 *
 * Usage: const user = makeUser({ email: 'alice@example.com', role: 'platform:admin' });
 */

export interface FixtureUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: 'platform:admin' | 'platform:user';
  active: boolean;
}

export interface FixtureTenant {
  id: string;
  name: string;
  createdAt: Date;
}

export interface FixturePluginStatus {
  pluginId: string;
  enabled: boolean;
}

export interface FixtureConsentGrant {
  id: string;
  userId: string;
  consumerId: string;
  providerId: string;
  contract: string;
  version: number;
  grantedAt: Date;
  revokedAt: Date | null;
}

export function makeUser(overrides: Partial<FixtureUser> = {}): FixtureUser {
  const now = new Date();
  return {
    id: randomUUID(),
    name: 'Test User',
    email: `user-${randomUUID().slice(0, 8)}@example.com`,
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
    role: 'platform:user',
    active: true,
    ...overrides,
  };
}

export function makeTenant(overrides: Partial<FixtureTenant> = {}): FixtureTenant {
  return {
    id: 'default',
    name: 'My Workspace',
    createdAt: new Date(),
    ...overrides,
  };
}

export function makePluginStatus(
  overrides: Partial<FixturePluginStatus> = {},
): FixturePluginStatus {
  return {
    pluginId: `io.example.plugin-${randomUUID().slice(0, 8)}`,
    enabled: true,
    ...overrides,
  };
}

export function makeConsentGrant(
  overrides: Partial<FixtureConsentGrant> = {},
): FixtureConsentGrant {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    consumerId: 'io.example.consumer',
    providerId: 'io.example.provider',
    contract: 'profile',
    version: 1,
    grantedAt: new Date(),
    revokedAt: null,
    ...overrides,
  };
}
