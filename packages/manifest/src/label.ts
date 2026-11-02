import type { Manifest } from './types';

/** The label an app's image carries its manifest in (`contracts/app-manifest.md` §1). */
export const MANIFEST_LABEL = 'io.github.sovereignfs.app-manifest';

/** The file an app's manifest is, at the root of its source. */
export const MANIFEST_FILE = 'sovereign.manifest.json';

/** The label's value: the manifest as it is, with its white space removed. */
export function labelValue(manifest: Manifest): string {
  return JSON.stringify(manifest);
}

export type DockerArgsFormat = 'shell' | 'github';

/**
 * What an image build is given from the manifest: the label, and the port as the build argument `PORT`, which the Dockerfile sets and
 * exposes, so that the number is written in one place.
 *
 * `shell` is one line of quoted words for `eval "docker build $(sovereign-manifest docker-args) ."`. `github` is two lines in the form of
 * `$GITHUB_OUTPUT`, `labels` and `build-args`, for `docker/build-push-action`. That action reads a list input as CSV, where a bare label
 * would lose the quotes of every string that follows a comma, so the label is one quoted field with its own quotes doubled.
 */
export function dockerArgs(manifest: Manifest, format: DockerArgsFormat = 'shell'): string {
  const label = `${MANIFEST_LABEL}=${labelValue(manifest)}`;
  const port = `PORT=${manifest.port}`;
  return format === 'github'
    ? `labels="${label.replace(/"/g, '""')}"\nbuild-args=${port}`
    : `--label ${quote(label)} --build-arg ${quote(port)}`;
}

/** One word for a POSIX shell: in single quotes, which hold everything but a single quote. */
function quote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}
