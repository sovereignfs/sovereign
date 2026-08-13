import { EventPayloadTooLargeError } from '@sovereignfs/sdk';
import { describe, expect, it } from 'vitest';
import { EVENT_PAYLOAD_MAX_BYTES, assertEventPayloadSize } from '../event-limits';

describe('assertEventPayloadSize', () => {
  it('does not throw for undefined payload', () => {
    expect(() => assertEventPayloadSize(undefined)).not.toThrow();
  });

  it('does not throw for a small payload', () => {
    expect(() => assertEventPayloadSize({ itemId: 'x' })).not.toThrow();
  });

  it('does not throw exactly at the byte limit', () => {
    // JSON.stringify('a'.repeat(n)) is n + 2 bytes (the surrounding quotes).
    const value = 'a'.repeat(EVENT_PAYLOAD_MAX_BYTES - 2);
    expect(() => assertEventPayloadSize(value)).not.toThrow();
  });

  it('throws EventPayloadTooLargeError when the payload exceeds the limit', () => {
    const value = 'a'.repeat(EVENT_PAYLOAD_MAX_BYTES);
    expect(() => assertEventPayloadSize(value)).toThrow(EventPayloadTooLargeError);
  });

  it('the thrown error names the actual and max byte sizes', () => {
    const value = 'a'.repeat(EVENT_PAYLOAD_MAX_BYTES);
    expect.assertions(1);
    try {
      assertEventPayloadSize(value);
    } catch (err) {
      expect((err as Error).message).toContain(String(EVENT_PAYLOAD_MAX_BYTES));
    }
  });
});
