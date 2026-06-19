import { describe, expect, it } from 'vitest';
import { makeConsentGrant, makePluginStatus, makeTenant, makeUser } from '../index';

describe('makeUser', () => {
  it('returns a valid user with defaults', () => {
    const u = makeUser();
    expect(u.id).toBeTruthy();
    expect(u.role).toBe('platform:user');
    expect(u.active).toBe(true);
    expect(u.emailVerified).toBe(true);
  });

  it('accepts overrides', () => {
    const u = makeUser({ email: 'a@example.com', role: 'platform:admin' });
    expect(u.email).toBe('a@example.com');
    expect(u.role).toBe('platform:admin');
  });

  it('generates unique ids and emails by default', () => {
    const a = makeUser();
    const b = makeUser();
    expect(a.id).not.toBe(b.id);
    expect(a.email).not.toBe(b.email);
  });
});

describe('makeTenant', () => {
  it('returns the default tenant shape', () => {
    const t = makeTenant();
    expect(t.id).toBe('default');
    expect(t.name).toBeTruthy();
  });

  it('accepts overrides', () => {
    const t = makeTenant({ name: 'Acme' });
    expect(t.name).toBe('Acme');
  });
});

describe('makePluginStatus', () => {
  it('defaults to enabled', () => {
    const p = makePluginStatus();
    expect(p.enabled).toBe(true);
    expect(p.pluginId).toBeTruthy();
  });

  it('accepts a specific pluginId', () => {
    const p = makePluginStatus({ pluginId: 'io.example.tasks', enabled: false });
    expect(p.pluginId).toBe('io.example.tasks');
    expect(p.enabled).toBe(false);
  });
});

describe('makeConsentGrant', () => {
  it('returns a valid grant with defaults', () => {
    const g = makeConsentGrant();
    expect(g.id).toBeTruthy();
    expect(g.revokedAt).toBeNull();
    expect(g.version).toBe(1);
  });

  it('generates unique ids by default', () => {
    const a = makeConsentGrant();
    const b = makeConsentGrant();
    expect(a.id).not.toBe(b.id);
  });
});
