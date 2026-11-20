import type { ExportHead } from './types.js';

/** The file name of an export (`contracts/export.md` §1): `sovereign-<host>[-<app>]-<time>-<kind>.<ext>`. */
export function exportFileName(
  head: ExportHead,
  host: string,
  extension: 'tar' | 'tar.age' | 'zip',
): string {
  const time = head.takenAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const safeHost = host.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
  const app = head.app ? `-${head.app}` : '';
  return `sovereign-${safeHost}${app}-${time}-${head.kind}.${extension}`;
}
