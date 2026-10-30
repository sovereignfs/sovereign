import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name === '.next') return [];
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
const sources = [...files(path.join(root, 'src')), ...files(path.join(root, 'app'))].map(
  (file) => ({
    file: path.relative(root, file).split(path.sep).join('/'),
    text: readFileSync(file, 'utf8'),
  }),
);
const where = (pattern: RegExp) =>
  sources
    .filter(({ text }) => pattern.test(text))
    .map(({ file }) => file)
    .sort();

describe('the system actor (core-app §3.7.4)', () => {
  it('is built in one place: the entry point of sovereign-admin', () => {
    expect(where(/\bsystemActor\(/)).toEqual(['src/admin/main.ts', 'src/clients/system-actor.ts']);
  });

  it('is run as by the registry alone, and its session is given to the provider by nothing else', () => {
    expect(where(/\brunAsSystem\b/)).toEqual([
      'src/clients/registry.ts',
      'src/clients/system-actor.ts',
    ]);
    expect(where(/\bsystemSession\b/)).toEqual([
      'src/clients/system-actor.ts',
      'src/oauth/provider.ts',
    ]);
  });

  it('is imported by no route and no page: the code a request reaches does not know it', () => {
    expect(where(/system-actor/).filter((file) => file.startsWith('app/'))).toEqual([]);
    expect(
      where(/from '[^']*\/admin\/[^']*'/).filter((file) => !file.startsWith('src/admin/')),
    ).toEqual([]);
  });
});
