import { EventEmitter } from 'node:events';
import type { NotificationBroker, NotificationPayload } from '../notification-broker';

export class InProcessBroker implements NotificationBroker {
  readonly #emitter = new EventEmitter();

  constructor() {
    // Unlimited listeners — one per open SSE connection per user; no hard cap.
    this.#emitter.setMaxListeners(0);
  }

  async publish(userId: string, payload: NotificationPayload): Promise<void> {
    this.#emitter.emit(`sv:notif:${userId}`, payload);
  }

  subscribe(userId: string, handler: (payload: NotificationPayload) => void): () => void {
    const event = `sv:notif:${userId}`;
    this.#emitter.on(event, handler);
    return () => this.#emitter.off(event, handler);
  }

  async close(): Promise<void> {
    this.#emitter.removeAllListeners();
  }
}
