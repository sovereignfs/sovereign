import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';

/** Reads the platform version from the root package.json. Returns '0.0.0' on any failure. */
export function getPlatformVersion(): string {
  try {
    const raw = readFileSync(join(findWorkspaceRoot(), 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
