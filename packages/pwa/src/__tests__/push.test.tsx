// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushState, turnOffPush, turnOnPush, usePush, PushError } from '../push';

const KEY =
  'BEpmaLsHkWySX6IMIYecLSDjMgVeFCQp_3Yxsp1b30QPvlDK8kliS3RbbIC7biFIzPqy85bJ_UtZjRSYpcrZ5nU';
const OTHER =
  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const bytes = (key: string) => new Uint8Array(Buffer.from(key, 'base64url')).buffer;

type Sub = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer };
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn>;
};
const subscriptionWith = (
  key: string,
  endpoint = 'https://fcm.googleapis.com/fcm/send/1',
): Sub => ({
  endpoint,
  options: { applicationServerKey: bytes(key) },
  toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(() => Promise.resolve(true)),
});

let current: Sub | null;
let permission: NotificationPermission;
const subscribe = vi.fn();
const requests: { method: string; body?: unknown }[] = [];
let answers: Record<string, number>;

function device({ ua = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130', standalone = false } = {}) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
  window.matchMedia = ((query: string) => ({
    matches: standalone && query.includes('standalone'),
  })) as never;
}

beforeEach(() => {
  current = null;
  permission = 'default';
  requests.length = 0;
  answers = { GET: 200, POST: 204, DELETE: 204 };
  device();
  subscribe
    .mockReset()
    .mockImplementation(async ({ applicationServerKey }: { applicationServerKey: Uint8Array }) => {
      current = subscriptionWith(Buffer.from(applicationServerKey).toString('base64url'));
      return current;
    });
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription: () => Promise.resolve(current), subscribe },
      }),
    },
    configurable: true,
  });
  Object.defineProperty(window, 'PushManager', {
    value: function PushManager() {},
    configurable: true,
  });
  Object.defineProperty(window, 'Notification', {
    value: {
      get permission() {
        return permission;
      },
      requestPermission: vi.fn(async () => {
        if (permission === 'default') permission = 'granted';
        return permission;
      }),
    },
    configurable: true,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      requests.push({ method, ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) });
      const status = answers[method] ?? 500;
      if (method === 'GET') return Response.json({ available: true, publicKey: KEY }, { status });
      return new Response(null, { status });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
});

describe('pushState', () => {
  it('says what the device can do', async () => {
    expect(await pushState(KEY)).toBe('off');
    current = subscriptionWith(KEY);
    permission = 'granted';
    expect(await pushState(KEY)).toBe('on');
    // Made with another key: no push will reach it.
    expect(await pushState(OTHER)).toBe('off');
    permission = 'denied';
    expect(await pushState(KEY)).toBe('blocked');
  });

  it('asks an iPhone to add the app to its Home Screen first, and not once it has', async () => {
    device({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1' });
    expect(await pushState(KEY)).toBe('install-first');
    device({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)', standalone: true });
    expect(await pushState(KEY)).toBe('off');
  });

  it('is insecure off https, and unsupported with no push', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    expect(await pushState(KEY)).toBe('insecure');
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Reflect.deleteProperty(window, 'PushManager');
    expect(await pushState(KEY)).toBe('unsupported');
  });
});

describe('turnOnPush and turnOffPush', () => {
  it("asks permission first, subscribes with the app's key and gives the app the subscription", async () => {
    await turnOnPush();
    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });
    expect(requests.map((r) => r.method)).toEqual(['GET', 'POST']);
    expect(requests[1]?.body).toEqual(current?.toJSON());
  });

  it('replaces a subscription made with another key', async () => {
    const old = subscriptionWith(OTHER, 'https://fcm.googleapis.com/fcm/send/old');
    current = old;
    await turnOnPush(undefined, { publicKey: KEY });
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
    expect(requests.map((r) => r.method)).toEqual(['POST']);
  });

  it('gives the subscription up when the app does not take it', async () => {
    answers.POST = 503;
    await expect(turnOnPush()).rejects.toMatchObject({ reason: 'failed' });
    expect(current?.unsubscribe).toHaveBeenCalled();
  });

  it('says so when permission is refused, and subscribes to nothing', async () => {
    permission = 'denied';
    await expect(turnOnPush()).rejects.toBeInstanceOf(PushError);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('tells the app, then unsubscribes, and never throws', async () => {
    current = subscriptionWith(KEY);
    const sub = current;
    expect(await turnOffPush()).toBe(true);
    expect(requests).toEqual([{ method: 'DELETE', body: { endpoint: sub.endpoint } }]);
    expect(sub.unsubscribe).toHaveBeenCalled();
    answers.DELETE = 500;
    current = subscriptionWith(KEY);
    expect(await turnOffPush()).toBe(false);
    expect(current.unsubscribe).toHaveBeenCalled();
  });
});

describe('usePush', () => {
  it('starts as checking, then reads the app and the device', async () => {
    const { result } = renderHook(() => usePush());
    expect(result.current.state).toBe('checking');
    await waitFor(() => expect(result.current.state).toBe('off'));
    await act(() => result.current.turnOn());
    expect(result.current.state).toBe('on');
    await act(() => result.current.turnOff());
    expect(result.current.state).toBe('off');
    expect(result.current.error).toBeNull();
  });

  it('is unavailable when the app has no key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ available: false })),
    );
    const { result } = renderHook(() => usePush());
    await waitFor(() => expect(result.current.state).toBe('unavailable'));
  });

  it('shows a reason when turning on fails, and becomes blocked when refused', async () => {
    answers.POST = 500;
    const { result } = renderHook(() => usePush());
    await waitFor(() => expect(result.current.state).toBe('off'));
    await act(() => result.current.turnOn());
    expect(result.current.state).toBe('off');
    expect(result.current.error).toMatch(/couldn't be turned on/);
    permission = 'denied';
    await act(() => result.current.turnOn());
    expect(result.current.state).toBe('blocked');
  });
});
