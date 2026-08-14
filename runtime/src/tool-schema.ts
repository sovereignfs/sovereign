/**
 * Minimal JSON Schema subset validator for plugin tool `inputSchema`
 * declarations (RFC 0047). Supports exactly the shape the RFC's own example
 * uses — `type`, `properties`, `required`, `items`, `enum` — deliberately
 * not a full JSON Schema (draft-07 etc.) engine: RFC 0047's own open
 * question #2 ("JSON Schema vs Zod-derived JSON Schema vs a smaller
 * platform schema") is unresolved, and pulling in a general-purpose
 * validator (e.g. ajv) for an unresolved design question is a heavier
 * commitment than this leg needs. Extend here if a real provider's schema
 * needs a keyword this doesn't yet support.
 */

export type JsonSchemaType =
  'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export interface ToolJsonSchema {
  type?: JsonSchemaType;
  properties?: Record<string, ToolJsonSchema>;
  required?: readonly string[];
  items?: ToolJsonSchema;
  enum?: readonly unknown[];
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function typeOf(value: unknown): JsonSchemaType | 'undefined' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  return 'undefined';
}

function matchesType(value: unknown, expected: JsonSchemaType): boolean {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function validateNode(
  schema: ToolJsonSchema,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path || 'input'}: expected ${schema.type}, got ${typeOf(value)}`);
    return;
  }
  if (schema.enum && !schema.enum.some((allowed) => Object.is(allowed, value))) {
    errors.push(`${path || 'input'}: must be one of ${JSON.stringify(schema.enum)}`);
    return;
  }
  if (schema.type === 'object' && value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path ? `${path}.${key}` : key}: required property missing`);
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          validateNode(propSchema, obj[key], path ? `${path}.${key}` : key, errors);
        }
      }
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    const itemSchema = schema.items;
    value.forEach((item, i) => validateNode(itemSchema, item, `${path}[${i}]`, errors));
  }
}

/**
 * Validate `input` against a manifest tool's `inputSchema`. Called by the
 * host before every `preview()`/`execute()` reaches the provider's own
 * handler (RFC 0047 security requirement: "Providers validate input against
 * schema before preview and execute" — enforced by the platform on the
 * provider's behalf, not left to each provider to remember).
 */
export function validateToolInput(
  schema: Record<string, unknown>,
  input: unknown,
): ValidationResult {
  const errors: string[] = [];
  validateNode(schema as ToolJsonSchema, input, '', errors);
  return { valid: errors.length === 0, errors };
}
