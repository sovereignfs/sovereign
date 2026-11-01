/**
 * Holds Core's handlers to the Core API contract (`contracts/core-api/openapi.yaml`). Every answer a handler gives is
 * checked against the schema the contract gives that operation and status, so a response that changes shape
 * without the contract changing fails, and so does one the contract does not describe at all.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const ROOT = path.join(import.meta.dirname, '../../../..');
const APP = path.join(ROOT, 'apps/core');

type Json = Record<string, unknown>;
type Operation = {
  operationId: string;
  security?: Record<string, string[]>[];
  responses: Record<string, Json>;
  'x-planned'?: boolean;
};

export const contract = parse(
  readFileSync(path.join(ROOT, 'contracts/core-api/openapi.yaml'), 'utf8'),
) as {
  paths: Record<string, Record<string, Operation>>;
  components: { responses: Record<string, Json> };
};

/** Every operation of the contract with where it is. */
export const operations = Object.entries(contract.paths).flatMap(([route, item]) =>
  Object.entries(item).map(([method, operation]) => ({
    route,
    method: method.toUpperCase(),
    operation,
  })),
);

const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
addFormats(ajv);
ajv.addSchema({ $id: 'contract', ...contract });

const pointer = (...parts: string[]) =>
  `contract#/${parts.map((part) => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;

/** The schema the contract gives the JSON answer of an operation with a status, or undefined when it gives none. */
function schemaFor(operationId: string, status: number) {
  const found = operations.find(({ operation }) => operation.operationId === operationId);
  if (!found) throw new Error(`the contract has no operation ${operationId}`);
  const response = found.operation.responses[String(status)];
  if (!response) return undefined;
  const ref = response.$ref;
  const base =
    typeof ref === 'string'
      ? ['components', 'responses', ref.split('/').pop() ?? '']
      : ['paths', found.route, found.method.toLowerCase(), 'responses', String(status)];
  return ajv.getSchema(pointer(...base, 'content', 'application/json', 'schema'));
}

/** What is wrong with `body` as the answer of `operationId` with `status`, in words; empty when it is as the contract says. */
export function contractProblems(operationId: string, status: number, body: unknown): string[] {
  const validate = schemaFor(operationId, status);
  if (!validate) return [`the contract gives ${operationId} no JSON answer for ${status}`];
  if (validate(body)) return [];
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
  );
}

/** Fails, saying what differs, unless `body` is what the contract says `operationId` answers with `status`. */
export function expectMatchesContract(operationId: string, status: number, body: unknown): void {
  const problems = contractProblems(operationId, status, body);
  if (problems.length > 0) {
    throw new Error(
      `${operationId} ${status} does not match the contract: ${problems.join('; ')}\n${JSON.stringify(body)}`,
    );
  }
}

/**
 * The routes the app serves for the Core API: everything under `app/api/v1`, and the `sovereign-` documents under
 * `app/.well-known` (the others there are OpenID Connect's, which the provider's own specification describes), as
 * the paths they answer.
 */
export function servedPaths(): string[] {
  const found: string[] = [];
  const walk = (directory: string, prefix: string) => {
    for (const name of readdirSync(directory)) {
      const full = path.join(directory, name);
      // A folder named [id] is the contract's {id}.
      if (statSync(full).isDirectory())
        walk(full, `${prefix}/${name.replace(/^\[(.+)\]$/, '{$1}')}`);
      else if (name === 'route.ts') found.push(prefix);
    }
  };
  for (const [directory, prefix] of [
    ['app/api/v1', '/api/v1'],
    ['app/.well-known', '/.well-known'],
  ] as const) {
    try {
      walk(path.join(APP, directory), prefix);
    } catch {
      // No route there yet.
    }
  }
  return found
    .filter(
      (route) => !route.startsWith('/.well-known/') || route.startsWith('/.well-known/sovereign-'),
    )
    .sort();
}
