import { getTableColumns } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { describe, expect, it, vi } from 'vitest';
import { blindIndex, encryptedText, getFieldColumns } from '../drizzle';
import { provideHost } from '../host';
import type { SdkHost } from '../host';

/**
 * Schema-helper coverage (RFC 0092, epic task 8.33): metadata discovery via
 * the drizzle:Columns registry symbol, the synchronous toDriver tripwire on
 * classified columns, and seal()/open() row mechanics against a mocked host
 * (base64url "crypto" — real crypto is covered by the runtime's field-crypto
 * and live-DB suites).
 */

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-sovereign-plugin-id': 'fs.test.plugin' }),
}));

const entries = sqliteTable('entries', {
  id: text('id').primaryKey(),
  loggedAt: integer('logged_at'),
  notes: encryptedText('notes', { sensitivity: 'health' }),
  notesIdx: blindIndex('notes_bidx', { source: 'notes' }),
  title: text('title'),
});

function fakeHost(): void {
  provideHost({
    crypto: {
      async encryptField(value, options) {
        return `svf1:dek1:${options.context ?? ''}:${Buffer.from(value).toString('base64url')}`;
      },
      async decryptField(envelope, options) {
        const parts = envelope.split(':');
        if (envelope.startsWith('svf0:')) {
          return Buffer.from(parts[1] as string, 'base64url').toString('utf8');
        }
        if (parts[2] !== (options.context ?? '')) throw new Error('context mismatch');
        return Buffer.from(parts[3] as string, 'base64url').toString('utf8');
      },
      async hashField(value, options) {
        return `h:${options.sensitivity}:${value}`;
      },
    },
  } as unknown as SdkHost);
}

describe('encryptedText / blindIndex metadata discovery', () => {
  it('discovers classified columns with js keys, db names, and metadata', () => {
    const fields = getFieldColumns(entries);
    expect(fields).toEqual([
      { key: 'notes', columnName: 'notes', meta: { kind: 'encrypted', sensitivity: 'health' } },
      { key: 'notesIdx', columnName: 'notes_bidx', meta: { kind: 'blindIndex', source: 'notes' } },
    ]);
  });

  it('returns [] for tables without classified columns and non-tables', () => {
    const plain = sqliteTable('p', { id: text('id') });
    expect(getFieldColumns(plain)).toEqual([]);
    expect(getFieldColumns({})).toEqual([]);
  });
});

describe('the toDriver tripwire', () => {
  const cols = getTableColumns(entries);

  it('throws on unsealed plaintext writes to a classified column', () => {
    expect(() => cols.notes.mapToDriverValue('raw plaintext')).toThrow(
      /sdk\.crypto\.seal.*plaintext never goes into a classified column/s,
    );
  });

  it('passes sealed envelopes and null through', () => {
    expect(cols.notes.mapToDriverValue('svf1:a:b:c:d')).toBe('svf1:a:b:c:d');
    expect(cols.notes.mapToDriverValue('svf0:cGxhaW4')).toBe('svf0:cGxhaW4');
    expect(cols.notes.mapToDriverValue(null as never)).toBeNull();
  });

  it('generates plain text columns for migrations', () => {
    expect(cols.notes.getSQLType()).toBe('text');
    expect(cols.notesIdx.getSQLType()).toBe('text');
  });
});

describe('sdk.crypto.seal / open', () => {
  it('seals encrypted columns, computes blind indexes from plaintext, opens back', async () => {
    fakeHost();
    const { crypto } = await import('../crypto');
    const row = { id: '1', loggedAt: 42, notes: 'my private note', title: 'public' };

    const sealed = await crypto.seal(entries, row);
    expect(sealed.notes.startsWith('svf1:')).toBe(true);
    expect(sealed).toHaveProperty('notesIdx', 'h:health:my private note');
    expect(sealed.title).toBe('public'); // unclassified columns untouched
    expect(row.notes).toBe('my private note'); // non-mutating

    const opened = await crypto.open(entries, sealed);
    expect(opened.notes).toBe('my private note');
  });

  it('handles arrays, null values, and partial rows (absent source leaves index untouched)', async () => {
    fakeHost();
    const { crypto } = await import('../crypto');

    const sealedRows = await crypto.seal(entries, [
      { id: '1', notes: 'a' },
      { id: '2', notes: null },
    ]);
    expect(sealedRows).toHaveLength(2);
    expect((sealedRows[0] as { notesIdx?: unknown }).notesIdx).toBe('h:health:a');
    expect((sealedRows[1] as { notes: unknown }).notes).toBeNull();
    expect((sealedRows[1] as { notesIdx?: unknown }).notesIdx).toBeNull();

    // Partial update without the classified column: nothing to do.
    const partial = await crypto.seal(entries, { id: '1', title: 'renamed' });
    expect(partial).toEqual({ id: '1', title: 'renamed' });
  });

  it('re-sealing a sealed row: consistent envelope+index pair passes through; a sealed source without its index throws', async () => {
    fakeHost();
    const { crypto } = await import('../crypto');
    const sealed = await crypto.seal(entries, { id: '1', notes: 'x' });

    const again = await crypto.seal(entries, {
      id: '1',
      notes: sealed.notes,
      notesIdx: sealed.notesIdx,
    });
    expect(again.notes).toBe(sealed.notes);
    expect(again.notesIdx).toBe(sealed.notesIdx);

    await expect(crypto.seal(entries, { id: '1', notes: sealed.notes })).rejects.toThrow(
      /open\(\) the row before modifying/,
    );
  });

  it('open passes through pre-feature plaintext rows untouched', async () => {
    fakeHost();
    const { crypto } = await import('../crypto');
    const opened = await crypto.open(entries, { id: '1', notes: 'legacy plaintext' });
    expect(opened.notes).toBe('legacy plaintext');
  });
});
