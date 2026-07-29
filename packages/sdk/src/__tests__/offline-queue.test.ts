import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  categorizeOutcomes,
  drainQueue,
  offlineQueue,
  OfflineQueueFullError,
  type QueuedMutation,
  type SyncOutcome,
} from '../offline-queue';

describe('OfflineQueueFullError', () => {
  it('is a named Error subclass', () => {
    const err = new OfflineQueueFullError('too many queued mutations');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('OfflineQueueFullError');
    expect(err.message).toBe('too many queued mutations');
  });
});

describe('categorizeOutcomes', () => {
  it('groups applied, skipped, and failed outcomes', () => {
    const outcomes: SyncOutcome[] = [
      { id: 'a', status: 'applied' },
      { id: 'b', status: 'skipped' },
      { id: 'c', status: 'failed', error: 'conflict' },
    ];
    expect(categorizeOutcomes(outcomes)).toEqual({
      applied: ['a'],
      skipped: ['b'],
      failed: [{ id: 'c', error: 'conflict' }],
    });
  });

  it('defaults a failed outcome with no error message to "sync failed"', () => {
    const outcomes: SyncOutcome[] = [{ id: 'x', status: 'failed' }];
    expect(categorizeOutcomes(outcomes)).toEqual({
      applied: [],
      skipped: [],
      failed: [{ id: 'x', error: 'sync failed' }],
    });
  });

  it('returns empty arrays for an empty batch', () => {
    expect(categorizeOutcomes([])).toEqual({ applied: [], skipped: [], failed: [] });
  });
});

describe('drainQueue', () => {
  const PLUGIN_ID = 'fs.sovereign.shopper';

  function mutation(id: string, op = 'addItem'): QueuedMutation {
    return { id, op, payload: {}, clientTimestamp: 0, attempts: 0 };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing and calls no applier when the queue is empty', async () => {
    vi.spyOn(offlineQueue, 'list').mockResolvedValue([]);
    const applyBatch = vi.fn();

    const result = await drainQueue(PLUGIN_ID, applyBatch);

    expect(applyBatch).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: [], skipped: [], failed: [] });
  });

  it('removes applied and skipped mutations, marks failed ones without removing them', async () => {
    const batch = [mutation('a'), mutation('b'), mutation('c')];
    vi.spyOn(offlineQueue, 'list').mockResolvedValue(batch);
    const removeSpy = vi.spyOn(offlineQueue, 'remove').mockResolvedValue();
    const markFailedSpy = vi.spyOn(offlineQueue, 'markFailed').mockResolvedValue();

    const applyBatch = vi.fn(
      async (): Promise<SyncOutcome[]> => [
        { id: 'a', status: 'applied' },
        { id: 'b', status: 'skipped' },
        { id: 'c', status: 'failed', error: 'stale write' },
      ],
    );

    const result = await drainQueue(PLUGIN_ID, applyBatch);

    expect(applyBatch).toHaveBeenCalledWith(batch);
    expect(removeSpy).toHaveBeenCalledWith(PLUGIN_ID, 'a');
    expect(removeSpy).toHaveBeenCalledWith(PLUGIN_ID, 'b');
    expect(removeSpy).not.toHaveBeenCalledWith(PLUGIN_ID, 'c');
    expect(markFailedSpy).toHaveBeenCalledWith(PLUGIN_ID, 'c', 'stale write');
    expect(result).toEqual({
      applied: ['a'],
      skipped: ['b'],
      failed: [{ id: 'c', error: 'stale write' }],
    });
  });

  it('leaves a mutation the applier never mentions untouched (neither removed nor marked)', async () => {
    const batch = [mutation('a'), mutation('b')];
    vi.spyOn(offlineQueue, 'list').mockResolvedValue(batch);
    const removeSpy = vi.spyOn(offlineQueue, 'remove').mockResolvedValue();
    const markFailedSpy = vi.spyOn(offlineQueue, 'markFailed').mockResolvedValue();

    // The server halted after "a" (RFC 0078 §4's sequential-apply-halt-on-first-failure) —
    // "b" was never attempted this round and shouldn't be touched.
    const applyBatch = vi.fn(
      async (): Promise<SyncOutcome[]> => [
        { id: 'a', status: 'failed', error: 'validation error' },
      ],
    );

    await drainQueue(PLUGIN_ID, applyBatch);

    expect(markFailedSpy).toHaveBeenCalledWith(PLUGIN_ID, 'a', 'validation error');
    expect(removeSpy).not.toHaveBeenCalled();
    expect(markFailedSpy).toHaveBeenCalledTimes(1);
  });
});
