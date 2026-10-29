import { describe, expect, it } from 'vitest';
import { ROLE_ADMIN, ROLE_USER } from '../auth/roles';
import { ALL_CAPABILITIES, DEFAULT_MATRIX, OWNER_ONLY_CAPABILITIES } from '../roles/capabilities';
import { applyOverrides } from '../roles/matrix';
import { CAPABILITY_TEXT, describeMatrix } from '../roles/describe';

describe('what the owner reads about each capability', () => {
  it('names every capability, so a new one cannot reach the page without words', () => {
    expect(Object.keys(CAPABILITY_TEXT).sort()).toEqual([...ALL_CAPABILITIES].sort());
    for (const { label, description } of Object.values(CAPABILITY_TEXT)) {
      expect(label.trim()).not.toBe('');
      expect(description.trim()).not.toBe('');
    }
  });

  it('keeps implementation names out of what a person reads', () => {
    for (const { label, description } of Object.values(CAPABILITY_TEXT)) {
      expect(`${label} ${description}`).not.toMatch(
        /[a-z]+:[a-z-]+|\bcapabilit|\bscope|\btoken|\bOIDC/i,
      );
    }
  });
});

describe('the matrix as the editor shows it', () => {
  it('has one row for each capability, in order, marking those only the owner may hold', () => {
    const rows = describeMatrix(DEFAULT_MATRIX);
    expect(rows.map((row) => row.capability)).toEqual(ALL_CAPABILITIES);
    expect(rows.filter((row) => row.ownerOnly).map((row) => row.capability)).toEqual(
      OWNER_ONLY_CAPABILITIES,
    );
  });

  it('says what each role holds now, and what the code grants by default', () => {
    const edited = applyOverrides(DEFAULT_MATRIX, [
      { role: ROLE_ADMIN, capability: 'client:manage', granted: false },
      { role: ROLE_USER, capability: 'launcher:access', granted: false },
      { role: ROLE_USER, capability: 'user:view', granted: true },
    ]);
    const row = (capability: string) =>
      describeMatrix(edited).find((candidate) => candidate.capability === capability);
    expect(row('client:manage')).toMatchObject({ admin: false, adminDefault: true });
    expect(row('launcher:access')).toMatchObject({ user: false, userDefault: true });
    expect(row('user:view')).toMatchObject({ user: true, userDefault: false });
    expect(row('console:access')).toMatchObject({ admin: true, user: false });
  });

  it('shows an owner-only capability as held by neither role', () => {
    for (const row of describeMatrix(DEFAULT_MATRIX).filter((r) => r.ownerOnly)) {
      expect(row).toMatchObject({
        admin: false,
        user: false,
        adminDefault: false,
        userDefault: false,
      });
    }
  });
});
