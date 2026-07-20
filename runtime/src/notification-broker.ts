export interface NotificationPayload {
  notificationId: string;
  userId: string;
  title: string;
  body?: string;
  url?: string;
  category: string;
  source?: string;
}

export interface NotificationBroker {
  publish(userId: string, payload: NotificationPayload): Promise<void>;
  subscribe(userId: string, handler: (payload: NotificationPayload) => void): () => void;
  close(): Promise<void>;
}

// Stored on `globalThis` rather than a module-level `let`. Next.js compiles
// instrumentation.ts (where initBroker() runs, via a dynamic import) and route
// handlers (where getBroker() is read, via a static import of the same file)
// into separate module graphs — even within the same Node.js process, in dev,
// `next start`, and the standalone server this app ships in Docker. A plain
// module-level variable silently diverges into two independent singletons:
// initBroker() sets one copy, getBroker() reads the other, and every request
// sees a broker that was never there. `globalThis` is the actual process-wide
// global object, shared regardless of which bundle a piece of code lives in.
const GLOBAL_KEY = '__sovereignNotificationBroker__';

interface GlobalWithBroker {
  [GLOBAL_KEY]?: NotificationBroker | null;
}

function globalStore(): GlobalWithBroker {
  return globalThis as GlobalWithBroker;
}

export async function initBroker(transport: string, redisUrl?: string): Promise<void> {
  if (transport === 'sse') {
    const { InProcessBroker } = await import('./brokers/in-process');
    globalStore()[GLOBAL_KEY] = new InProcessBroker();
  } else if (transport === 'redis' && redisUrl) {
    try {
      const { RedisBroker } = await import('./brokers/redis');
      globalStore()[GLOBAL_KEY] = new RedisBroker(redisUrl);
    } catch {
      // ioredis not installed — fall back to polling
    }
  }
}

export function getBroker(): NotificationBroker | null {
  return globalStore()[GLOBAL_KEY] ?? null;
}

export async function closeBroker(): Promise<void> {
  const broker = globalStore()[GLOBAL_KEY];
  if (broker) {
    await broker.close();
    globalStore()[GLOBAL_KEY] = null;
  }
}
