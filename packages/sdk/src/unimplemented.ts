import { NotImplementedError } from './errors';
import type { ActivityLogEntry } from './types';

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

/**
 * Activity log (RFC 0005) — **reserved surface, not yet implemented**.
 *
 * A plugin records a scoped activity event; the runtime mediates the write,
 * injecting the actor, tenant, and emitting plugin so a plugin cannot forge
 * actor identity. Plugin-sourced events are user-scoped (visible to the acting
 * user and the optional `subjectUserId`, plus admins via the platform feed).
 *
 * The `activity_log` table, capture points, runtime mediation, and the
 * Console/Account views are deferred to a future task; until then `log` throws
 * `NotImplementedError` — mirroring the other reserved surfaces.
 */
export const activity = {
  /** Record a scoped activity event for the current user (runtime-mediated). */
  log(_entry: ActivityLogEntry): Promise<void> {
    throw new NotImplementedError(
      'sdk.activity.log() (activity log, RFC 0005) is not implemented yet.',
    );
  },
};
