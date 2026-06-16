import { describe, expect, it } from 'vitest';
import { markCurrentSessions, type RawSession } from '../sessions';

function raw(token: string, createdAt: string, extra: Partial<RawSession> = {}): RawSession {
  return {
    token,
    createdAt,
    updatedAt: createdAt,
    expiresAt: '2026-12-31T00:00:00.000Z',
    ...extra,
  };
}

describe('markCurrentSessions', () => {
  it('flags the session whose token matches the current one', () => {
    const out = markCurrentSessions(
      [raw('a', '2026-06-01T00:00:00.000Z'), raw('b', '2026-06-02T00:00:00.000Z')],
      'b',
    );
    expect(out.find((s) => s.token === 'b')?.current).toBe(true);
    expect(out.find((s) => s.token === 'a')?.current).toBe(false);
  });

  it('orders the current session first', () => {
    const out = markCurrentSessions(
      [raw('old', '2026-06-01T00:00:00.000Z'), raw('cur', '2026-05-01T00:00:00.000Z')],
      'cur',
    );
    expect(out[0]?.token).toBe('cur');
  });

  it('orders the rest newest-first', () => {
    const out = markCurrentSessions(
      [
        raw('older', '2026-06-01T00:00:00.000Z'),
        raw('newer', '2026-06-03T00:00:00.000Z'),
        raw('cur', '2026-01-01T00:00:00.000Z'),
      ],
      'cur',
    );
    expect(out.map((s) => s.token)).toEqual(['cur', 'newer', 'older']);
  });

  it('marks none current when the token is null', () => {
    const out = markCurrentSessions([raw('a', '2026-06-01T00:00:00.000Z')], null);
    expect(out.every((s) => !s.current)).toBe(true);
  });

  it('normalises missing userAgent/ipAddress to null', () => {
    const out = markCurrentSessions([raw('a', '2026-06-01T00:00:00.000Z')], 'a');
    expect(out[0]?.userAgent).toBeNull();
    expect(out[0]?.ipAddress).toBeNull();
  });

  it('passes through userAgent/ipAddress when present', () => {
    const out = markCurrentSessions(
      [raw('a', '2026-06-01T00:00:00.000Z', { userAgent: 'Firefox', ipAddress: '10.0.0.1' })],
      'a',
    );
    expect(out[0]?.userAgent).toBe('Firefox');
    expect(out[0]?.ipAddress).toBe('10.0.0.1');
  });
});
