/** What an export is (`contracts/export.md` §2): the first entry of every export, `export.json`. */
export interface ExportHead {
  format: 1;
  kind: 'instance' | 'app' | 'person';
  producer: { name: string; version: string };
  instance?: { id: string; url: string };
  app?: string;
  sub?: string;
  takenAt: string;
}

export type PartStatus = 'complete' | 'missing';
export type MissingReason = 'not_supported' | 'unreachable' | 'refused' | 'too_large' | 'invalid';

/** One producer whose data the export was meant to hold (`contracts/export.md` §4). */
export interface ExportPart {
  name: string;
  status: PartStatus;
  reason?: MissingReason;
  version?: string;
}

export interface RecordsEntry {
  path: string;
  kind: string;
  count: number;
  endToEnd: boolean;
}

export interface FileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

/** The last entry of every export, `contents.json`. */
export interface ExportContents {
  parts: ExportPart[];
  records: RecordsEntry[];
  files: FileEntry[];
}

/** Bytes as they come: a web stream, any async iterable, or all at once. */
export type ByteSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array;
