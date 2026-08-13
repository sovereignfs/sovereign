import type { EventEnvelope } from './event-broker';

/**
 * Bounded, in-memory, per-channel history feeding the `/api/events/poll`
 * fallback (RFC 0045). Deliberately **not** durable persistence — nothing
 * here is written to disk or a database, entries are capped by both count
 * and age, and eviction is silent. This is what makes it safe to coexist
 * with RFC 0045's "no durable persistence" / "not a notification inbox"
 * requirements while still giving non-SSE clients something to poll:
 * `sdk.events.publish()` records here as a side effect of publishing, not as
 * a second, separate write path a plugin author has to think about.
 *
 * Per-process only — in a multi-process Redis deployment, a poller only sees
 * events this process itself published or received over its own Redis
 * subscription. That is consistent with RFC 0045's own delivery semantics
 * ("best-effort delivery; no guaranteed ordering across processes"), not a
 * bug to fix here.
 */
const MAX_EVENTS_PER_CHANNEL = 50;
const MAX_EVENT_AGE_MS = 5 * 60_000;

export class EventRingBuffer {
  readonly #buffers = new Map<string, EventEnvelope[]>();

  /**
   * Idempotent on `envelope.id` — the Redis broker records once at publish
   * time (so a poller sees events even with zero active subscribers) and
   * again when that same publish echoes back through its own subscription
   * (Redis delivers a publisher's message to its own subscribed connections
   * too); recording the second arrival would otherwise duplicate the entry.
   */
  record(channel: string, envelope: EventEnvelope): void {
    const cutoff = Date.now() - MAX_EVENT_AGE_MS;
    let list = this.#buffers.get(channel) ?? [];
    if (list.some((e) => e.id === envelope.id)) return;
    list = [...list, envelope].filter((e) => e.createdAt >= cutoff);
    if (list.length > MAX_EVENTS_PER_CHANNEL) {
      list = list.slice(list.length - MAX_EVENTS_PER_CHANNEL);
    }
    if (list.length === 0) {
      this.#buffers.delete(channel);
    } else {
      this.#buffers.set(channel, list);
    }
  }

  /** Events for `channel` newer than `sinceId`, oldest first. Unknown/expired `sinceId` returns the full remaining buffer. */
  since(channel: string, sinceId?: string): EventEnvelope[] {
    const cutoff = Date.now() - MAX_EVENT_AGE_MS;
    const list = (this.#buffers.get(channel) ?? []).filter((e) => e.createdAt >= cutoff);
    if (!sinceId) return list;
    const idx = list.findIndex((e) => e.id === sinceId);
    return idx === -1 ? list : list.slice(idx + 1);
  }

  clear(): void {
    this.#buffers.clear();
  }
}
