import { readFileSync } from 'node:fs';
import path from 'node:path';
import { operations } from '@sovereignfs/api-client';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import type { Environment } from '../transport';
import type { TokenStore } from '../tokens';

const ROOT = path.join(import.meta.dirname, '../../../..');

type Json = Record<string, unknown>;
type Operation = {
  operationId: string;
  responses: Record<string, Json>;
  'x-planned'?: boolean;
};
const contract = parse(
  readFileSync(path.join(ROOT, 'contracts/core-api/openapi.yaml'), 'utf8'),
) as {
  paths: Record<string, Record<string, Operation>>;
};

/** The operations the contract describes and core serves: a planned one is the contract's, and not yet the SDK's. */
export const servedOperationIds = (): string[] =>
  Object.values(contract.paths)
    .flatMap((item) => Object.values(item))
    .filter((operation) => operation['x-planned'] !== true)
    .map((operation) => operation.operationId)
    .sort();

const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
addFormats(ajv);
ajv.addSchema({ $id: 'contract', ...contract });

const pointer = (...parts: string[]) =>
  `contract#/${parts.map((part) => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;

/** What is wrong with `body` as the answer of an operation with a status, or nothing when it is as the contract says. */
export function contractProblems(operationId: string, status: number, body: unknown): string[] {
  const found = Object.entries(contract.paths).flatMap(([route, item]) =>
    Object.entries(item)
      .filter(([, operation]) => operation.operationId === operationId)
      .map(([method, operation]) => ({ route, method, operation })),
  )[0];
  if (!found) return [`the contract has no operation ${operationId}`];
  const response = found.operation.responses[String(status)];
  if (!response) return [`the contract gives ${operationId} no ${status}`];
  const ref = response.$ref;
  const base =
    typeof ref === 'string'
      ? ['components', 'responses', ref.split('/').pop() ?? '']
      : ['paths', found.route, found.method, 'responses', String(status)];
  const validate = ajv.getSchema(pointer(...base, 'content', 'application/json', 'schema'));
  if (!validate) return [`the contract gives ${operationId} ${status} no JSON answer`];
  if (validate(body)) return [];
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
  );
}

/** Which operation of the contract a request is, or nothing for the token endpoint and discovery. */
export function operationOf(method: string, pathname: string): string | undefined {
  return Object.entries(operations).find(
    ([, operation]) => operation.method === method && operation.path === pathname,
  )?.[0];
}

/**
 * Wraps a `fetch` so that every answer it gives to an operation of the contract is checked against it, and a mismatch
 * is thrown into the request. Wrapping the fake core with this is what holds the fake's answers to the contract (sdk §11).
 */
export function checkedAgainstContract(inner: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const reply = await inner(input, init);
    const operation = operationOf(request.method, new URL(request.url).pathname);
    if (
      operation &&
      !reply.headers.has('x-fake-failure') &&
      reply.headers.get('content-type')?.includes('json')
    ) {
      const problems = contractProblems(operation, reply.status, await reply.clone().json());
      if (problems.length > 0) {
        throw new Error(
          `${operation} ${reply.status} does not match the contract: ${problems.join('; ')}`,
        );
      }
    }
    return reply;
  }) as typeof fetch;
}

/** A clock a test moves: sleeping moves it, so no test waits for real. */
export function clock(start = Date.now()) {
  const state = { time: start, slept: [] as number[] };
  const environment: Environment = {
    now: () => state.time,
    sleep: (ms) => {
      state.slept.push(ms);
      state.time += ms;
      return Promise.resolve();
    },
    // Half way through the jitter, so a test can say how long a pause is.
    random: () => 0.5,
  };
  return { state, environment, advance: (ms: number) => void (state.time += ms) };
}

/** A token store with a conditional update, as the specification asks, and a lock when asked. */
export function memoryStore(
  options: { lock?: boolean; failWrites?: boolean; deletes?: boolean } = {},
) {
  const tokens = new Map<string, string>();
  const writes: { sub: string; next: string; previous: string | undefined }[] = [];
  const queues = new Map<string, Promise<unknown>>();
  const store: TokenStore = {
    read: (sub) => tokens.get(sub),
    write: (sub, next, previous) => {
      writes.push({ sub, next, previous });
      if (options.failWrites) return false;
      if (tokens.get(sub) !== previous) return false;
      tokens.set(sub, next);
      return true;
    },
    ...(options.deletes
      ? {
          delete: (sub: string) => {
            tokens.delete(sub);
          },
        }
      : {}),
    ...(options.lock
      ? {
          lock: <T>(sub: string, work: () => Promise<T>): Promise<T> => {
            const before = queues.get(sub) ?? Promise.resolve();
            const run = before.then(work, work);
            queues.set(
              sub,
              run.catch(() => undefined),
            );
            return run;
          },
        }
      : {}),
  };
  return { store, tokens, writes };
}

/** The settings of the fake core, as `createSovereign` takes them. */
export const settingsFor = (core: {
  url: string;
  credentials: { clientId: string; clientSecret: string };
}) => ({
  appUrl: 'https://notes.sovereign.local',
  coreUrl: core.url,
  clientId: core.credentials.clientId,
  clientSecret: core.credentials.clientSecret,
});
