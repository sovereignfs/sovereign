import { createServer, type Http2Server } from 'node:http2';
import { generateKeyPairSync } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const TEST_KEY_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

beforeEach(() => {
  process.env.APNS_KEY = TEST_KEY_PEM;
  process.env.APNS_KEY_ID = 'TESTKEYID1';
  process.env.APNS_TEAM_ID = 'TESTTEAMID';
  process.env.APNS_BUNDLE_ID = 'fs.sovereign.mobile';
});

afterEach(() => {
  delete process.env.APNS_KEY;
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_BUNDLE_ID;
  delete process.env.APNS_USE_SANDBOX;
});

describe('apnsJwt', () => {
  it('produces a well-formed ES256 JWT with the configured kid/iss', async () => {
    const { apnsJwt } = await import('../apns');
    const { apnsConfig } = await import('../config');
    const jwt = apnsJwt(apnsConfig());
    const [headerB64, payloadB64, signatureB64] = jwt.split('.');

    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    expect(header).toEqual({ alg: 'ES256', kid: 'TESTKEYID1' });

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    expect(payload.iss).toBe('TESTTEAMID');
    expect(typeof payload.iat).toBe('number');

    // ES256/JWS requires the raw 64-byte r‖s signature, not DER.
    expect(Buffer.from(signatureB64, 'base64url').length).toBe(64);
  });

  it('caches the token across calls within the lifetime window', async () => {
    const { apnsJwt } = await import('../apns');
    const { apnsConfig } = await import('../config');
    const config = apnsConfig();
    expect(apnsJwt(config)).toBe(apnsJwt(config));
  });

  it('regenerates when the key id changes', async () => {
    const { apnsJwt } = await import('../apns');
    const { apnsConfig } = await import('../config');
    const first = apnsJwt(apnsConfig());
    process.env.APNS_KEY_ID = 'DIFFERENTKID';
    const second = apnsJwt(apnsConfig());
    expect(second).not.toBe(first);
  });
});

/**
 * Real `node:http2` round-trips against a local server standing in for
 * Apple's provider API — verifies the actual request shape (method, path,
 * headers, body) and response-parsing logic, not just that the code
 * compiles. `sendApnsPush`'s `originOverride` param exists solely for this.
 */
describe('sendApnsPush (real local HTTP/2 server)', () => {
  let server: Http2Server;
  let origin: string;
  let received: {
    path?: string;
    headers?: Record<string, string | string[] | undefined>;
    body?: string;
  };

  function startServer(respond: (stream: import('node:http2').ServerHttp2Stream) => void) {
    server = createServer();
    server.on('stream', (stream, headers) => {
      let body = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        body += chunk;
      });
      stream.on('end', () => {
        received = { path: headers[':path'] as string, headers, body };
        respond(stream);
      });
    });
    return new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        origin = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  }

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('resolves "sent" on a 200 response, with correct request shape', async () => {
    await startServer((stream) => {
      stream.respond({ ':status': 200 });
      stream.end('{}');
    });

    const { sendApnsPush } = await import('../apns');
    const result = await sendApnsPush('device-token-abc', 'ZW5jcnlwdGVkLWJsb2I=', origin);

    expect(result).toBe('sent');
    expect(received.path).toBe('/3/device/device-token-abc');
    expect(received.headers?.['apns-topic']).toBe('fs.sovereign.mobile');
    expect(received.headers?.['apns-push-type']).toBe('alert');
    expect(String(received.headers?.authorization)).toMatch(/^bearer /);
    const body = JSON.parse(received.body ?? '{}');
    expect(body.encryptedPayload).toBe('ZW5jcnlwdGVkLWJsb2I=');
    expect(body.aps['mutable-content']).toBe(1);
  });

  it('resolves "invalid_token" on Apple\'s BadDeviceToken reason', async () => {
    await startServer((stream) => {
      stream.respond({ ':status': 400 });
      stream.end(JSON.stringify({ reason: 'BadDeviceToken' }));
    });

    const { sendApnsPush } = await import('../apns');
    const result = await sendApnsPush('bad-token', 'cGF5bG9hZA==', origin);
    expect(result).toBe('invalid_token');
  });

  it('resolves "invalid_token" on Apple\'s Unregistered reason', async () => {
    await startServer((stream) => {
      stream.respond({ ':status': 410 });
      stream.end(JSON.stringify({ reason: 'Unregistered' }));
    });

    const { sendApnsPush } = await import('../apns');
    const result = await sendApnsPush('gone-token', 'cGF5bG9hZA==', origin);
    expect(result).toBe('invalid_token');
  });

  it('resolves "failed" on an unrelated error reason', async () => {
    await startServer((stream) => {
      stream.respond({ ':status': 403 });
      stream.end(JSON.stringify({ reason: 'InvalidProviderToken' }));
    });

    const { sendApnsPush } = await import('../apns');
    const result = await sendApnsPush('device-token', 'cGF5bG9hZA==', origin);
    expect(result).toBe('failed');
  });

  it('resolves "failed" on a non-JSON error body', async () => {
    await startServer((stream) => {
      stream.respond({ ':status': 500 });
      stream.end('internal server error');
    });

    const { sendApnsPush } = await import('../apns');
    const result = await sendApnsPush('device-token', 'cGF5bG9hZA==', origin);
    expect(result).toBe('failed');
  });

  it('rejects when the server is unreachable', async () => {
    const { sendApnsPush } = await import('../apns');
    await expect(
      sendApnsPush('device-token', 'cGF5bG9hZA==', 'http://127.0.0.1:1'),
    ).rejects.toBeInstanceOf(Error);
  });
});
