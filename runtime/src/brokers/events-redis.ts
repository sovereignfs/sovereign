import type { EventBroker, EventEnvelope } from '../event-broker';
import { EventRingBuffer } from '../event-ring-buffer';

// ioredis is an optionalDependency — this module is only loaded when
// SOVEREIGN_EVENTS_TRANSPORT=redis, so the dynamic import is safe.
type Redis = import('ioredis').Redis;

export class RedisEventBroker implements EventBroker {
  readonly #pub: Redis;
  readonly #sub: Redis;
  readonly #ring = new EventRingBuffer();
  #connected = true;

  constructor(url: string) {
    // Lazy imports keep the ioredis require out of the module graph until needed.
    // Using require() here because top-level await isn't available in constructor.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis') as typeof import('ioredis').default;
    this.#pub = new Redis(url, { lazyConnect: false });
    // SUBSCRIBE locks the connection — a dedicated client is required.
    this.#sub = new Redis(url, { lazyConnect: false });

    const onError = () => {
      this.#connected = false;
    };
    this.#pub.on('error', onError);
    this.#sub.on('error', onError);
    this.#pub.on('connect', () => {
      this.#connected = true;
    });
  }

  get connected(): boolean {
    return this.#connected;
  }

  /**
   * Records into the local ring buffer immediately (not just on delivery) so
   * `/api/events/poll` sees this process's own publishes even when nothing
   * on this process is realtime-subscribed to the channel — see
   * `EventRingBuffer.record()`'s doc comment for why double-recording on the
   * subscription echo is safe (idempotent on `envelope.id`).
   */
  async publish(channel: string, envelope: EventEnvelope): Promise<void> {
    this.#ring.record(channel, envelope);
    await this.#pub.publish(`sv:event:${channel}`, JSON.stringify(envelope));
  }

  subscribe(channel: string, handler: (envelope: EventEnvelope) => void): () => void {
    const redisChannel = `sv:event:${channel}`;
    void this.#sub.subscribe(redisChannel);
    const listener = (ch: string, msg: string) => {
      if (ch !== redisChannel) return;
      const envelope = JSON.parse(msg) as EventEnvelope;
      this.#ring.record(channel, envelope);
      handler(envelope);
    };
    this.#sub.on('message', listener);
    return () => {
      void this.#sub.unsubscribe(redisChannel);
      this.#sub.off('message', listener);
    };
  }

  recent(channel: string, sinceId?: string): EventEnvelope[] {
    return this.#ring.since(channel, sinceId);
  }

  async close(): Promise<void> {
    await Promise.all([this.#pub.quit(), this.#sub.quit()]);
    this.#ring.clear();
  }
}
