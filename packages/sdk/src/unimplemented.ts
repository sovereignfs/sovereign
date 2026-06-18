import { NotImplementedError } from './errors';

/**
 * Surfaces declared in the SDK contract but reserved for post-v1. They throw
 * NotImplementedError so plugins fail loudly rather than silently misbehaving.
 */

export const storage = {
  put(_key: string, _value: Buffer): Promise<void> {
    throw new NotImplementedError('sdk.storage.put() is not implemented in Sovereign v1.');
  },
  get(_key: string): Promise<Buffer | null> {
    throw new NotImplementedError('sdk.storage.get() is not implemented in Sovereign v1.');
  },
};

export const notifications = {
  send(_userId: string, _message: string): Promise<void> {
    throw new NotImplementedError('sdk.notifications.send() is not implemented in Sovereign v1.');
  },
};

export const events = {
  publish(_event: string, _payload: unknown): Promise<void> {
    throw new NotImplementedError('sdk.events.publish() is not implemented in Sovereign v1.');
  },
  subscribe(_event: string, _handler: (payload: unknown) => void): void {
    throw new NotImplementedError('sdk.events.subscribe() is not implemented in Sovereign v1.');
  },
};
