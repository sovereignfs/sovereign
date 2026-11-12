import type { Readable } from 'node:stream';

/** What a store keeps about a file beside its bytes. The name is the person's; the id, the type and the size are the store's. */
export type FileRecord = {
  id: string;
  /** The name the person gave it, cleaned of any path. Never used as a path. */
  name: string;
  /** The type it is served as, judged by its bytes. */
  type: string;
  /** Whether a browser may show it in place: images only. */
  inline: boolean;
  size: number;
  /** When it was stored, as an ISO date. */
  createdAt: string;
};

/** A write went past the bytes it was allowed. */
export class LimitExceeded extends Error {
  override name = 'LimitExceeded';
}

/**
 * Where the bytes go (RFC 0004 §3). A driver is told a person's `sub` and a file's id, both already checked, and never decides anything
 * about quotas or types: the store does.
 */
export interface Driver {
  /**
   * Writes a file's bytes, refusing (`LimitExceeded`) and leaving nothing behind when they pass `limit`. Returns their size and their
   * first bytes, for judging what the file is. Nothing is listed until `commit`.
   */
  write(
    sub: string,
    id: string,
    chunks: AsyncIterable<Uint8Array>,
    limit: number,
  ): Promise<{ size: number; head: Uint8Array }>;
  /** Makes a written file and its record visible together. */
  commit(sub: string, record: FileRecord): Promise<void>;
  /** Drops a written file that was not committed. */
  discard(sub: string, id: string): Promise<void>;
  read(sub: string, id: string): Promise<Readable | undefined>;
  record(sub: string, id: string): Promise<FileRecord | undefined>;
  records(sub: string): Promise<FileRecord[]>;
  remove(sub: string, id: string): Promise<void>;
  removeAll(sub: string): Promise<void>;
}
