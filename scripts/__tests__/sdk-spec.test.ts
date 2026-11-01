/**
 * The SDK is bound by one rule: it offers nothing the Core API lacks. Until it exists, its specification is held to the same
 * rule: every capability it lists wraps an operation of the contract, and no operation of the contract is left out.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const spec = read('docs/specs/sdk.md');

type Operation = { operationId: string; security?: unknown[] };
const contract = parse(read('contracts/core-api/openapi.yaml')) as {
  paths: Record<string, Record<string, Operation>>;
};
const operations = Object.values(contract.paths).flatMap((methods) => Object.values(methods));

const section = (title: RegExp) => {
  const at = spec.search(title);
  expect(at).toBeGreaterThan(-1);
  const rest = spec.slice(at + 1);
  return rest.slice(0, rest.search(/\n## /));
};
const rows = (text: string) =>
  text
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim().replaceAll('`', '')),
    );

// The namespaces of the legacy `sdk` object, at its last release.
const LEGACY = [
  'auth',
  'db',
  'mailer',
  'platform',
  'data',
  'device',
  'storage',
  'directory',
  'notifications',
  'messages',
  'webhooks',
  'handoffs',
  'id',
  'jobs',
  'secrets',
  'crypto',
  'connections',
  'events',
  'activity',
  'portability',
  'plugins',
  'env',
  'email',
  'billing',
  'tools',
  'authz',
];

describe('the capabilities', () => {
  const capabilities = rows(section(/^## 8\. Capabilities/m)).filter((row) => row.length === 4);

  it('wrap only operations the contract has', () => {
    const known = operations.map((operation) => operation.operationId);
    expect(capabilities.length).toBeGreaterThan(0);
    for (const [method, , , operation] of capabilities) {
      expect(known, `${String(method)} wraps ${String(operation)}`).toContain(operation);
    }
  });

  it('leave no operation of the contract out', () => {
    const wrapped = capabilities.map((row) => row[3]);
    for (const { operationId } of operations) expect(wrapped).toContain(operationId);
  });
});

describe('the legacy SDK', () => {
  it('has a place for every namespace', () => {
    const mapped = rows(section(/^## 10\. From the legacy SDK/m)).map((row) => row[0]);
    expect([...mapped].sort()).toEqual([...LEGACY].sort());
  });
});

describe('where the specifications meet', () => {
  it('reads the variables an app is given', () => {
    const manifest = read('contracts/app-manifest.md');
    for (const name of ['_URL', '_CORE_URL', '_CORE_CLIENT_ID', '_CORE_CLIENT_SECRET']) {
      expect(spec, name).toContain(`\`<PREFIX>${name}\``);
      expect(manifest, name).toContain(`\`<PREFIX>${name}\``);
    }
  });

  it('agrees with core that an app token is confidential, and that the Directory needs a person', () => {
    const core = read('docs/specs/core-app.md');
    expect(core).toContain('#### 3.6.6 App tokens');
    expect(core).toMatch(/\*\*Confidential apps only\.\*\*/);
    expect(core).toMatch(/`directory` and `offline_access` can never be/);
    expect(spec).toContain('`sv.app.directory` MUST NOT exist');
  });
});
