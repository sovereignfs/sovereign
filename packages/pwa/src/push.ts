'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Web Push from the page (RFC 0009 §2.2): what this device can do, and turning push on and off for it. The server's side is
 * `@sovereignfs/push`'s route; this reads its answers. Nothing here reads a browser global until it is called, and nothing asks for
 * permission unless a person pressed something.
 */

/**
 * What this device can do about push:
 * - `unsupported`: the browser has no service worker, push or notifications.
 * - `insecure`: the page is not on https (or localhost).
 * - `install-first`: an iPhone or iPad, where only an app added to the Home Screen gets pushes.
 * - `blocked`: the person said no, and only the browser's settings can change that.
 * - `off` / `on`: whether this device gets pushes from the app now.
 */
export type DevicePushState =
  'unsupported' | 'insecure' | 'install-first' | 'blocked' | 'off' | 'on';

/** What `usePush` reports: the device's state, `unavailable` when the app has no push, or `checking` before it knows. */
export type PushState = DevicePushState | 'unavailable' | 'checking';

/** The default route of `@sovereignfs/push`'s handlers. */
export const PUSH_ROUTE = '/api/push/subscription';

/** Why turning push on did not work. */
export class PushError extends Error {
  override readonly name = 'PushError';
  constructor(
    readonly reason: 'unavailable' | 'unsupported' | 'blocked' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

const READY_TIMEOUT_MS = 4000;

function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isInstalled(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

const hasPush = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** A key in URL-safe base64 as bytes. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const key = subscription.options?.applicationServerKey;
  if (!key) return true; // a browser that does not say: taken as the same
  const mine = keyBytes(publicKey);
  const theirs = new Uint8Array(key);
  return theirs.length === mine.length && theirs.every((byte, i) => byte === mine[i]);
}

/** The worker's registration, or `undefined` when none becomes ready (none registered, as in development). */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), READY_TIMEOUT_MS)),
  ]);
}

/**
 * What this device can do. With the app's `publicKey`, a subscription made with another key (the key was changed) is `off`, since
 * no push will reach it. Call it after mounting, never in render.
 */
export async function pushState(publicKey?: string): Promise<DevicePushState> {
  if (!window.isSecureContext) return 'insecure';
  if (isAppleMobile() && !isInstalled()) return 'install-first';
  if (!hasPush()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const found = await registration();
    const subscription = await found?.pushManager.getSubscription();
    if (!subscription) return 'off';
    if (publicKey && !sameKey(subscription, publicKey)) return 'off';
    return Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** The route's `GET`: whether the app has push, and its key. */
export async function pushAvailability(
  route = PUSH_ROUTE,
): Promise<{ available: false } | { available: true; publicKey: string }> {
  const reply = await fetch(route, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!reply.ok) throw new PushError('failed', 'The app could not be reached.');
  const body = (await reply.json()) as { available?: unknown; publicKey?: unknown };
  return body.available === true && typeof body.publicKey === 'string'
    ? { available: true, publicKey: body.publicKey }
    : { available: false };
}

/**
 * Turns push on for this device: asks for permission (call it from a tap, before anything else is awaited), subscribes with the app's
 * key, replacing a subscription made with another, and gives the subscription to the app. Throws {@link PushError}.
 */
export async function turnOnPush(
  route = PUSH_ROUTE,
  options: { publicKey?: string } = {},
): Promise<void> {
  if (!hasPush()) throw new PushError('unsupported', "This browser can't show notifications.");
  // First, while the tap still counts: Safari asks only from one.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError('blocked', 'Notifications were not allowed.');
  let publicKey = options.publicKey;
  if (!publicKey) {
    const availability = await pushAvailability(route);
    if (!availability.available)
      throw new PushError('unavailable', "This app doesn't send notifications.");
    publicKey = availability.publicKey;
  }
  const found = await registration();
  if (!found) throw new PushError('failed', 'The app is still starting. Try again in a moment.');
  let subscription = await found.pushManager.getSubscription();
  if (subscription && !sameKey(subscription, publicKey)) {
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
  }
  try {
    subscription ??= await found.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    });
  } catch {
    throw new PushError('failed', "Notifications couldn't be turned on. Try again.");
  }
  const reply = await fetch(route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  }).catch(() => undefined);
  if (!reply?.ok) {
    // A subscription the app did not take would only fill the push service's list.
    await subscription.unsubscribe().catch(() => undefined);
    throw new PushError('failed', "Notifications couldn't be turned on. Try again.");
  }
}

/**
 * Turns push off for this device: the app forgets it, then the browser gives it up. Never throws, so an app can call it before its
 * sign-out form is sent; it says whether the app was told.
 */
export async function turnOffPush(route = PUSH_ROUTE): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return true;
    const found = await registration();
    const subscription = await found?.pushManager.getSubscription();
    if (!subscription) return true;
    const reply = await fetch(route, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
    return reply?.ok === true;
  } catch {
    return false;
  }
}

export interface UsePush {
  state: PushState;
  /** A sentence to show beside the switch when turning it on or off did not work. */
  error: string | null;
  working: boolean;
  turnOn(): Promise<void>;
  turnOff(): Promise<void>;
}

/**
 * The state of push on this device and the two actions, for `PushControl` in `@sovereignfs/ui`. Starts as `checking` on the server
 * and the first render, so the markup is the same for everyone.
 */
export function usePush(route = PUSH_ROUTE): UsePush {
  const [state, setState] = useState<PushState>('checking');
  const [publicKey, setPublicKey] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const availability = await pushAvailability(route).catch(() => ({
        available: false as const,
      }));
      if (!live) return;
      if (!availability.available) {
        setState('unavailable');
        return;
      }
      setPublicKey(availability.publicKey);
      const found = await pushState(availability.publicKey);
      if (live) setState(found);
    })();
    return () => {
      live = false;
    };
  }, [route]);

  const turnOn = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      await turnOnPush(route, publicKey ? { publicKey } : {});
      setState('on');
    } catch (failure) {
      if (failure instanceof PushError && failure.reason === 'blocked') {
        setState(Notification.permission === 'denied' ? 'blocked' : 'off');
      } else if (failure instanceof PushError && failure.reason === 'unavailable') {
        setState('unavailable');
      } else {
        setError(
          failure instanceof PushError
            ? failure.message
            : "Notifications couldn't be turned on. Try again.",
        );
      }
    } finally {
      setWorking(false);
    }
  }, [route, publicKey]);

  const turnOff = useCallback(async () => {
    setWorking(true);
    setError(null);
    const told = await turnOffPush(route);
    setState('off');
    if (!told)
      setError("This device is off, but the app couldn't be told. It will stop on its own.");
    setWorking(false);
  }, [route]);

  return { state, error, working, turnOn, turnOff };
}
