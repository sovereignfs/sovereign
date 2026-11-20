import type { PushMessage } from './message.js';
import type { Subscription } from './subscription.js';

/** The most devices an account has push on in; an eleventh replaces the one turned on longest ago. */
export const MAX_DEVICES = 10;

/** A push waiting to be sent to one device, as {@link PushStore.enqueue} receives it. */
export interface QueuedPush {
  readonly id: string;
  readonly account: string;
  /** The device it is for: a push is for a device, and goes when the device does. */
  readonly endpoint: string;
  readonly message: PushMessage;
  /** When it may next be sent, in milliseconds since the epoch. */
  readonly dueAt: number;
  /** After this it is not worth sending. */
  readonly expiresAt: number;
}

/** A push claimed for sending: the row, how many times it has now been claimed, and the device's subscription with its keys. */
export interface ClaimedPush extends QueuedPush {
  /** Counting this claim: 1 the first time. */
  readonly attempts: number;
  readonly subscription: Subscription;
}

/**
 * Where an app keeps its devices and its waiting pushes, in its own database (RFC 0009 §1.4; the pattern of sdk §9.1). Every method
 * names the account where it acts for one: another account's device is not found, removed or listed. The device's keys (`p256dh`,
 * `auth`) are the app's to seal under its own key; the store gives them back opened. `@sovereignfs/push/testing` has an in-memory
 * store and the conformance suite every store passes.
 */
export interface PushStore {
  /**
   * Turns push on for a device, for this account. An endpoint already saved is replaced (its keys, its account, its time); one another
   * account had becomes this one's, and that account's waiting pushes for it go. Over {@link MAX_DEVICES}, the account's device turned
   * on longest ago goes, with its waiting pushes.
   */
  saveDevice(account: string, subscription: Subscription, now: number): Promise<void>;
  /** Turns push off for a device of this account, and its waiting pushes go. Another account's device is untouched. */
  removeDevice(account: string, endpoint: string): Promise<void>;
  /** The account's devices, oldest first. */
  devices(account: string): Promise<Subscription[]>;
  /** Every device and waiting push of an account: for an account that is deleted. */
  removeAccount(account: string): Promise<void>;
  /** The push service said the device is gone (`404`, `410`): it goes, with its waiting pushes, whoever's it was. */
  forget(endpoint: string): Promise<void>;

  /** Adds waiting pushes, in the transaction of the change that raised them. */
  enqueue(items: readonly QueuedPush[]): Promise<void>;
  /**
   * Up to `batch` pushes due by `now` and not held, oldest due first, each held for `leaseMs` and its attempts counted, with its
   * device's subscription. A row claimed by one call is not returned by another until its lease ends.
   */
  claim(now: number, leaseMs: number, batch: number): Promise<ClaimedPush[]>;
  /** Sent: it goes. */
  done(id: string): Promise<void>;
  /** Not sent this time: due again at `at`, and no longer held. */
  later(id: string, at: number): Promise<void>;
  /** Given up on: it goes. */
  drop(id: string): Promise<void>;
}
