import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventRingBuffer } from '../event-ring-buffer';

function envelope(overrides: Partial<{ id: string; createdAt: number }> = {}) {
  return {
    id: overrides.id ?? 'evt-1',
    channel: 'com.example:list:1',
    type: 'item.checked',
    payload: { itemId: 'x' },
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

describe('EventRingBuffer', () => {
  let ring: EventRingBuffer;

  beforeEach(() => {
    ring = new EventRingBuffer();
  });

  it('returns an empty array for a channel with no recorded events', () => {
    expect(ring.since('nope')).toEqual([]);
  });

  it('records and returns events for a channel, oldest first', () => {
    ring.record('ch', envelope({ id: 'a' }));
    ring.record('ch', envelope({ id: 'b' }));
    expect(ring.since('ch').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('keeps channels independent', () => {
    ring.record('ch1', envelope({ id: 'a' }));
    ring.record('ch2', envelope({ id: 'b' }));
    expect(ring.since('ch1').map((e) => e.id)).toEqual(['a']);
    expect(ring.since('ch2').map((e) => e.id)).toEqual(['b']);
  });

  it('since(channel, sinceId) returns only events after that id', () => {
    ring.record('ch', envelope({ id: 'a' }));
    ring.record('ch', envelope({ id: 'b' }));
    ring.record('ch', envelope({ id: 'c' }));
    expect(ring.since('ch', 'a').map((e) => e.id)).toEqual(['b', 'c']);
    expect(ring.since('ch', 'c')).toEqual([]);
  });

  it('an unknown sinceId returns the full remaining buffer', () => {
    ring.record('ch', envelope({ id: 'a' }));
    expect(ring.since('ch', 'no-such-id').map((e) => e.id)).toEqual(['a']);
  });

  it('is idempotent on envelope.id — recording the same id twice does not duplicate it', () => {
    ring.record('ch', envelope({ id: 'a' }));
    ring.record('ch', envelope({ id: 'a' }));
    expect(ring.since('ch').map((e) => e.id)).toEqual(['a']);
  });

  it('caps at 50 events per channel, evicting the oldest', () => {
    for (let i = 0; i < 60; i++) {
      ring.record('ch', envelope({ id: `evt-${String(i)}` }));
    }
    const remaining = ring.since('ch');
    expect(remaining).toHaveLength(50);
    expect(remaining[0]?.id).toBe('evt-10');
    expect(remaining[49]?.id).toBe('evt-59');
  });

  describe('age eviction', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('evicts events older than 5 minutes on the next record()', () => {
      vi.setSystemTime(0);
      ring.record('ch', envelope({ id: 'old', createdAt: 0 }));
      expect(ring.since('ch').map((e) => e.id)).toEqual(['old']);

      vi.setSystemTime(6 * 60_000); // 6 minutes later, past the 5-minute cutoff
      ring.record('ch', envelope({ id: 'new', createdAt: 6 * 60_000 }));
      expect(ring.since('ch').map((e) => e.id)).toEqual(['new']);
    });

    it('also evicts stale events from since() reads, not just record()', () => {
      vi.setSystemTime(0);
      ring.record('ch', envelope({ id: 'old', createdAt: 0 }));

      vi.setSystemTime(6 * 60_000);
      expect(ring.since('ch')).toEqual([]);
    });
  });

  it('clear() empties every channel', () => {
    ring.record('ch1', envelope({ id: 'a' }));
    ring.record('ch2', envelope({ id: 'b' }));
    ring.clear();
    expect(ring.since('ch1')).toEqual([]);
    expect(ring.since('ch2')).toEqual([]);
  });
});
