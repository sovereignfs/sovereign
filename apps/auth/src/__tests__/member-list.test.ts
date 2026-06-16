import { describe, expect, it } from 'vitest';
import { buildMemberList, type AuthUserRow, type PendingInviteRow } from '../member-list';

function user(overrides: Partial<AuthUserRow> = {}): AuthUserRow {
  return {
    id: 'u1',
    email: 'alice@example.com',
    name: 'Alice',
    role: 'platform:user',
    active: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function invite(overrides: Partial<PendingInviteRow> = {}): PendingInviteRow {
  return {
    email: 'bob@example.com',
    created_at: 1_780_000_000,
    expires_at: null,
    ...overrides,
  };
}

describe('buildMemberList', () => {
  it('maps active 1 and NULL to active, 0 to deactivated (SQLite shape)', () => {
    const rows = buildMemberList(
      [
        user({ id: 'u1', email: 'a@x.com', active: 1 }),
        user({ id: 'u2', email: 'b@x.com', active: null }),
        user({ id: 'u3', email: 'c@x.com', active: 0 }),
      ],
      [],
    );
    expect(rows.map((r) => r.status)).toEqual(['active', 'active', 'deactivated']);
  });

  it('maps active true to active, false to deactivated (Postgres shape)', () => {
    const rows = buildMemberList(
      [
        user({ id: 'u1', email: 'a@x.com', active: true }),
        user({ id: 'u2', email: 'b@x.com', active: false }),
      ],
      [],
    );
    expect(rows.map((r) => r.status)).toEqual(['active', 'deactivated']);
  });

  it('appends pending invites as invited rows with null id and role', () => {
    const rows = buildMemberList([user()], [invite()]);
    expect(rows).toHaveLength(2);
    const invited = rows[1];
    expect(invited).toMatchObject({
      id: null,
      email: 'bob@example.com',
      name: null,
      role: null,
      status: 'invited',
    });
  });

  it('converts invite Unix timestamps to ISO strings', () => {
    const rows = buildMemberList(
      [],
      [invite({ created_at: 1_780_000_000, expires_at: 1_780_086_400 })],
    );
    expect(rows[0]?.createdAt).toBe(new Date(1_780_000_000 * 1000).toISOString());
    expect(rows[0]?.expiresAt).toBe(new Date(1_780_086_400 * 1000).toISOString());
  });

  it('leaves expiresAt null for invites without an expiry', () => {
    const rows = buildMemberList([], [invite({ expires_at: null })]);
    expect(rows[0]?.expiresAt).toBeNull();
  });

  it('drops invites whose email is already registered', () => {
    const rows = buildMemberList(
      [user({ email: 'bob@example.com' })],
      [invite({ email: 'bob@example.com' })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('active');
  });

  it('deduplicates multiple invites to the same email, keeping the most recent', () => {
    const rows = buildMemberList(
      [],
      [
        invite({ created_at: 1_780_000_000 }),
        invite({ created_at: 1_780_100_000 }), // ascending order — most recent last
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdAt).toBe(new Date(1_780_100_000 * 1000).toISOString());
  });

  it('returns an empty list for no users and no invites', () => {
    expect(buildMemberList([], [])).toEqual([]);
  });

  it('keeps registered users first, invites after', () => {
    const rows = buildMemberList([user()], [invite()]);
    expect(rows.map((r) => r.status)).toEqual(['active', 'invited']);
  });
});
