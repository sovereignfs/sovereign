export interface EventEnvelope<T = unknown> {
  id: string;
  /** Fully namespaced `<pluginId>:<local channel>` — never the plugin-local form alone. */
  channel: string;
  type: string;
  payload: T;
  /** Epoch **milliseconds** — unlike DB-persisted timestamps elsewhere in the platform (epoch seconds), never written to a database column. */
  createdAt: number;
}

export interface EventBroker {
  publish(channel: string, envelope: EventEnvelope): Promise<void>;
  subscribe(channel: string, handler: (envelope: EventEnvelope) => void): () => void;
  /** Recent events for a channel from the local ring buffer — see `event-ring-buffer.ts`. Not durable. */
  recent(channel: string, sinceId?: string): EventEnvelope[];
  close(): Promise<void>;
}

/**
 * Reads `SOVEREIGN_EVENTS_TRANSPORT` (mirrors `NOTIFICATION_TRANSPORT`'s
 * shape — a deliberate, independent env var rather than reusing that one, so
 * operators can size/disable realtime events separately from notifications;
 * see RFC 0045's changelog). Unlike the notification broker, an event broker
 * is instantiated for every mode including `polling` — the ring buffer that
 * backs `/api/events/poll` needs *something* to record into even when no
 * pub/sub fan-out is wired up, since events have no durable store to poll
 * against instead.
 */
export const EVENTS_TRANSPORT_ENV = 'SOVEREIGN_EVENTS_TRANSPORT';

// Stored on `globalThis`, not a module-level `let` — same reasoning as
// `notification-broker.ts`'s `GLOBAL_KEY`: instrumentation.ts (where
// initEventBroker() runs) and route handlers (where getEventBroker() is
// read) land in separate Next.js module graphs even within one process.
const GLOBAL_KEY = '__sovereignEventBroker__';

interface GlobalWithEventBroker {
  [GLOBAL_KEY]?: EventBroker | null;
}

function globalStore(): GlobalWithEventBroker {
  return globalThis as GlobalWithEventBroker;
}

export async function initEventBroker(transport: string, redisUrl?: string): Promise<void> {
  if (transport === 'redis' && redisUrl) {
    try {
      const { RedisEventBroker } = await import('./brokers/events-redis');
      globalStore()[GLOBAL_KEY] = new RedisEventBroker(redisUrl);
      return;
    } catch {
      // ioredis not installed — fall back to the in-process broker below.
    }
  }
  const { InProcessEventBroker } = await import('./brokers/events-in-process');
  globalStore()[GLOBAL_KEY] = new InProcessEventBroker();
}

export function getEventBroker(): EventBroker | null {
  return globalStore()[GLOBAL_KEY] ?? null;
}

export async function closeEventBroker(): Promise<void> {
  const broker = globalStore()[GLOBAL_KEY];
  if (broker) {
    await broker.close();
    globalStore()[GLOBAL_KEY] = null;
  }
}
