import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  generateOperations,
  generateSchema,
  readContract,
  type Contract,
} from '../lib/api-client-generator';
import { CONTRACT, generatedFiles } from '../lib/api-client-files';

const root = fileURLToPath(new URL('../..', import.meta.url));

const contract = (paths: Contract['paths'], schemas: Record<string, unknown> = {}): Contract =>
  ({ openapi: '3.1.0', paths, components: { schemas } }) as Contract;
const ok = (schema: Record<string, unknown>) =>
  ({ '200': { content: { 'application/json': { schema } } } }) as never;

describe('the types of the contract’s schemas', () => {
  const types = (schemas: Record<string, unknown>) => generateSchema(contract({}, schemas));

  it('writes an object with its required and optional fields, and what each says', () => {
    const out = types({
      Thing: {
        type: 'object',
        required: ['a'],
        properties: {
          a: { type: 'string', description: 'The a.' },
          b: { type: 'integer' },
          'c-d': { type: 'boolean' },
        },
      },
    });
    expect(out).toContain('export type Thing = {');
    expect(out).toMatch(/a: string;/);
    expect(out).toMatch(/b\?: number;/);
    expect(out).toMatch(/"c-d"\?: boolean;/);
    expect(out).toContain('The a.');
  });

  it('writes null, enums, arrays, unions, intersections and references', () => {
    const out = types({
      Kind: { type: 'string', enum: ['x', 'y'] },
      Maybe: { type: ['string', 'null'] },
      List: { type: 'array', items: { $ref: '#/components/schemas/Kind' } },
      Either: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      Both: { allOf: [{ $ref: '#/components/schemas/Kind' }, { type: 'string' }] },
      Many: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
    });
    expect(out).toContain('export type Kind = "x" | "y";');
    expect(out).toContain('export type Maybe = string | null;');
    expect(out).toContain('export type List = Kind[];');
    expect(out).toContain('export type Either = string | number;');
    expect(out).toContain('export type Both = Kind & string;');
    expect(out).toContain('export type Many = (string | number)[];');
  });

  it('writes a map for additionalProperties, and an object with nothing in it as a map to nothing', () => {
    const out = types({
      Map: { type: 'object', additionalProperties: { type: 'string' } },
      Empty: { type: 'object' },
    });
    expect(out).toContain('export type Map = Record<string, string>;');
    expect(out).toContain('export type Empty = Record<string, never>;');
  });

  it('refuses what it cannot describe, rather than guessing', () => {
    expect(() => types({ Odd: { description: 'no type' } })).toThrow(/cannot generate/);
    expect(() => types({ Odd: { type: 'array' } })).toThrow(/needs items/);
    expect(() => types({ Odd: { $ref: 'other.yaml#/X' } })).toThrow(/cannot resolve/);
  });
});

describe('the operations of the contract', () => {
  const operations = (paths: Contract['paths'], schemas: Record<string, unknown> = {}) =>
    generateOperations(contract(paths, schemas));

  it('gives each its method, path, and the scope it needs, and none for a public one', () => {
    const out = operations({
      '/a': {
        get: {
          operationId: 'getA',
          security: [{ bearer: ['x', 'y'] }],
          responses: ok({ type: 'string' }),
        },
      },
      '/b': { get: { operationId: 'getB', security: [], responses: ok({ type: 'string' }) } },
    });
    expect(out).toMatch(/getA: \{\s*method: 'GET',\s*path: '\/a',\s*scopes: \["x","y"\]/);
    expect(out).toMatch(/getB: \{\s*method: 'GET',\s*path: '\/b',\s*scopes: undefined/);
  });

  it('says which operations are safe to repeat: every read, and a write only when the contract says so', () => {
    const out = operations({
      '/a': { get: { operationId: 'getA', responses: ok({ type: 'string' }) } },
      '/b': { post: { operationId: 'postB', responses: ok({ type: 'string' }) } },
      '/c': {
        post: { operationId: 'postC', 'x-safe-to-repeat': true, responses: ok({ type: 'string' }) },
      },
    });
    expect(out).toMatch(/getA: \{[^}]*safeToRepeat: true/);
    expect(out).toMatch(/postB: \{[^}]*safeToRepeat: false/);
    expect(out).toMatch(/postC: \{[^}]*safeToRepeat: true/);
  });

  it('types the request: a required query, an optional one, path parameters and a body', () => {
    const out = operations({
      '/a/{id}': {
        post: {
          operationId: 'postA',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'n', in: 'query', schema: { type: 'integer' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { type: 'array', items: { type: 'string' } } },
            },
          },
          responses: ok({ type: 'boolean' }),
        },
      },
    });
    expect(out).toContain('params: { id: string }');
    expect(out).toContain('query: { q: string; n?: number }');
    expect(out).toContain('body: string[]');
    expect(out).toContain('response: boolean');
  });

  it('makes the whole query optional when none of it is required, and says undefined for no request at all', () => {
    const out = operations({
      '/a': {
        get: {
          operationId: 'getA',
          parameters: [{ name: 'n', in: 'query', schema: { type: 'integer' } }],
          responses: ok({ type: 'string' }),
        },
      },
      '/b': { get: { operationId: 'getB', responses: ok({ type: 'string' }) } },
    });
    expect(out).toContain('query?: { n?: number }');
    expect(out).toMatch(/getB: \{\s*request: undefined;/);
  });

  it('imports only the schemas an operation uses, and puts the operations in name order', () => {
    const out = operations(
      {
        '/z': {
          get: { operationId: 'zeta', responses: ok({ $ref: '#/components/schemas/Used' }) },
        },
        '/a': { get: { operationId: 'alpha', responses: ok({ type: 'string' }) } },
      },
      { Used: { type: 'string' }, Unused: { type: 'string' } },
    );
    expect(out).toContain("import type { Used } from './schema';");
    expect(out).not.toContain('Unused');
    expect(out.indexOf('alpha')).toBeLessThan(out.indexOf('zeta'));
  });

  it.each([
    ['no operationId', { responses: ok({ type: 'string' }) }, /needs an operationId/],
    [
      'a header parameter',
      {
        operationId: 'a',
        parameters: [{ name: 'h', in: 'header', schema: { type: 'string' } }],
        responses: ok({ type: 'string' }),
      },
      /header parameter/,
    ],
    [
      'a form body',
      {
        operationId: 'a',
        requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } },
        responses: ok({ type: 'string' }),
      },
      /JSON request body/,
    ],
    ['no 200 answer', { operationId: 'a', responses: { '204': {} } }, /needs a JSON answer/],
  ])('refuses %s', (_name, operation, message) => {
    expect(() => operations({ '/a': { get: operation as never } })).toThrow(message);
  });

  it('refuses two operations with one id', () => {
    expect(() =>
      operations({
        '/a': { get: { operationId: 'same', responses: ok({ type: 'string' }) } },
        '/b': { get: { operationId: 'same', responses: ok({ type: 'string' }) } },
      }),
    ).toThrow(/unique/);
  });
});

describe('reading a contract', () => {
  it('takes OpenAPI 3.1 and nothing else', () => {
    expect(readContract('openapi: 3.1.0\npaths: {}\n').openapi).toBe('3.1.0');
    expect(() => readContract('openapi: 3.0.3\npaths: {}\n')).toThrow(/3\.1/);
    expect(() => readContract('paths: {}\n')).toThrow(/3\.1/);
  });
});

describe('what is committed', () => {
  it('is exactly what the contract produces, so the client cannot be edited by hand or left behind', async () => {
    const files = await generatedFiles(root);
    expect(Object.keys(files).sort()).toEqual([
      'packages/api-client/src/generated/operations.ts',
      'packages/api-client/src/generated/schema.ts',
    ]);
    for (const [file, text] of Object.entries(files)) {
      expect(readFileSync(path.join(root, file), 'utf8'), file).toBe(text);
    }
  });
});

describe('the Core API contract', () => {
  const spec = parse(readFileSync(path.join(root, CONTRACT), 'utf8')) as Contract & {
    components: { schemas: Record<string, unknown>; responses: Record<string, unknown> };
  };
  const operations = Object.entries(spec.paths).flatMap(([route, item]) =>
    Object.entries(item).map(([method, operation]) => ({ route, method, operation })),
  );

  it('is OpenAPI 3.1, and every reference in it resolves', () => {
    expect(spec.openapi).toMatch(/^3\.1/);
    const text = readFileSync(path.join(root, CONTRACT), 'utf8');
    for (const [, ref] of text.matchAll(/\$ref: '([^']+)'/g)) {
      const [, section, name] = /^#\/components\/(schemas|responses)\/(.+)$/.exec(ref ?? '') ?? [];
      expect(section, `${ref} is a reference to a schema or a response`).toBeDefined();
      expect(
        (spec.components as Record<string, Record<string, unknown>>)[section ?? '']?.[name ?? ''],
        ref,
      ).toBeDefined();
    }
  });

  it('versions every path under /api/v1, except a public document under /.well-known', () => {
    for (const { route } of operations) expect(route).toMatch(/^\/(api\/v1\/|\.well-known\/)/);
  });

  it('gives each operation a unique id, a summary and a tag', () => {
    const ids = operations.map(
      ({ operation }) => (operation as { operationId?: string }).operationId,
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const { operation, route } of operations) {
      const found = operation as { operationId?: string; summary?: string; tags?: string[] };
      expect(found.operationId, route).toMatch(/^[a-z][A-Za-z0-9]*$/);
      expect(found.summary?.trim(), route).toBeTruthy();
      expect(found.tags?.length, route).toBeGreaterThan(0);
    }
  });

  it('says every failure with the one error body, and gives a protected operation its 401 and 403', () => {
    for (const { operation, route } of operations) {
      const found = operation as {
        security?: Record<string, string[]>[];
        responses: Record<string, { $ref?: string }>;
      };
      for (const [status, response] of Object.entries(found.responses)) {
        if (!status.startsWith('4') && !status.startsWith('5')) continue;
        const name = response.$ref?.split('/').pop() ?? '';
        const shared = spec.components.responses[name] as {
          content: Record<string, { schema: { $ref: string } }>;
        };
        expect(shared?.content['application/json']?.schema.$ref, `${route} ${status}`).toBe(
          '#/components/schemas/ErrorResponse',
        );
      }
      if (found.security?.some((requirement) => 'bearer' in requirement)) {
        expect(Object.keys(found.responses), route).toEqual(expect.arrayContaining(['401', '403']));
      }
    }
  });

  it('closes every object, so a field that is not in the contract is not in an answer', () => {
    const open: string[] = [];
    const walk = (value: unknown, where: string) => {
      if (Array.isArray(value)) return value.forEach((item, i) => walk(item, `${where}[${i}]`));
      if (!value || typeof value !== 'object') return;
      const object = value as Record<string, unknown>;
      if (object.type === 'object' && object.properties && object.additionalProperties !== false) {
        open.push(where);
      }
      for (const [key, child] of Object.entries(object)) walk(child, `${where}/${key}`);
    };
    walk(spec.paths, 'paths');
    walk(spec.components, 'components');
    expect(open).toEqual([]);
  });
});
