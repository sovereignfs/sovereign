import { describe, expect, it } from 'vitest';
import { dockerArgs, labelValue, MANIFEST_LABEL } from '../label';
import { manifestOf } from './helpers';

describe('the label', () => {
  it('is the manifest with its white space removed, and reads back as the manifest', () => {
    const manifest = manifestOf();
    const value = labelValue(manifest);
    expect(value).not.toMatch(/\n| {2}/);
    expect(JSON.parse(value)).toEqual(manifest);
  });

  it('carries every character JSON allows without changing it', () => {
    const manifest = manifestOf({ name: `It's "Notes" \\ $HOME \`x\` ünï 日本 \u2028` });
    expect(JSON.parse(labelValue(manifest))).toEqual(manifest);
  });
});

describe('dockerArgs', () => {
  it('gives the label and the port as one shell line, and a shell reads it back as two arguments', () => {
    const manifest = manifestOf({ name: `It's a "name" with $dollars and \`ticks\`` });
    const line = dockerArgs(manifest);
    expect(line).toMatch(/^--label '.*' --build-arg 'PORT=3000'$/);
    // What a POSIX shell makes of the line: words, with the quotes taken off.
    const words = [...line.matchAll(/--[a-z-]+|'((?:[^']|'\\'')*)'/g)].map((m) =>
      m[1] === undefined ? m[0] : m[1].replace(/'\\''/g, "'"),
    );
    expect(words).toEqual([
      '--label',
      `${MANIFEST_LABEL}=${labelValue(manifest)}`,
      '--build-arg',
      'PORT=3000',
    ]);
  });

  it('gives the two lines of $GITHUB_OUTPUT for the build action', () => {
    const manifest = manifestOf({ port: 8080 });
    expect(dockerArgs(manifest, 'github')).toBe(
      `labels=${MANIFEST_LABEL}=${labelValue(manifest)}\nbuild-args=PORT=8080`,
    );
  });
});
