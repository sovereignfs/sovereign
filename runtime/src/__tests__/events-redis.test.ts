import { afterEach, describe, expect, it } from 'vitest';
import { RedisEventBroker } from '../brokers/events-redis';
import type { EventEnvelope } from '../event-broker';

/**
 * Live-Redis coverage for `RedisEventBroker`. Skipped unless
 * `TEST_REDIS_URL` points at a Redis instance, so the default `pnpm test`
 * stays Docker-free — same convention as `packages/db`'s `.pg.test.ts` files.
 *
 *   TEST_REDIS_URL=redis://localhost:6379 pnpm test
 */
const REDIS_URL = process.env.TEST_REDIS_URL;

function envelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    id: 'evt-1',
    channel: 'com.example.notes:list:1',
    type: 'item.checked',
    payload: { itemId: 'x' },
    createdAt: Date.now(),
    ...overrides,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!REDIS_URL)('RedisEventBroker', () => {
  let broker: RedisEventBroker;

  afterEach(async () => {
    await broker?.close();
  });

  it('delivers a published event to a subscriber via Redis pub/sub', async () => {
    broker = new RedisEventBroker(REDIS_URL as string);
    const received: EventEnvelope[] = [];
    broker.subscribe('ch', (e) => received.push(e));
    await wait(50); // SUBSCRIBE is async — give it a moment to land.

    await broker.publish('ch', envelope({ id: 'a' }));
    await wait(50);

    expect(received.map((e) => e.id)).toEqual(['a']);
  });

  it('does not deliver to a subscriber on a different Redis channel', async () => {
    broker = new RedisEventBroker(REDIS_URL as string);
    const received: EventEnvelope[] = [];
    broker.subscribe('other', (e) => received.push(e));
    await wait(50);

    await broker.publish('ch', envelope());
    await wait(50);

    expect(received).toHaveLength(0);
  });

  it('unsubscribe stops further delivery', async () => {
    broker = new RedisEventBroker(REDIS_URL as string);
    const received: EventEnvelope[] = [];
    const unsubscribe = broker.subscribe('ch', (e) => received.push(e));
    await wait(50);

    unsubscribe();
    await wait(50);
    await broker.publish('ch', envelope());
    await wait(50);

    expect(received).toHaveLength(0);
  });

  it('records into the ring buffer at publish time, even with zero subscribers', async () => {
    broker = new RedisEventBroker(REDIS_URL as string);
    await broker.publish('ch', envelope({ id: 'a' }));

    expect(broker.recent('ch').map((e) => e.id)).toEqual(['a']);
  });

  it('does not duplicate a ring-buffer entry when the publish echoes back through its own subscription', async () => {
    broker = new RedisEventBroker(REDIS_URL as string);
    broker.subscribe('ch', () => undefined);
    await wait(50);

    await broker.publish('ch', envelope({ id: 'a' }));
    await wait(100); // let the pub/sub round-trip land before asserting.

    expect(broker.recent('ch').map((e) => e.id)).toEqual(['a']);
  });

  it('reports connected once the Redis clients are up', async () => {
    broker = new RedisEventBroker(REDIS_URL as string);
    await wait(50);
    expect(broker.connected).toBe(true);
  });
});
