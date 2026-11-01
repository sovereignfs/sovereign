import { satisfies, validRange } from 'semver';
import { Failed, Refused } from './errors.js';
import { MANIFEST_LABEL, RELEASE } from './release.js';
import type { Registry } from './registry.js';
import { schemaProblems } from './suite/schema.js';
import type { HostedApp, Manifest } from './suite/types.js';

const MAX_BYTES = 64 * 1024;

/**
 * Reads an app's manifest (contracts/app-manifest.md §1): from the `https` address the operator gave, which wins when an image has
 * both, or from the label on the image, read from the registry without pulling it. Refuses one that does not meet the schema, one
 * whose version this toolkit does not read, and one whose `core` range leaves out the instance's core.
 */
export async function readManifest(
  name: string,
  app: Pick<HostedApp, 'image' | 'manifest'>,
  registry: Registry,
  coreVersion: string,
  fetchImpl: typeof fetch = fetch,
  /** The digest the image is pinned to, so the manifest read is the one that will run. */
  pinnedDigest?: string,
): Promise<Manifest> {
  let text: string | undefined;
  if (app.manifest) {
    text = await fetchText(app.manifest, fetchImpl);
  } else {
    const ref = pinnedDigest ? `${app.image.replace(/[:@][^/]*$/, '')}@${pinnedDigest}` : app.image;
    text = await registry.label(ref, MANIFEST_LABEL);
    if (text === undefined) {
      throw new Refused(
        `${app.image} has no ${MANIFEST_LABEL} label, so there is no manifest for ${name}.`,
        'Give the address of one with --manifest URL, or ask the app’s maker for an image that carries it.',
      );
    }
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Refused(`The manifest for ${name} is not JSON.`);
  }
  const version = (document as { manifest?: unknown } | null)?.manifest;
  if (typeof version === 'number' && !(RELEASE.manifests as readonly number[]).includes(version)) {
    throw new Refused(
      `The manifest for ${name} is version ${version}, which this toolkit does not read.`,
      'Use a newer toolkit: sv upgrade.',
    );
  }
  const problems = schemaProblems('manifest', document);
  if (problems.length > 0) {
    throw new Refused(
      `The manifest for ${name} is not valid:\n${problems.map((p) => `  ${p.at}: ${p.message}`).join('\n')}`,
    );
  }
  const manifest = document as Manifest;
  if (manifest.prefix === 'SV')
    throw new Refused(`The manifest for ${name} uses the prefix SV, which is core's.`);
  if (validRange(manifest.core) === null) {
    throw new Refused(
      `The manifest for ${name} has a core range that is not a version range: ${manifest.core}.`,
    );
  }
  if (!satisfies(coreVersion, manifest.core)) {
    throw new Refused(
      `${name} works with core ${manifest.core}, and this instance runs ${coreVersion}.`,
      'Use a version of the app that supports it, or move the instance to a core it supports.',
    );
  }
  return manifest;
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  if (!url.startsWith('https://')) throw new Refused('A manifest address must be https.');
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
  } catch (error) {
    throw new Failed(
      `Could not read ${url}: ${error instanceof Error ? error.message : 'unknown error'}.`,
    );
  }
  if (!response.ok) throw new Refused(`${url} answered ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Refused(`${url} is too large to be a manifest.`);
  return text;
}
