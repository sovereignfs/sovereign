import type { NotificationBroker, NotificationPayload } from '../notification-broker';

// ioredis is an optionalDependency — this module is only loaded when
// NOTIFICATION_TRANSPORT=redis, so the dynamic import is safe.
type Redis = import('ioredis').Redis;

export class RedisBroker implements NotificationBroker {
  readonly #pub: Redis;
  readonly #sub: Redis;
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

  async publish(userId: string, payload: NotificationPayload): Promise<void> {
    await this.#pub.publish(`sv:notif:${userId}`, JSON.stringify(payload));
  }

  subscribe(userId: string, handler: (payload: NotificationPayload) => void): () => void {
    const channel = `sv:notif:${userId}`;
    void this.#sub.subscribe(channel);
    const listener = (ch: string, msg: string) => {
      if (ch === channel) handler(JSON.parse(msg) as NotificationPayload);
    };
    this.#sub.on('message', listener);
    return () => {
      void this.#sub.unsubscribe(channel);
      this.#sub.off('message', listener);
    };
  }

  async close(): Promise<void> {
    await Promise.all([this.#pub.quit(), this.#sub.quit()]);
  }
}
