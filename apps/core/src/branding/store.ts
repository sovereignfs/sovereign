import { createHash } from 'node:crypto';
import { toBuffer, type Database } from '@sovereignfs/database';
import { sanitiseSvg } from '../images/svg';
import { ImageError, inspectImage } from '../images/validate';

/** The instance's three pictures (core-app §3.12): its logo for a light page and for a dark one, and its favicon. */
export const BRANDING_KINDS = ['logo-light', 'logo-dark', 'favicon'] as const;
export type BrandingKind = (typeof BRANDING_KINDS)[number];

export const isBrandingKind = (value: unknown): value is BrandingKind =>
  typeof value === 'string' && (BRANDING_KINDS as readonly string[]).includes(value);

/** The address a picture is served from. The version is part of it, so a new picture is a new address. */
export const brandingPath = (kind: BrandingKind, version: string): string =>
  `/api/branding/${kind}?v=${version}`;

export type StoredBranding = {
  contentType: string;
  bytes: Buffer;
  version: string;
};

export type BrandingSummary = { contentType: string; version: string; size: number; path: string };

/**
 * The instance's logos and favicon (core-app §3.12, §3.15), kept in the database. A picture is judged by
 * its bytes before it is kept: PNG, JPEG or WebP as it is, SVG only after `sanitiseSvg` has rebuilt it from
 * what is known to be a picture. What is kept is what is served, so nothing unsanitised ever leaves here.
 */
export class BrandingStore {
  readonly #database: Database;
  readonly #now: () => number;

  constructor(database: Database, options: { now?: () => number } = {}) {
    this.#database = database;
    this.#now = options.now ?? Date.now;
  }

  /** Keeps `bytes` as the picture for `kind`, or throws an `ImageError` saying why it is not one. */
  async set(kind: BrandingKind, bytes: Buffer, actor?: string): Promise<BrandingSummary> {
    let stored = bytes;
    let contentType: string;
    try {
      contentType = inspectImage(bytes).contentType;
    } catch (error) {
      if (!(error instanceof ImageError) || error.code !== 'svg') throw error;
      stored = sanitiseSvg(bytes);
      contentType = 'image/svg+xml';
    }
    const version = createHash('sha256').update(stored).digest('hex').slice(0, 16);
    await this.#database.run(
      `insert into instance_images (kind, content_type, bytes, size, version, updated_at, updated_by)
         values (?, ?, ?, ?, ?, ?, ?)
       on conflict (kind) do update set content_type = excluded.content_type, bytes = excluded.bytes,
         size = excluded.size, version = excluded.version, updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
      [kind, contentType, stored, stored.length, version, this.#now(), actor ?? null],
    );
    return { contentType, version, size: stored.length, path: brandingPath(kind, version) };
  }

  /** Removes the picture for `kind`. False when there was none. */
  async remove(kind: BrandingKind): Promise<boolean> {
    const { rowsAffected } = await this.#database.run(
      'delete from instance_images where kind = ?',
      [kind],
    );
    return rowsAffected > 0;
  }

  /** The picture to serve, or nothing. */
  async get(kind: BrandingKind): Promise<StoredBranding | undefined> {
    const { rows } = await this.#database.run(
      'select content_type, bytes, version from instance_images where kind = ?',
      [kind],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      contentType: String(row.content_type),
      bytes: toBuffer(row.bytes),
      version: String(row.version),
    };
  }

  /** What is kept for each kind, without the bytes. */
  async describe(): Promise<Record<BrandingKind, BrandingSummary | undefined>> {
    const { rows } = await this.#database.run(
      'select kind, content_type, size, version from instance_images',
    );
    const found: Record<BrandingKind, BrandingSummary | undefined> = {
      'logo-light': undefined,
      'logo-dark': undefined,
      favicon: undefined,
    };
    for (const row of rows) {
      const kind = row.kind;
      if (!isBrandingKind(kind)) continue;
      const version = String(row.version);
      found[kind] = {
        contentType: String(row.content_type),
        version,
        size: Number(row.size),
        path: brandingPath(kind, version),
      };
    }
    return found;
  }
}
