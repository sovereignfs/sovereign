import { EventEmitter } from 'node:events';
import type { EventBroker, EventEnvelope } from '../event-broker';
import { EventRingBuffer } from '../event-ring-buffer';

export class InProcessEventBroker implements EventBroker {
  readonly #emitter = new EventEmitter();
  readonly #ring = new EventRingBuffer();

  constructor() {
    // Unlimited listeners — one per open SSE connection per channel; no hard cap.
    this.#emitter.setMaxListeners(0);
  }

  async publish(channel: string, envelope: EventEnvelope): Promise<void> {
    this.#ring.record(channel, envelope);
    this.#emitter.emit(`sv:event:${channel}`, envelope);
  }

  subscribe(channel: string, handler: (envelope: EventEnvelope) => void): () => void {
    const event = `sv:event:${channel}`;
    this.#emitter.on(event, handler);
    return () => this.#emitter.off(event, handler);
  }

  recent(channel: string, sinceId?: string): EventEnvelope[] {
    return this.#ring.since(channel, sinceId);
  }

  async close(): Promise<void> {
    this.#emitter.removeAllListeners();
    this.#ring.clear();
  }
}
