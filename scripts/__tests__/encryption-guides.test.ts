/**
 * The guides say no more than RFC 0005 promises (workstream 0003, leg 11): none uses the word the project never uses for it, and
 * each guide that describes encryption the server cannot read says the feature is not yet audited. Until a code audit, that stays.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

/** What people read: the guides in docs/, the READMEs, and what the app template puts in a new app. Specs, RFCs and plans are not. */
function guides(): string[] {
  const top = readdirSync(path.join(root, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `docs/${name}`);
  const readmes = ['packages', 'tools']
    .flatMap((folder) =>
      readdirSync(path.join(root, folder)).map((name) => `${folder}/${name}/README.md`),
    )
    .filter((file) => existsSync(path.join(root, file)));
  const template = readdirSync(path.join(root, 'tools/create/template/app'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `tools/create/template/app/${name}`);
  return [
    'README.md',
    ...top,
    ...readmes,
    ...template,
    'tools/create/template/encryption/ENCRYPTION.md',
  ];
}

/** The guides that describe the feature to an operator or an app's author. */
const DESCRIBING = [
  'docs/deploying.md',
  'docs/operating.md',
  'docs/building-an-app.md',
  'docs/encrypting-an-app.md',
  'tools/create/template/encryption/ENCRYPTION.md',
];

describe('the guides on encryption', () => {
  it.each(guides())('%s never uses the word "zero-knowledge"', (file) => {
    expect(read(file).toLowerCase()).not.toMatch(/zero[\s-]?knowledge/);
  });

  it.each(DESCRIBING)('%s says the feature is not yet audited', (file) => {
    expect(read(file).toLowerCase()).toContain('not yet audited');
  });
});
