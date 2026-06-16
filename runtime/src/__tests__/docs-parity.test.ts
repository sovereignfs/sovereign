import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';
import { manifestFieldNames, permissionSchema } from '@sovereignfs/manifest';
import { sdk } from '@sovereignfs/sdk';
import { describe, expect, it } from 'vitest';

/**
 * Documentation parity — pins the enumerable, drift-prone parts of the docs to
 * their source of truth so they cannot silently fall out of date (Task 0.5.06):
 * every manifest field, permission, and SDK surface must be documented in
 * `docs/plugin-development.md`, and every `.env.example` variable in
 * `docs/self-hosting.md`. Adding one without documenting it fails the suite.
 */
const ROOT = findWorkspaceRoot();
const read = (relPath: string): string => readFileSync(join(ROOT, relPath), 'utf8');

const pluginDoc = read('docs/plugin-development.md');
const selfHostingDoc = read('docs/self-hosting.md');
const envExample = read('.env.example');

/** Every variable key declared in .env.example (active or commented-out). */
const envVarKeys = [
  ...new Set(
    [...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1] as string),
  ),
];

describe('docs parity', () => {
  it('plugin-development.md documents every manifest field', () => {
    for (const field of manifestFieldNames) {
      expect(pluginDoc, `manifest field "${field}" is not documented`).toContain(field);
    }
  });

  it('plugin-development.md documents every permission', () => {
    for (const permission of permissionSchema.options) {
      expect(pluginDoc, `permission "${permission}" is not documented`).toContain(permission);
    }
  });

  it('plugin-development.md documents every SDK surface', () => {
    for (const surface of Object.keys(sdk)) {
      expect(pluginDoc, `sdk.${surface} is not documented`).toContain(surface);
    }
  });

  it('self-hosting.md documents every .env.example variable', () => {
    expect(envVarKeys.length).toBeGreaterThan(0);
    for (const key of envVarKeys) {
      expect(selfHostingDoc, `env var "${key}" is not documented`).toContain(key);
    }
  });
});
