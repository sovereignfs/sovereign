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
    const [labels, buildArgs] = dockerArgs(manifest, 'github').split('\n');
    expect(buildArgs).toBe('build-args=PORT=8080');
    expect(labels).toMatch(/^labels="/);
  });

  it('gives a label that the build action reads back as the manifest, commas and quotes in it', () => {
    // The action reads a list input as CSV (relaxed quotes): a field that opens with a quote ends at its closing one.
    const manifest = manifestOf({ port: 8080, description: 'Notes, "quoted", and more' });
    const labels = (dockerArgs(manifest, 'github').split('\n')[0] ?? '').slice('labels='.length);
    expect(labels.startsWith('"') && labels.endsWith('"')).toBe(true);
    const field = labels.slice(1, -1);
    expect(field.replace(/""/g, '"')).toBe(`${MANIFEST_LABEL}=${labelValue(manifest)}`);
    expect(field.replace(/""/g, '')).not.toContain('"');
  });
});
