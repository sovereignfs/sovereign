import { ExportError } from './errors.js';
import { isPrefix } from './paths.js';
import type { ExportContents, ExportHead } from './types.js';

export const FORMAT = 1;

const KINDS = new Set(['instance', 'app', 'person']);
const REASONS = new Set(['not_supported', 'unreachable', 'refused', 'too_large', 'invalid']);
const HEAD_FIELDS = new Set(['format', 'kind', 'producer', 'instance', 'app', 'sub', 'takenAt']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256 = /^[0-9a-f]{64}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bad(message: string): never {
  throw new ExportError('invalid_head', message);
}

function nonEmpty(value: unknown, max = 255): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** Throws unless `value` is an `export.json` this version reads (`contracts/export.md` §2). */
export function checkHead(value: unknown): ExportHead {
  if (!isObject(value)) bad('export.json is not an object.');
  if (value.format !== FORMAT) {
    throw new ExportError(
      'unknown_format',
      `This export is format ${JSON.stringify(value.format)}; this version of @sovereignfs/export reads format ${FORMAT}.`,
    );
  }
  for (const key of Object.keys(value))
    if (!HEAD_FIELDS.has(key)) bad(`export.json has a field it may not: ${key}.`);
  if (typeof value.kind !== 'string' || !KINDS.has(value.kind))
    bad('export.json has no known kind.');
  const producer = value.producer;
  if (
    !isObject(producer) ||
    Object.keys(producer).length !== 2 ||
    !nonEmpty(producer.name, 64) ||
    !nonEmpty(producer.version, 64)
  ) {
    bad('export.json names no producer.');
  }
  if (value.instance !== undefined) {
    const instance = value.instance;
    if (
      !isObject(instance) ||
      Object.keys(instance).length !== 2 ||
      !nonEmpty(instance.id) ||
      !nonEmpty(instance.url, 2048)
    ) {
      bad('export.json has an instance that is not an id and an address.');
    }
  }
  if (value.app !== undefined && (typeof value.app !== 'string' || !isPrefix(value.app)))
    bad('export.json has an app that is not a prefix.');
  if (value.kind === 'app' && value.app === undefined) bad("An app's export names its app.");
  if (value.sub !== undefined && !nonEmpty(value.sub))
    bad('export.json has a sub that is not a string.');
  if (value.kind === 'person' && value.sub === undefined)
    bad("A person's export names its person.");
  if (value.kind !== 'person' && value.sub !== undefined)
    bad("Only a person's export names a person.");
  if (
    typeof value.takenAt !== 'string' ||
    !ISO.test(value.takenAt) ||
    Number.isNaN(Date.parse(value.takenAt))
  ) {
    bad('export.json has no takenAt in UTC with milliseconds.');
  }
  return value as unknown as ExportHead;
}

function badContents(message: string): never {
  throw new ExportError('invalid_contents', message);
}

/** Throws unless `value` has the shape of a `contents.json` (`contracts/export.md` §4); what it lists is checked by `readExport`. */
export function checkContentsShape(value: unknown): ExportContents {
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => !['parts', 'records', 'files'].includes(key))
  ) {
    badContents('contents.json is not an object of parts, records and files.');
  }
  const { parts, records, files } = value;
  if (!Array.isArray(parts) || !Array.isArray(records) || !Array.isArray(files))
    badContents('contents.json lacks a list.');
  const names = new Set<string>();
  for (const part of parts) {
    if (
      !isObject(part) ||
      !nonEmpty(part.name, 64) ||
      (part.name !== 'core' && !isPrefix(part.name))
    )
      badContents('A part has no name.');
    if (names.has(part.name)) badContents(`The part ${part.name} is listed twice.`);
    names.add(part.name);
    if (part.status === 'complete') {
      if (part.reason !== undefined) badContents(`The complete part ${part.name} has a reason.`);
    } else if (part.status === 'missing') {
      if (typeof part.reason !== 'string' || !REASONS.has(part.reason))
        badContents(`The missing part ${part.name} has no known reason.`);
    } else {
      badContents(`The part ${part.name} has no known status.`);
    }
    if (part.version !== undefined && !nonEmpty(part.version, 64))
      badContents(`The part ${part.name} has a version that is not a string.`);
  }
  for (const entry of records) {
    if (
      !isObject(entry) ||
      !nonEmpty(entry.path, 1024) ||
      !nonEmpty(entry.kind, 64) ||
      !Number.isSafeInteger(entry.count) ||
      (entry.count as number) < 0 ||
      typeof entry.endToEnd !== 'boolean'
    ) {
      badContents('A records entry is not a path, a kind, a count and endToEnd.');
    }
  }
  for (const entry of files) {
    if (
      !isObject(entry) ||
      !nonEmpty(entry.path, 1024) ||
      !Number.isSafeInteger(entry.bytes) ||
      (entry.bytes as number) < 0 ||
      typeof entry.sha256 !== 'string' ||
      !SHA256.test(entry.sha256)
    ) {
      badContents('A file entry is not a path, a size and a SHA-256.');
    }
  }
  return value as unknown as ExportContents;
}
