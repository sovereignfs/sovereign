/**
 * Shared packages work with no core present (AGENTS.md): nothing in `@sovereignfs/crypto` imports from `apps/core`, so an app with no
 * core builds its vault from it alone.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = path.join(folder, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

it('imports nothing from apps/core', () => {
  const offenders = sources(SRC).filter((file) =>
    /from\s+['"][^'"]*(apps\/core|@sovereignfs\/core)/.test(readFileSync(file, 'utf8')),
  );
  expect(offenders).toEqual([]);
});
