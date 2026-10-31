import { createHash } from 'node:crypto';
import { Failed, Refused } from './errors.js';

/** An image reference taken apart. */
export type ImageRef = {
  /** Where to ask: `ghcr.io`, or `registry-1.docker.io` for Docker Hub. */
  host: string;
  repository: string;
  /** A tag, or a digest (`sha256:...`). */
  reference: string;
};

/** Takes `ghcr.io/example/notes:1.2.0` apart. A bare name is Docker Hub's library. A reference with neither tag nor digest is refused. */
export function parseImageRef(ref: string): ImageRef {
  let rest = ref;
  let reference: string | undefined;
  const at = rest.indexOf('@');
  if (at !== -1) {
    reference = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  const slash = rest.lastIndexOf('/');
  const colon = rest.indexOf(':', slash === -1 ? 0 : slash);
  if (colon !== -1) {
    // `host:port/name` has a colon before the last slash; a tag has it after.
    reference ??= rest.slice(colon + 1);
    rest = rest.slice(0, colon);
  }
  if (!reference)
    throw new Refused(`${ref} has no tag or digest.`, 'Name a version, such as :1.2.0.');
  const parts = rest.split('/');
  const first = parts[0] as string;
  let host = 'registry-1.docker.io';
  if (parts.length > 1 && (first.includes('.') || first.includes(':') || first === 'localhost')) {
    host = first;
    parts.shift();
  } else if (first === 'docker.io') {
    parts.shift();
  }
  let repository = parts.join('/');
  if (host === 'registry-1.docker.io' && !repository.includes('/'))
    repository = `library/${repository}`;
  if (repository === '') throw new Refused(`${ref} is not an image reference.`);
  return { host: host === 'docker.io' ? 'registry-1.docker.io' : host, repository, reference };
}

const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

type ManifestDocument = {
  mediaType?: string;
  manifests?: { digest: string; platform?: { os?: string; architecture?: string } }[];
  config?: { digest: string };
};

/** Credentials for registries, in the form Docker keeps them (`~/.docker/config.json`'s `auths`). */
export type RegistryAuths = Record<string, { auth?: string }>;

const TIMEOUT_MS = 15_000;

/**
 * A client of the registry's HTTP API, for the two things the toolkit needs from an image without pulling it: the digest a tag
 * resolves to, and a label on it (operator-cli §4.2, §5). It speaks to public images anonymously, and uses the credentials Docker
 * keeps for a registry when there are any. It does not need Docker.
 */
export class Registry {
  readonly #fetch: typeof fetch;
  readonly #auths: RegistryAuths;
  readonly #tokens = new Map<string, string>();

  constructor(fetchImpl: typeof fetch = fetch, auths: RegistryAuths = {}) {
    this.#fetch = fetchImpl;
    this.#auths = auths;
  }

  /** The multi-architecture digest of an image, so what is pinned on one machine runs on another. */
  async digest(ref: string): Promise<string> {
    const image = parseImageRef(ref);
    const { digest } = await this.#manifest(image, image.reference);
    return digest;
  }

  /** One label of an image, or nothing if it has none. */
  async label(ref: string, name: string): Promise<string | undefined> {
    const image = parseImageRef(ref);
    let { document } = await this.#manifest(image, image.reference);
    if (document.manifests) {
      const chosen =
        document.manifests.find(
          (entry) => entry.platform?.os === 'linux' && entry.platform.architecture === 'amd64',
        ) ??
        document.manifests.find((entry) => entry.platform?.os !== 'unknown') ??
        document.manifests[0];
      if (!chosen) return undefined;
      ({ document } = await this.#manifest(image, chosen.digest));
    }
    const config = document.config?.digest;
    if (!config) return undefined;
    const response = await this.#get(image, `/v2/${image.repository}/blobs/${config}`, undefined);
    const body = (await response.json()) as { config?: { Labels?: Record<string, string> | null } };
    return body.config?.Labels?.[name];
  }

  async #manifest(image: ImageRef, reference: string) {
    const response = await this.#get(
      image,
      `/v2/${image.repository}/manifests/${reference}`,
      ACCEPT,
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest =
      response.headers.get('docker-content-digest') ??
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    return { digest, document: JSON.parse(bytes.toString('utf8')) as ManifestDocument };
  }

  async #get(image: ImageRef, pathname: string, accept: string | undefined): Promise<Response> {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(image.host);
    const url = `${local ? 'http' : 'https'}://${image.host}${pathname}`;
    const key = `${image.host}/${image.repository}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers: Record<string, string> = {};
      if (accept) headers.accept = accept;
      const token = this.#tokens.get(key);
      if (token) headers.authorization = `Bearer ${token}`;
      let response: Response;
      try {
        response = await this.#fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (error) {
        throw new Failed(
          `Could not reach ${image.host}: ${error instanceof Error ? error.message : 'unknown error'}.`,
          'Check the network, then run the command again.',
        );
      }
      if (response.status === 401 && attempt === 0) {
        await this.#authenticate(image, response.headers.get('www-authenticate'), key);
        continue;
      }
      if (response.status === 404) {
        throw new Refused(
          `${image.host}/${image.repository}:${image.reference} does not exist, or is private.`,
          'Check the name and version. For a private image, run docker login on this machine first.',
        );
      }
      if (!response.ok) {
        throw new Failed(`${image.host} answered ${response.status} for ${image.repository}.`);
      }
      return response;
    }
    throw new Refused(
      `${image.host} would not let this machine read ${image.repository}.`,
      'For a private image, run docker login on this machine first.',
    );
  }

  async #authenticate(image: ImageRef, challenge: string | null, key: string): Promise<void> {
    const params = Object.fromEntries(
      [...(challenge ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
    );
    if (!challenge?.toLowerCase().startsWith('bearer') || !params.realm) {
      throw new Refused(`${image.host} asked for a kind of sign-in this toolkit does not support.`);
    }
    const url = new URL(params.realm);
    if (params.service) url.searchParams.set('service', params.service);
    url.searchParams.set('scope', params.scope ?? `repository:${image.repository}:pull`);
    const headers: Record<string, string> = {};
    const stored = this.#auths[image.host]?.auth ?? this.#auths[`https://${image.host}`]?.auth;
    if (stored) headers.authorization = `Basic ${stored}`;
    const response = await this.#fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new Refused(
        `${image.host} would not give this machine access to ${image.repository}.`,
        'For a private image, run docker login on this machine first.',
      );
    }
    const body = (await response.json()) as { token?: string; access_token?: string };
    const token = body.token ?? body.access_token;
    if (!token) throw new Failed(`${image.host} gave no token.`);
    this.#tokens.set(key, token);
  }
}
