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

let _broker: NotificationBroker | null = null;

export async function initBroker(transport: string, redisUrl?: string): Promise<void> {
  if (transport === 'sse') {
    const { InProcessBroker } = await import('./brokers/in-process');
    _broker = new InProcessBroker();
  } else if (transport === 'redis' && redisUrl) {
    try {
      const { RedisBroker } = await import('./brokers/redis');
      _broker = new RedisBroker(redisUrl);
    } catch {
      // ioredis not installed — fall back to polling
    }
  }
}

export function getBroker(): NotificationBroker | null {
  return _broker;
}

export async function closeBroker(): Promise<void> {
  if (_broker) {
    await _broker.close();
    _broker = null;
  }
}
