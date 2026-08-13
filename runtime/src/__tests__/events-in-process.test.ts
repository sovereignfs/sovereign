import { afterEach, describe, expect, it } from 'vitest';
import { InProcessEventBroker } from '../brokers/events-in-process';
import type { EventEnvelope } from '../event-broker';

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

describe('InProcessEventBroker', () => {
  let broker: InProcessEventBroker;

  afterEach(async () => {
    await broker?.close();
  });

  it('delivers a published event to a subscriber on the same channel', async () => {
    broker = new InProcessEventBroker();
    const received: EventEnvelope[] = [];
    broker.subscribe('ch', (e) => received.push(e));

    await broker.publish('ch', envelope());

    expect(received).toHaveLength(1);
    expect(received[0]?.id).toBe('evt-1');
  });

  it('does not deliver to a subscriber on a different channel', async () => {
    broker = new InProcessEventBroker();
    const received: EventEnvelope[] = [];
    broker.subscribe('other-channel', (e) => received.push(e));

    await broker.publish('ch', envelope());

    expect(received).toHaveLength(0);
  });

  it('delivers to multiple subscribers on the same channel', async () => {
    broker = new InProcessEventBroker();
    const a: EventEnvelope[] = [];
    const b: EventEnvelope[] = [];
    broker.subscribe('ch', (e) => a.push(e));
    broker.subscribe('ch', (e) => b.push(e));

    await broker.publish('ch', envelope());

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('unsubscribe stops further delivery to that handler only', async () => {
    broker = new InProcessEventBroker();
    const a: EventEnvelope[] = [];
    const b: EventEnvelope[] = [];
    const unsubA = broker.subscribe('ch', (e) => a.push(e));
    broker.subscribe('ch', (e) => b.push(e));

    unsubA();
    await broker.publish('ch', envelope());

    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
  });

  it('records every publish into the ring buffer, independent of subscribers', async () => {
    broker = new InProcessEventBroker();
    // No subscribe() call at all — a poller with no realtime listener active.
    await broker.publish('ch', envelope({ id: 'a' }));
    await broker.publish('ch', envelope({ id: 'b' }));

    expect(broker.recent('ch').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('recent(channel, sinceId) forwards the cursor to the ring buffer', async () => {
    broker = new InProcessEventBroker();
    await broker.publish('ch', envelope({ id: 'a' }));
    await broker.publish('ch', envelope({ id: 'b' }));

    expect(broker.recent('ch', 'a').map((e) => e.id)).toEqual(['b']);
  });

  it('close() removes all listeners and clears the ring buffer', async () => {
    broker = new InProcessEventBroker();
    const received: EventEnvelope[] = [];
    broker.subscribe('ch', (e) => received.push(e));
    await broker.publish('ch', envelope({ id: 'a' }));

    await broker.close();

    expect(broker.recent('ch')).toEqual([]);
    // Publishing after close still works (EventEmitter isn't destroyed) but
    // no listener remains subscribed.
    await broker.publish('ch', envelope({ id: 'b' }));
    expect(received.map((e) => e.id)).toEqual(['a']);
  });
});
