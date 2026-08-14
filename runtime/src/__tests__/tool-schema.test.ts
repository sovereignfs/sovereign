import { describe, expect, it } from 'vitest';
import { validateToolInput } from '../tool-schema';

const recordSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    priority: { type: 'integer', enum: [1, 2, 3] },
  },
  required: ['title'],
};

describe('validateToolInput (RFC 0047)', () => {
  it('accepts input matching the schema', () => {
    expect(validateToolInput(recordSchema, { title: 'Example', priority: 2 })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('accepts input omitting an optional property', () => {
    expect(validateToolInput(recordSchema, { title: 'Example' })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects input missing a required property', () => {
    const result = validateToolInput(recordSchema, { priority: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('title');
  });

  it('rejects a property of the wrong type', () => {
    const result = validateToolInput(recordSchema, { title: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('title');
  });

  it('rejects a value outside an enum', () => {
    const result = validateToolInput(recordSchema, { title: 'Example', priority: 9 });
    expect(result.valid).toBe(false);
  });

  it('rejects the wrong top-level type', () => {
    const result = validateToolInput(recordSchema, 'not an object');
    expect(result.valid).toBe(false);
  });

  it('validates nested array items', () => {
    const schema = {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    };
    expect(validateToolInput(schema, { tags: ['a', 'b'] })).toEqual({ valid: true, errors: [] });
    const result = validateToolInput(schema, { tags: ['a', 42] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('tags[1]');
  });

  it('treats "number" as accepting both integers and floats', () => {
    const schema = { type: 'object', properties: { amount: { type: 'number' } } };
    expect(validateToolInput(schema, { amount: 3 }).valid).toBe(true);
    expect(validateToolInput(schema, { amount: 3.5 }).valid).toBe(true);
  });

  it('an empty schema (no type) accepts anything', () => {
    expect(validateToolInput({}, { anything: 'goes' }).valid).toBe(true);
    expect(validateToolInput({}, 42).valid).toBe(true);
  });
});
