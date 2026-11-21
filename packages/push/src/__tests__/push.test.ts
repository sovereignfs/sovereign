import { createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatePushKeys, keyPairOf } from '../keys';
import { checkMessage, PushMessageError } from '../message';
import { sendPush } from '../send';
import { pushSettings, PushSettingsError, type PushSettings } from '../settings';
import { isPushServiceEndpoint, parseSubscription } from '../subscription';
import { vapidAuthorization } from '../vapid';
import { decryptAsBrowser } from './browser-side';

const b = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'));
// The receiver of RFC 8291's example, so a test can read what was sent.
const BROWSER = {
  publicKey:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  privateKey: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
};
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const subscription = { endpoint: ENDPOINT, p256dh: BROWSER.publicKey, auth: BROWSER.auth };
const keys = generatePushKeys();
const settings: PushSettings = { ...keys, subject: 'mailto:ops@example.com' };
const NOW = Date.UTC(2026, 10, 20, 12);

describe('keys', () => {
  it('makes a key whose public key follows from it', () => {
    expect(b(keys.privateKey)).toHaveLength(32);
    expect(b(keys.publicKey)).toHaveLength(65);
    expect(keyPairOf(keys.privateKey)?.publicKey).toBe(keys.publicKey);
  });

  it('refuses zero, the group order and anything not 32 bytes', () => {
    expect(keyPairOf(Buffer.alloc(32).toString('base64url'))).toBeUndefined();
    const order = Buffer.from(
      'ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551',
      'hex',
    );
    expect(keyPairOf(order.toString('base64url'))).toBeUndefined();
    const below = Buffer.from(order);
    below[31] = 0x50;
    expect(keyPairOf(below.toString('base64url'))).toBeDefined();
    expect(keyPairOf(Buffer.alloc(31, 1).toString('base64url'))).toBeUndefined();
    expect(keyPairOf(`${keys.privateKey}=`)).toBeUndefined();
    expect(keyPairOf(Buffer.alloc(32, 0xfb).toString('base64'))).toBeUndefined(); // + and / are not URL-safe
  });
});

describe('pushSettings', () => {
  it('is nothing with no key, and needs no other variable then', () => {
    expect(pushSettings('APP', {})).toBeUndefined();
    expect(pushSettings('APP', { APP_VAPID_PRIVATE_KEY: '' })).toBeUndefined();
  });

  it("derives the public key and takes the app's https address as the contact", () => {
    const read = pushSettings('APP', {
      APP_VAPID_PRIVATE_KEY: keys.privateKey,
      APP_URL: 'https://app.example.com',
    });
    expect(read).toEqual({ ...keys, subject: 'https://app.example.com' });
    expect(
      pushSettings('APP_', {
        APP_VAPID_PRIVATE_KEY: keys.privateKey,
        APP_URL: 'http://localhost:3000',
        APP_VAPID_SUBJECT: 'mailto:ops@example.com',
      })?.subject,
    ).toBe('mailto:ops@example.com');
  });

  it('refuses a key that is not one, never repeating it', () => {
    const wrong = 'not-a-key-at-all';
    const attempt = () =>
      pushSettings('APP', { APP_VAPID_PRIVATE_KEY: wrong, APP_URL: 'https://a.example' });
    expect(attempt).toThrow(PushSettingsError);
    expect(attempt).toThrow(/APP_VAPID_PRIVATE_KEY/);
    expect(attempt).not.toThrow(new RegExp(wrong));
  });

  it('refuses a localhost or malformed contact when a key is set', () => {
    for (const env of [
      { APP_URL: 'http://localhost:3000' },
      { APP_URL: 'https://localhost:3000' },
      { APP_URL: 'https://app.localhost' },
      { APP_VAPID_SUBJECT: 'https://127.0.0.1' },
      { APP_VAPID_SUBJECT: 'mailto:nobody' },
      { APP_VAPID_SUBJECT: 'ops@example.com' },
      {},
    ])
      expect(() => pushSettings('APP', { APP_VAPID_PRIVATE_KEY: keys.privateKey, ...env })).toThrow(
        PushSettingsError,
      );
  });

  it('reads the key from a file, dropping one trailing newline', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'push-'));
    const file = path.join(dir, 'key');
    writeFileSync(file, `${keys.privateKey}\r\n`);
    const env = { APP_VAPID_PRIVATE_KEY_FILE: file, APP_URL: 'https://a.example' };
    expect(pushSettings('APP', env)?.privateKey).toBe(keys.privateKey);
    expect(() => pushSettings('APP', { ...env, APP_VAPID_PRIVATE_KEY: keys.privateKey })).toThrow(
      /both set/,
    );
    expect(() =>
      pushSettings('APP', { ...env, APP_VAPID_PRIVATE_KEY_FILE: path.join(dir, 'missing') }),
    ).toThrow(/^APP_VAPID_PRIVATE_KEY_FILE names a file that cannot be read\.$/);
  });
});

describe('parseSubscription', () => {
  const json = {
    endpoint: ENDPOINT,
    expirationTime: null,
    keys: { p256dh: BROWSER.publicKey, auth: BROWSER.auth },
  };

  it('accepts what a browser gives, and keeps only the endpoint and keys', () => {
    expect(parseSubscription(json)).toEqual({ ok: true, subscription });
  });

  it('refuses anything else', () => {
    const cases: unknown[] = [
      null,
      [],
      { ...json, extra: 1 },
      { ...json, endpoint: 'http://fcm.googleapis.com/fcm/send/x' },
      { ...json, endpoint: 'https://evil.example/fcm' },
      { ...json, endpoint: 'https://fcm.googleapis.com.evil.example/x' },
      { ...json, endpoint: 'https://user:pw@fcm.googleapis.com/x' },
      { ...json, endpoint: 'https://fcm.googleapis.com:8443/x' },
      { ...json, endpoint: `https://fcm.googleapis.com/${'a'.repeat(2048)}` },
      { ...json, keys: { ...json.keys, p256dh: BROWSER.publicKey.slice(1) } },
      { ...json, keys: { ...json.keys, p256dh: `A${BROWSER.publicKey.slice(1)}` } }, // not 0x04
      { ...json, keys: { ...json.keys, auth: 'AAAA' } },
      { ...json, keys: { ...json.keys, more: 'x' } },
      { ...json, expirationTime: 'soon' },
    ];
    for (const value of cases)
      expect(parseSubscription(value).ok, JSON.stringify(value)).toBe(false);
  });

  it("matches a wildcard below the domain only, and takes an app's own list", () => {
    expect(isPushServiceEndpoint('https://web.push.apple.com/x')).toBe(true);
    expect(isPushServiceEndpoint('https://api.push.apple.com/x')).toBe(true);
    expect(isPushServiceEndpoint('https://push.apple.com/x')).toBe(false);
    expect(isPushServiceEndpoint('https://xpush.apple.com/x')).toBe(false);
    expect(isPushServiceEndpoint('https://push.example.net/x')).toBe(false);
    expect(isPushServiceEndpoint('https://push.example.net/x', ['push.example.net'])).toBe(true);
  });
});

describe('checkMessage', () => {
  it('keeps what a message names, and nothing more', () => {
    const extra = { title: 'Due', path: '/cards/1', other: 'x' } as unknown as Parameters<
      typeof checkMessage
    >[0];
    expect(checkMessage(extra)).toEqual({ title: 'Due', path: '/cards/1' });
  });

  it('refuses a message outside its limits', () => {
    for (const message of [
      { title: '' },
      { title: 'x'.repeat(121) },
      { title: 'a\nb' },
      { title: 'x', body: 'y'.repeat(501) },
      { title: 'x', path: 'https://evil.example/' },
      { title: 'x', path: '//evil.example/' },
      { title: 'x', path: '/\\evil.example' },
      { title: 'x', tag: 't'.repeat(101) },
      { title: 'x', data: { nested: {} } },
      { title: 'x', data: { n: Number.NaN } },
      { title: 'x', data: { big: 'z'.repeat(3000) } },
    ])
      expect(() => checkMessage(message as never), JSON.stringify(message)).toThrow(
        PushMessageError,
      );
    expect(checkMessage({ title: 'x', body: 'one\ntwo' }).body).toBe('one\ntwo');
  });
});

describe('the signed token (RFC 8292)', () => {
  it("verifies with the derived public key, for the endpoint's origin, for an hour", () => {
    const header = vapidAuthorization(ENDPOINT, settings, NOW);
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, jwt = '', k] = match ?? [];
    expect(k).toBe(settings.publicKey);
    const [head = '', claims = '', signature = ''] = jwt.split('.');
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: NOW / 1000 + 3600,
      sub: 'mailto:ops@example.com',
    });
    const point = b(settings.publicKey);
    const key = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: Buffer.from(point.subarray(1, 33)).toString('base64url'),
        y: Buffer.from(point.subarray(33)).toString('base64url'),
      },
      format: 'jwk',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${head}.${claims}`),
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });
});

describe('sendPush', () => {
  const sent: { url: string; init: RequestInit }[] = [];
  const answering =
    (status: number | Error): typeof fetch =>
    async (url, init) => {
      sent.push({ url: String(url), init: init ?? {} });
      if (status instanceof Error) throw status;
      return new Response(null, { status });
    };

  it('posts what the browser can read, signed, with a timeout and no redirect followed', async () => {
    sent.length = 0;
    const outcome = await sendPush({
      subscription,
      message: { title: 'A card is due', path: '/cards/7', tag: 'card-7' },
      settings,
      now: NOW,
      ttlSeconds: 600,
      fetch: answering(201),
    });
    expect(outcome).toBe('sent');
    const [request] = sent;
    expect(request?.url).toBe(ENDPOINT);
    expect(request?.init.method).toBe('POST');
    expect(request?.init.redirect).toBe('manual');
    expect(request?.init.signal).toBeInstanceOf(AbortSignal);
    const headers = request?.init.headers as Record<string, string>;
    expect(headers).toMatchObject({
      'content-encoding': 'aes128gcm',
      ttl: '600',
      urgency: 'normal',
    });
    expect(headers.authorization).toMatch(/^vapid t=.+, k=/);
    const body = request?.init.body as Uint8Array;
    const read = decryptAsBrowser(body, {
      privateKey: b(BROWSER.privateKey),
      publicKey: b(BROWSER.publicKey),
      auth: b(BROWSER.auth),
    });
    expect(JSON.parse(read)).toEqual({ title: 'A card is due', path: '/cards/7', tag: 'card-7' });
  });

  it('answers by what the push service says', async () => {
    const outcome = (status: number | Error) =>
      sendPush({
        subscription,
        message: { title: 'x' },
        settings,
        now: NOW,
        fetch: answering(status),
      });
    expect(await outcome(201)).toBe('sent');
    expect(await outcome(404)).toBe('gone');
    expect(await outcome(410)).toBe('gone');
    expect(await outcome(429)).toBe('retry');
    expect(await outcome(503)).toBe('retry');
    expect(await outcome(new TypeError('fetch failed'))).toBe('retry');
    expect(await outcome(301)).toBe('refused');
    expect(await outcome(400)).toBe('refused');
    expect(await outcome(403)).toBe('refused');
  });

  it('never sends to a host off the list, or keys that are not keys', async () => {
    sent.length = 0;
    expect(
      await sendPush({
        subscription: { ...subscription, endpoint: 'https://evil.example/x' },
        message: { title: 'x' },
        settings,
        now: NOW,
        fetch: answering(201),
      }),
    ).toBe('refused');
    expect(
      await sendPush({
        subscription: { ...subscription, p256dh: Buffer.alloc(65, 4).toString('base64url') },
        message: { title: 'x' },
        settings,
        now: NOW,
        fetch: answering(201),
      }),
    ).toBe('refused');
    expect(sent).toHaveLength(0);
  });

  it('gives up on a push service that does not answer in time', async () => {
    const slow: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    expect(
      await sendPush({
        subscription,
        message: { title: 'x' },
        settings,
        now: NOW,
        timeoutMs: 20,
        fetch: slow,
      }),
    ).toBe('retry');
  });
});
