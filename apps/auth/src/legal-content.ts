import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Locate the workspace root the same way `runtime/src/legal-content.ts`
 * does (nearest ancestor of cwd containing `pnpm-workspace.yaml`) —
 * reimplemented locally rather than shared, matching this app's existing,
 * deliberate independence from `runtime`/`@sovereignfs/db` (see
 * `docs/architecture-rules.md`).
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

function readLegalDoc(filename: 'PRIVACY.md' | 'TOS.md'): string {
  try {
    return readFileSync(join(findWorkspaceRoot(), filename), 'utf8');
  } catch {
    return '';
  }
}

/**
 * A stable identifier for "which version of the privacy policy and terms of
 * service" a user accepted (GDPR-8, terms-acceptance-as-contract-formation,
 * workstream 0021 leg 6) — a content hash of both root-level `PRIVACY.md`
 * and `TOS.md` (RFC 0090), not a hand-maintained version number. RFC 0090
 * never defined a version scheme of its own (only "versioned with the
 * platform's own source code" in prose) — hashing the actual content avoids
 * inventing a parallel scheme an operator would have to remember to bump
 * when they replace either file, and works identically for the shipped
 * default or an operator's own replacement.
 *
 * Deliberately computed server-side here, not accepted from the client —
 * `apps/auth`'s own `databaseHooks.user.create.before` is the only writer of
 * this value, the same trust boundary `timezone`'s `isValidTimezone` check
 * already enforces for a different field.
 */
export function getPolicyAcceptanceHash(): string {
  const privacy = readLegalDoc('PRIVACY.md');
  const tos = readLegalDoc('TOS.md');
  return createHash('sha256').update(`${privacy}\n---\n${tos}`).digest('hex');
}
