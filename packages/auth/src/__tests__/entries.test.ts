import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The server entries throw in a browser (auth.md §2): a bundler that builds a page resolves them to a file that does, and the root,
// which a page may use, imports nothing that could not run there.
const ROOT = path.join(import.meta.dirname, '../..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  exports: Record<string, Record<string, string>>;
};

describe('the package’s entries', () => {
  it.each(['./server', './next'])('%s resolves to a file that throws in a browser', (entry) => {
    expect(manifest.exports[entry]?.browser).toBe('./dist/browser.js');
    expect(readFileSync(path.join(ROOT, 'src/browser.ts'), 'utf8')).toMatch(/^throw new Error\(/m);
  });

  it('keeps the root free of imports that need a server', () => {
    for (const file of [
      'index.ts',
      'cookies.ts',
      'password-policy.ts',
      'return-to.ts',
      'canonical.ts',
    ]) {
      const source = readFileSync(path.join(ROOT, 'src', file), 'utf8');
      expect(source, file).not.toMatch(/from '(node:|better-auth|@sovereignfs\/(database|crypto))/);
      expect(source, file).not.toMatch(/from '\.\/(server|next)\//);
    }
  });
});
