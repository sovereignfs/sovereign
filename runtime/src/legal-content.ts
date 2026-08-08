import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const FALLBACK = '_This document could not be loaded._';

/**
 * Locate the workspace root the same way `@sovereignfs/db`'s
 * `findWorkspaceRoot()` does (nearest ancestor of cwd containing
 * `pnpm-workspace.yaml`, falling back to cwd) — reimplemented locally
 * rather than imported. Importing from `@sovereignfs/db` here pulls its
 * whole barrel (better-sqlite3, pg, drizzle-orm, plugin-client.ts, …) into
 * this page's React Server Component bundle, which hangs Next's dev
 * compiler indefinitely — every other caller of `findWorkspaceRoot()` in
 * this codebase is a route handler, never a page component, and that
 * turned out not to be a coincidence.
 */
function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

/** Reads a root-level legal document (RFC 0090). Falls back to a plain notice on any failure. */
function readLegalDoc(filename: 'PRIVACY.md' | 'TOS.md'): string {
  try {
    return readFileSync(join(findWorkspaceRoot(), filename), 'utf8');
  } catch {
    return FALLBACK;
  }
}

export function getPrivacyMarkdown(): string {
  return readLegalDoc('PRIVACY.md');
}

export function getTosMarkdown(): string {
  return readLegalDoc('TOS.md');
}
