/**
 * Turns the Core API contract (`spec/core-api/openapi.yaml`) into the typed pieces of `packages/api-client`: the
 * types of every schema, and for every operation its method, path, the scope it needs and the shape of its
 * request and answer. It reads only what the contract says, so the client cannot describe anything the contract
 * does not, and a test fails when the committed files are not what this produces.
 *
 * It understands the part of OpenAPI the contract uses (object, array, string, number, boolean, null, enum,
 * `$ref`, `oneOf`/`anyOf`/`allOf`, path and query parameters, a JSON request body, a JSON 200 answer) and refuses
 * the rest, loudly, so a contract that grows past it fails here and not quietly in a caller.
 */
import { parse } from 'yaml';

type Schema = {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
  description?: string;
  [key: string]: unknown;
};
type Parameter = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema: Schema;
};
type Operation = {
  operationId?: string;
  summary?: string;
  description?: string;
  'x-safe-to-repeat'?: boolean;
  security?: Record<string, string[]>[];
  parameters?: Parameter[];
  requestBody?: { required?: boolean; content?: Record<string, { schema: Schema }> };
  responses?: Record<string, { $ref?: string; content?: Record<string, { schema: Schema }> }>;
};
export type Contract = {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema> };
};

export const GENERATED_HEADER =
  '// Generated from spec/core-api/openapi.yaml by scripts/generate-api-client.ts. Do not edit it: change the contract and run `pnpm generate:api-client`.\n';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const SCHEMA_REF = '#/components/schemas/';

const comment = (text: string | undefined, indent: string): string => {
  if (!text) return '';
  const lines = text.trim().split('\n');
  return `${indent}/**\n${lines.map((line) => `${indent} * ${line}`.trimEnd()).join('\n')}\n${indent} */\n`;
};

const isIdentifier = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

function typeOf(schema: Schema, indent: string): string {
  if (schema.$ref !== undefined) {
    if (!schema.$ref.startsWith(SCHEMA_REF)) throw new Error(`cannot resolve ${schema.$ref}`);
    return schema.$ref.slice(SCHEMA_REF.length);
  }
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (schema.oneOf || schema.anyOf) {
    return (schema.oneOf ?? schema.anyOf ?? [])
      .map((item) => paren(typeOf(item, indent)))
      .join(' | ');
  }
  if (schema.allOf) return schema.allOf.map((item) => paren(typeOf(item, indent))).join(' & ');
  if (Array.isArray(schema.type)) {
    return schema.type.map((type) => typeOf({ ...schema, type }, indent)).join(' | ');
  }
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      if (!schema.items) throw new Error('an array schema needs items');
      return `${paren(typeOf(schema.items, indent))}[]`;
    case 'object':
      return objectType(schema, indent);
    default:
      throw new Error(`cannot generate a type for ${JSON.stringify(schema)}`);
  }
}

const paren = (type: string): string => (/[|&]/.test(type) ? `(${type})` : type);

function objectType(schema: Schema, indent: string): string {
  const properties = Object.entries(schema.properties ?? {});
  if (properties.length === 0) {
    return typeof schema.additionalProperties === 'object'
      ? `Record<string, ${typeOf(schema.additionalProperties, indent)}>`
      : 'Record<string, never>';
  }
  const inner = `${indent}  `;
  const required = new Set(schema.required ?? []);
  const lines = properties.map(([name, property]) => {
    const key = isIdentifier(name) ? name : JSON.stringify(name);
    return `${comment(property.description, inner)}${inner}${key}${required.has(name) ? '' : '?'}: ${typeOf(property, inner)};`;
  });
  return `{\n${lines.join('\n')}\n${indent}}`;
}

/** The schemas of the contract as TypeScript types. */
export function generateSchema(contract: Contract): string {
  const out = [GENERATED_HEADER];
  for (const [name, schema] of Object.entries(contract.components?.schemas ?? {})) {
    out.push(`${comment(schema.description, '')}export type ${name} = ${typeOf(schema, '')};\n`);
  }
  return out.join('\n');
}

type Described = {
  id: string;
  method: string;
  path: string;
  scopes: string[] | undefined;
  safeToRepeat: boolean;
  query: Parameter[];
  pathParams: Parameter[];
  body: Schema | undefined;
  bodyRequired: boolean;
  answer: Schema;
  summary: string | undefined;
};

function describe(contract: Contract): Described[] {
  const found: Described[] = [];
  for (const [path, item] of Object.entries(contract.paths)) {
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const id = operation.operationId;
      if (!id || !isIdentifier(id))
        throw new Error(`${method.toUpperCase()} ${path} needs an operationId`);
      const parameters = operation.parameters ?? [];
      for (const parameter of parameters) {
        if (parameter.in !== 'query' && parameter.in !== 'path') {
          throw new Error(`${id}: a ${parameter.in} parameter is not supported by the generator`);
        }
      }
      const json = operation.requestBody?.content?.['application/json'];
      if (operation.requestBody && !json)
        throw new Error(`${id}: only a JSON request body is supported`);
      const ok = operation.responses?.['200'];
      const answer = ok?.content?.['application/json']?.schema;
      if (!answer) throw new Error(`${id}: it needs a JSON 200 answer`);
      const scopes = operation.security?.flatMap((requirement) =>
        Object.values(requirement).flat(),
      );
      const bearer = operation.security?.some((requirement) => 'bearer' in requirement);
      found.push({
        id,
        method: method.toUpperCase(),
        path,
        scopes: bearer ? (scopes ?? []) : undefined,
        // A read is safe to repeat; so is any call the contract says is, such as a lookup that has to be a POST.
        safeToRepeat: method === 'get' || operation['x-safe-to-repeat'] === true,
        query: parameters.filter((p) => p.in === 'query'),
        pathParams: parameters.filter((p) => p.in === 'path'),
        body: json?.schema,
        bodyRequired: operation.requestBody?.required === true,
        answer,
        summary: operation.summary,
      });
    }
  }
  const ids = found.map((operation) => operation.id);
  if (new Set(ids).size !== ids.length) throw new Error('operationId values must be unique');
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

/** Each operation: how to call it, and the types of what goes in and what comes back. */
export function generateOperations(contract: Contract): string {
  const operations = describe(contract);
  const types: string[] = [];
  const table: string[] = [];
  for (const operation of operations) {
    const request: string[] = [];
    if (operation.pathParams.length > 0) {
      request.push(
        `params: { ${operation.pathParams.map((p) => `${p.name}: ${typeOf(p.schema, '')}`).join('; ')} }`,
      );
    }
    if (operation.query.length > 0) {
      const required = operation.query.some((p) => p.required === true);
      const fields = operation.query
        .map((p) => `${p.name}${p.required === true ? '' : '?'}: ${typeOf(p.schema, '')}`)
        .join('; ');
      request.push(`query${required ? '' : '?'}: { ${fields} }`);
    }
    if (operation.body) {
      request.push(`body${operation.bodyRequired ? '' : '?'}: ${typeOf(operation.body, '  ')}`);
    }
    types.push(
      `${comment(operation.summary, '  ')}  ${operation.id}: {\n    request: ${request.length > 0 ? `{ ${request.join('; ')} }` : 'undefined'};\n    response: ${typeOf(operation.answer, '    ')};\n  };`,
    );
    table.push(
      `  ${operation.id}: {\n    method: '${operation.method}',\n    path: '${operation.path}',\n    scopes: ${operation.scopes === undefined ? 'undefined' : JSON.stringify(operation.scopes)},\n    safeToRepeat: ${operation.safeToRepeat},\n  },`,
    );
  }
  // Only the schemas an operation names are imported: an import nothing uses is a lint failure.
  const used = types.join('\n');
  const names = Object.keys(contract.components?.schemas ?? {})
    .filter((name) => new RegExp(`\\b${name}\\b`).test(used))
    .sort();
  return [
    GENERATED_HEADER,
    names.length > 0 ? `import type { ${names.join(', ')} } from './schema';\n` : '',
    `/** What each operation takes and answers with. */\nexport interface Operations {\n${types.join('\n')}\n}\n`,
    `/** How each operation is called. \`scopes\` is undefined for a public one, and \`safeToRepeat\` says a failed call may be sent again. */\nexport const operations = {\n${table.join('\n')}\n} as const;\n`,
  ].join('\n');
}

/** Reads the contract's text, checking it is the version this generator understands. */
export function readContract(text: string): Contract {
  const contract = parse(text) as Contract;
  if (typeof contract?.openapi !== 'string' || !contract.openapi.startsWith('3.1')) {
    throw new Error('the contract must be OpenAPI 3.1');
  }
  return contract;
}
