import { EventPayloadTooLargeError } from '@sovereignfs/sdk';

/**
 * Max serialized JSON payload size for one `sdk.events.publish()` call (RFC
 * 0045 security requirement: "payload size is capped"). Events have no
 * durable store to absorb an oversized payload — this is a hard per-call
 * limit, not a cumulative quota like `sdk.storage`'s.
 */
export const EVENT_PAYLOAD_MAX_BYTES = 16 * 1024;

/**
 * Throws `EventPayloadTooLargeError` when `payload`'s JSON-serialized form
 * exceeds `EVENT_PAYLOAD_MAX_BYTES`. `undefined` payloads (no `payload`
 * field at all) never serialize and always pass.
 */
export function assertEventPayloadSize(payload: unknown): void {
  if (payload === undefined) return;
  const byteLength = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (byteLength > EVENT_PAYLOAD_MAX_BYTES) {
    throw new EventPayloadTooLargeError(byteLength, EVENT_PAYLOAD_MAX_BYTES);
  }
}
