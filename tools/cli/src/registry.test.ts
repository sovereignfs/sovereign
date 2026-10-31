import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Failed, Refused } from './errors.js';
import { parseImageRef, Registry } from './registry.js';

describe('taking an image reference apart', () => {
  it.each([
    ['ghcr.io/example/notes:1.2.0', 'ghcr.io', 'example/notes', '1.2.0'],
    ['postgres:18', 'registry-1.docker.io', 'library/postgres', '18'],
    ['caddy:2.10', 'registry-1.docker.io', 'library/caddy', '2.10'],
    ['docker.io/someone/thing:3', 'registry-1.docker.io', 'someone/thing', '3'],
    ['someone/thing:3', 'registry-1.docker.io', 'someone/thing', '3'],
    ['localhost:5000/app:1', 'localhost:5000', 'app', '1'],
    ['registry.example.com:5000/a/b:v1', 'registry.example.com:5000', 'a/b', 'v1'],
    [`ghcr.io/e/n@sha256:${'a'.repeat(64)}`, 'ghcr.io', 'e/n', `sha256:${'a'.repeat(64)}`],
  ])('%s', (ref, host, repository, reference) => {
    expect(parseImageRef(ref)).toEqual({ host, repository, reference });
  });

  it('refuses a reference with neither a tag nor a digest', () => {
    expect(() => parseImageRef('ghcr.io/example/notes')).toThrow(Refused);
  });
});

const sha = (text: string | Buffer) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

describe('a registry', () => {
  const requests: { path: string; authorization: string | undefined }[] = [];
  let server: http.Server;
  let host: string;
  const MANIFEST_LABEL = 'io.github.sovereignfs.app-manifest';
  const label = JSON.stringify({ manifest: 1, prefix: 'NOTES' });
  const config = Buffer.from(
    JSON.stringify({ config: { Labels: { [MANIFEST_LABEL]: label, other: 'x' } } }),
  );
  const amd = Buffer.from(
    JSON.stringify({
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { digest: sha(config) },
    }),
  );
  const arm = Buffer.from(
    JSON.stringify({
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { digest: sha('arm') },
    }),
  );
  const index = Buffer.from(
    JSON.stringify({
      mediaType: 'application/vnd.oci.image.index.v1+json',
      manifests: [
        { digest: sha(arm), platform: { os: 'linux', architecture: 'arm64' } },
        { digest: sha(amd), platform: { os: 'linux', architecture: 'amd64' } },
      ],
    }),
  );
  const single = Buffer.from(JSON.stringify({ config: { digest: sha(config) } }));

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const url = request.url ?? '';
      requests.push({ path: url, authorization: request.headers.authorization });
      const send = (
        status: number,
        body: Buffer | string,
        headers: Record<string, string> = {},
      ) => {
        response.writeHead(status, headers);
        response.end(body);
      };
      if (url.startsWith('/token')) return send(200, JSON.stringify({ token: 'tok' }));
      const guarded = url.includes('/private/');
      if (guarded && request.headers.authorization !== 'Bearer tok') {
        return send(401, '', {
          'www-authenticate': `Bearer realm="http://${host}/token",service="registry",scope="repository:private/app:pull"`,
        });
      }
      if (url.endsWith('/manifests/2'))
        return send(200, index, { 'docker-content-digest': sha(index) });
      if (url.endsWith(`/manifests/${sha(amd)}`)) return send(200, amd);
      if (url.endsWith(`/manifests/${sha(arm)}`)) return send(200, arm);
      if (url.endsWith('/manifests/single')) return send(200, single);
      if (url.endsWith('/manifests/1')) return send(200, index);
      if (url.endsWith(`/blobs/${sha(config)}`)) return send(200, config);
      return send(404, '');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('says the digest of the index a tag names, which is the one that runs on any machine', async () => {
    expect(await new Registry().digest(`${host}/app:2`)).toBe(sha(index));
  });

  it('works out a digest from the body when the registry does not send one', async () => {
    expect(await new Registry().digest(`${host}/app:1`)).toBe(sha(index));
  });

  it('reads a label of the amd64 image of an index, without pulling it', async () => {
    expect(await new Registry().label(`${host}/app:2`, MANIFEST_LABEL)).toBe(label);
  });

  it('reads a label of an image that is not an index, and says nothing for a label it does not have', async () => {
    const registry = new Registry();
    expect(await registry.label(`${host}/app:single`, MANIFEST_LABEL)).toBe(label);
    expect(await registry.label(`${host}/app:single`, 'nope')).toBeUndefined();
  });

  it('gets a token when the registry asks for one, and uses it on the next request', async () => {
    requests.length = 0;
    const registry = new Registry();
    expect(await registry.digest(`${host}/private/app:2`)).toBe(sha(index));
    expect(requests.some((r) => r.path.startsWith('/token'))).toBe(true);
    const manifests = requests.filter((r) => r.path.includes('/manifests/'));
    expect(manifests[0]?.authorization).toBeUndefined();
    expect(manifests[1]?.authorization).toBe('Bearer tok');
  });

  it('refuses, naming the image, when there is none', async () => {
    await expect(new Registry().digest(`${host}/app:nothing`)).rejects.toThrow(Refused);
    await expect(new Registry().digest(`${host}/app:nothing`)).rejects.toThrow(
      'does not exist, or is private',
    );
  });

  it('fails, with a way to go on, when the registry cannot be reached', async () => {
    const error = await new Registry().digest('127.0.0.1:1/app:2').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Failed);
    expect((error as Failed).message).toContain('Could not reach 127.0.0.1:1');
  });

  it('sends the credentials Docker keeps, when it is asked to sign in', async () => {
    requests.length = 0;
    const auth = Buffer.from('someone:pass').toString('base64');
    await new Registry(fetch, { [host]: { auth } }).digest(`${host}/private/app:2`);
    expect(requests.find((r) => r.path.startsWith('/token'))?.authorization).toBe(`Basic ${auth}`);
  });
});
