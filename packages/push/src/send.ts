import { fromBase64Url, utf8 } from './bytes.js';
import { EncryptionError, encryptPush } from './encrypt.js';
import { checkMessage, PushMessageError, type PushMessage } from './message.js';
import type { PushSettings } from './settings.js';
import { isPushServiceEndpoint, PUSH_SERVICE_HOSTS, type Subscription } from './subscription.js';
import { vapidAuthorization } from './vapid.js';

/** How long a push service has to answer. */
export const SEND_TIMEOUT_MS = 10_000;

/**
 * What became of a push:
 * - `sent`: the push service took it (`201`).
 * - `gone`: the device is no longer subscribed (`404`, `410`); forget it.
 * - `retry`: worth trying again later (`429`, `5xx`, no answer in time, no network).
 * - `refused`: no try will change it (a host off the list, keys that are not keys, a message too large, any other answer).
 */
export type SendOutcome = 'sent' | 'gone' | 'retry' | 'refused';

export interface SendPushOptions {
  readonly subscription: Subscription;
  readonly message: PushMessage;
  readonly settings: PushSettings;
  /** Milliseconds since the epoch; the signed token's expiry counts from it. */
  readonly now: number;
  /** How long the push service keeps it for a device that is offline, in seconds. Default four hours. */
  readonly ttlSeconds?: number;
  readonly urgency?: 'very-low' | 'low' | 'normal' | 'high';
  /** The push services that may be sent to; default {@link PUSH_SERVICE_HOSTS}. */
  readonly hosts?: readonly string[];
  readonly timeoutMs?: number;
  /** For a test; default the global `fetch`. */
  readonly fetch?: typeof fetch;
}

/**
 * Encrypts a message to one device, signs for the app, and posts it to the device's push service. It never throws for what the push
 * service or the network does, and never logs: the outcome is all it says. A redirect is not followed, so nothing reaches a host
 * off the list.
 */
export async function sendPush(options: SendPushOptions): Promise<SendOutcome> {
  const { subscription, settings } = options;
  if (!isPushServiceEndpoint(subscription.endpoint, options.hosts ?? PUSH_SERVICE_HOSTS))
    return 'refused';
  const publicKey = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  if (!publicKey || !authSecret) return 'refused';

  let body: Uint8Array;
  try {
    body = encryptPush(utf8(JSON.stringify(checkMessage(options.message))), {
      publicKey,
      authSecret,
    });
  } catch (error) {
    if (error instanceof EncryptionError || error instanceof PushMessageError) return 'refused';
    throw error;
  }

  const ttl = Math.max(0, Math.floor(options.ttlSeconds ?? 4 * 60 * 60));
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(subscription.endpoint, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? SEND_TIMEOUT_MS),
      headers: {
        authorization: vapidAuthorization(subscription.endpoint, settings, options.now),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(ttl),
        urgency: options.urgency ?? 'normal',
      },
      body,
    });
  } catch {
    // No network, no answer in time: the next try may reach it.
    return 'retry';
  }
  // What the service said is not needed; reading none of it frees the connection.
  await response.body?.cancel().catch(() => undefined);
  const status = response.status;
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'retry';
  return 'refused';
}
