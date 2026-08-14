import { describe, expect, it } from 'vitest';
import { appendVerificationEvent, computeVerificationRecompute } from '../verification';

describe('computeVerificationRecompute', () => {
  it('promotes 0 -> 1 when email is verified', () => {
    const result = computeVerificationRecompute(
      0,
      null,
      { emailVerified: true, hasMfa: false },
      1000,
    );
    expect(result.level).toBe(1);
    expect(result.changed).toBe(true);
    expect(JSON.parse(result.events ?? '[]')).toEqual([{ type: 'email_verified', at: 1000 }]);
  });

  it('promotes 0 -> 2 in one recompute when both signals are already true', () => {
    const result = computeVerificationRecompute(
      0,
      null,
      { emailVerified: true, hasMfa: true },
      1000,
    );
    expect(result.level).toBe(2);
    expect(result.changed).toBe(true);
    expect(JSON.parse(result.events ?? '[]')).toEqual([
      { type: 'email_verified', at: 1000 },
      { type: 'mfa_enrolled', at: 1000 },
    ]);
  });

  it('promotes 1 -> 2 when MFA is enrolled', () => {
    const result = computeVerificationRecompute(
      1,
      null,
      { emailVerified: true, hasMfa: true },
      1000,
    );
    expect(result.level).toBe(2);
    expect(result.changed).toBe(true);
  });

  it('never promotes past level 2 — level 3 is admin-vouch only', () => {
    const result = computeVerificationRecompute(
      2,
      null,
      { emailVerified: true, hasMfa: true },
      1000,
    );
    expect(result.level).toBe(2);
    expect(result.changed).toBe(false);
  });

  it('is a no-op when nothing changed (idle recompute)', () => {
    const result = computeVerificationRecompute(
      1,
      '[]',
      { emailVerified: true, hasMfa: false },
      1000,
    );
    expect(result.level).toBe(1);
    expect(result.changed).toBe(false);
    expect(result.events).toBe('[]');
  });

  it('drops MFA-enrolled level 2 to 1 when MFA is removed', () => {
    const result = computeVerificationRecompute(
      2,
      null,
      { emailVerified: true, hasMfa: false },
      2000,
    );
    expect(result.level).toBe(1);
    expect(result.changed).toBe(true);
    expect(JSON.parse(result.events ?? '[]')).toEqual([{ type: 'mfa_removed', at: 2000 }]);
  });

  it('also drops an admin-vouched level 3 to 1 on MFA removal (RFC 0035 §5.4, deliberate)', () => {
    const result = computeVerificationRecompute(
      3,
      null,
      { emailVerified: true, hasMfa: false },
      2000,
    );
    expect(result.level).toBe(1);
    expect(result.changed).toBe(true);
  });

  it('leaves level 0 alone when email is unverified and there is no MFA', () => {
    const result = computeVerificationRecompute(
      0,
      null,
      { emailVerified: false, hasMfa: false },
      1000,
    );
    expect(result.level).toBe(0);
    expect(result.changed).toBe(false);
  });
});

describe('appendVerificationEvent', () => {
  it('appends to an empty/absent log', () => {
    const events = appendVerificationEvent(null, { type: 'email_verified', at: 1000 });
    expect(JSON.parse(events)).toEqual([{ type: 'email_verified', at: 1000 }]);
  });

  it('appends to an existing log, preserving order', () => {
    const first = appendVerificationEvent(null, { type: 'email_verified', at: 1000 });
    const second = appendVerificationEvent(first, { type: 'mfa_enrolled', at: 2000 });
    expect(JSON.parse(second)).toEqual([
      { type: 'email_verified', at: 1000 },
      { type: 'mfa_enrolled', at: 2000 },
    ]);
  });

  it('caps the log at 20 entries, dropping the oldest first', () => {
    let raw: string | null = null;
    for (let i = 0; i < 25; i++) {
      raw = appendVerificationEvent(raw, { type: 'mfa_enrolled', at: i });
    }
    const events = JSON.parse(raw ?? '[]') as { at: number }[];
    expect(events).toHaveLength(20);
    expect(events[0]?.at).toBe(5);
    expect(events[19]?.at).toBe(24);
  });

  it('recovers from malformed JSON rather than throwing', () => {
    const events = appendVerificationEvent('not json', { type: 'vouched', at: 1000, by: 'admin' });
    expect(JSON.parse(events)).toEqual([{ type: 'vouched', at: 1000, by: 'admin' }]);
  });
});
