import type { ComposedMessage, SentMail, Transport } from './types.js';

export interface MemoryTransport extends Transport {
  /** Every message sent so far, oldest first. */
  readonly sent: readonly ComposedMessage[];
  /** The last message sent, for the common case. */
  readonly last: ComposedMessage | undefined;
  /** Makes the next `send` throw this, once: to test what a flow does when mail fails. */
  failNextWith(error: Error): void;
  clear(): void;
}

/** A transport that keeps messages in memory instead of sending them, for tests. */
export function createMemoryTransport(): MemoryTransport {
  const sent: ComposedMessage[] = [];
  let failure: Error | undefined;
  return {
    sent,
    get last() {
      return sent.at(-1);
    },
    failNextWith(error) {
      failure = error;
    },
    clear() {
      sent.length = 0;
      failure = undefined;
    },
    send(message): Promise<SentMail> {
      if (failure) {
        const error = failure;
        failure = undefined;
        return Promise.reject(error);
      }
      sent.push(message);
      return Promise.resolve({ accepted: message.to, rejected: [] });
    },
  };
}
