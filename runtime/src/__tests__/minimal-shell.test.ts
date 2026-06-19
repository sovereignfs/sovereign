import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';
import { describe, expect, it } from 'vitest';

/**
 * Parity tests for the `(minimal)` shell route group (RFC 0014).
 *
 * Asserts that the hand-written files that anchor the route group are committed
 * and present, so the generate step can compose `shell: "minimal"` plugins
 * into a chrome-free layout without them being accidentally deleted.
 */
const ROOT = findWorkspaceRoot();
const MINIMAL_DIR = join(ROOT, 'runtime', 'app', '(minimal)');

describe('(minimal) route group — committed file parity', () => {
  it('layout.tsx exists', () => {
    expect(existsSync(join(MINIMAL_DIR, 'layout.tsx'))).toBe(true);
  });

  it('minimal.module.css exists', () => {
    expect(existsSync(join(MINIMAL_DIR, 'minimal.module.css'))).toBe(true);
  });

  it('.gitignore exists', () => {
    expect(existsSync(join(MINIMAL_DIR, '.gitignore'))).toBe(true);
  });
});
