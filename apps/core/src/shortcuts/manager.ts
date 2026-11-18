import { createHash, randomUUID } from 'node:crypto';
import { toBuffer, type Database } from '@sovereignfs/database';
import { appUrlProblem, textProblem, urlProblem, type Problem } from '../clients/validate';
import { sanitiseSvg } from '../images/svg';
import { ImageError, inspectImage } from '../images/validate';
import { can, type Capability } from '../roles/capabilities';
import { loadMatrix } from '../roles/matrix';
import { isShortcutSymbol, type ShortcutSymbol } from './symbols';

/** The largest picture a shortcut keeps: a tile's icon is small, so this is well below an avatar's 1 MB. */
export const MAX_SHORTCUT_ICON_BYTES = 256 * 1024;
/** How many shortcuts of their own one person may keep. */
export const MAX_OWN_SHORTCUTS = 50;

export type ShortcutErrorCode = 'forbidden' | 'invalid' | 'not-found' | 'too-many';

export class ShortcutError extends Error {
  override name = 'ShortcutError';

  constructor(
    readonly code: ShortcutErrorCode,
    message: string,
    readonly problems: readonly Problem[] = [],
  ) {
    super(message);
  }
}

/** Who is asking: always the session's own account, never an id taken from a request. */
export type ShortcutActor = { id: string; role: unknown };

/**
 * Whose shortcut it is: one shown to everyone, which an operator manages with `client:manage`, or the asker's own,
 * which needs only `launcher:access` and is seen by nobody else.
 */
export type ShortcutScope = 'shared' | 'own';

export type ShortcutIcon =
  { kind: 'symbol'; symbol: ShortcutSymbol } | { kind: 'image'; path: string } | undefined;

/** A shortcut as the launcher and the forms read it: never its picture's bytes, only the address they are at. */
export type Shortcut = {
  id: string;
  /** Empty for a shortcut shown to everyone. */
  ownerId: string | undefined;
  name: string;
  url: string;
  /**
   * A native app's own address (`spotify:…`), opened instead of `url` from an installed core or a phone (RFC 0001 A6). Never
   * rendered as a link; the launcher opens it when the tile is clicked.
   */
  appUrl: string | undefined;
  description: string | undefined;
  icon: ShortcutIcon;
};

/**
 * What a form asks for. The icon is a picked symbol or an uploaded picture, never both; `keepImage` keeps the
 * picture already there when nothing new is uploaded and no symbol is picked.
 */
export type ShortcutInput = {
  name: unknown;
  url: unknown;
  appUrl?: unknown;
  description?: unknown;
  symbol?: unknown;
  image?: Buffer | undefined;
  keepImage?: boolean;
};

export type StoredShortcutIcon = { contentType: string; bytes: Buffer; version: string };

/** The address a shortcut's picture is served from. The version is part of it, so a new picture is a new address. */
export const shortcutIconPath = (id: string, version: string): string =>
  `/api/shortcuts/${id}/icon?v=${version}`;

const SCOPE_CAPABILITY: Record<ShortcutScope, Capability> = {
  shared: 'client:manage',
  own: 'launcher:access',
};

const blank = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value.trim();

type Row = Record<string, unknown>;

function shortcutOf(row: Row): Shortcut {
  const symbol = row.icon_symbol;
  const version = row.icon_version;
  const id = String(row.id);
  return {
    id,
    ownerId: row.owner_id === null || row.owner_id === undefined ? undefined : String(row.owner_id),
    name: String(row.name),
    url: String(row.url),
    appUrl: row.app_url === null || row.app_url === undefined ? undefined : String(row.app_url),
    description: row.description === null ? undefined : String(row.description),
    icon: isShortcutSymbol(symbol)
      ? { kind: 'symbol', symbol }
      : typeof version === 'string' && version !== ''
        ? { kind: 'image', path: shortcutIconPath(id, version) }
        : undefined,
  };
}

const COLUMNS = 'id, owner_id, name, url, app_url, description, icon_symbol, icon_version';

/**
 * Launcher shortcuts (core-app §3.8.1): a name, an address and an icon, opened in a new tab. A shortcut is not an
 * app; it never signs anyone in, and nothing here touches the registry of apps. This is the only code that writes
 * them. Every change asks for its capability against the matrix in force, a person's own shortcuts are found only
 * with their own id, and a picture is judged by its bytes (an SVG rebuilt by `sanitiseSvg`) before it is kept.
 */
export class ShortcutManager {
  readonly #database: Database;
  readonly #development: boolean;
  readonly #now: () => number;

  constructor(database: Database, options: { development: boolean; now?: () => number }) {
    this.#database = database;
    this.#development = options.development;
    this.#now = options.now ?? Date.now;
  }

  async #allow(actor: ShortcutActor, scope: ShortcutScope): Promise<void> {
    const matrix = await loadMatrix(this.#database);
    if (
      !can(actor.role, 'launcher:access', matrix) ||
      !can(actor.role, SCOPE_CAPABILITY[scope], matrix)
    ) {
      throw new ShortcutError('forbidden', 'You are not allowed to change that.');
    }
  }

  /** `where` and its values that find the shortcuts of `scope` the actor may touch. */
  #whose(actor: ShortcutActor, scope: ShortcutScope): { where: string; values: unknown[] } {
    return scope === 'shared'
      ? { where: 'owner_id is null', values: [] }
      : { where: 'owner_id = ?', values: [actor.id] };
  }

  /** The picture to keep, or throws a `ShortcutError` naming the icon as what is wrong. */
  #picture(bytes: Buffer): { contentType: string; bytes: Buffer; version: string } {
    const invalid = (message: string) =>
      new ShortcutError('invalid', message, [{ field: 'icon', message }]);
    if (bytes.length > MAX_SHORTCUT_ICON_BYTES) throw invalid('The picture is larger than 256 KB.');
    let stored = bytes;
    let contentType: string;
    try {
      contentType = inspectImage(bytes).contentType;
    } catch (error) {
      if (!(error instanceof ImageError)) throw error;
      if (error.code !== 'svg') throw invalid(error.message);
      try {
        stored = sanitiseSvg(bytes);
      } catch (svgError) {
        if (svgError instanceof ImageError) throw invalid(svgError.message);
        throw svgError;
      }
      contentType = 'image/svg+xml';
    }
    const version = createHash('sha256').update(stored).digest('hex').slice(0, 16);
    return { contentType, bytes: stored, version };
  }

  /** The fields, checked, or a `ShortcutError` listing every one that is wrong. */
  #fields(input: ShortcutInput) {
    const problems: Problem[] = [];
    const nameProblem = textProblem(input.name, 60, true);
    if (nameProblem) problems.push({ field: 'name', message: `The name ${nameProblem}.` });
    const urlIssue = urlProblem(input.url, this.#development);
    if (urlIssue) problems.push({ field: 'url', message: `The address ${urlIssue}.` });
    const appUrl =
      typeof input.appUrl === 'string'
        ? blank(input.appUrl)
        : input.appUrl === undefined
          ? undefined
          : '';
    const appUrlIssue =
      appUrl === undefined
        ? undefined
        : appUrl === ''
          ? 'is not a plain address'
          : appUrlProblem(appUrl);
    if (appUrlIssue)
      problems.push({ field: 'appUrl', message: `The app’s address ${appUrlIssue}.` });
    const descriptionProblem = textProblem(input.description, 280, false);
    if (descriptionProblem) {
      problems.push({ field: 'description', message: `The description ${descriptionProblem}.` });
    }
    const symbol = input.symbol === undefined || input.symbol === '' ? undefined : input.symbol;
    if (symbol !== undefined && !isShortcutSymbol(symbol)) {
      problems.push({ field: 'icon', message: 'Choose one of the icons offered.' });
    }
    if (symbol !== undefined && input.image !== undefined) {
      problems.push({ field: 'icon', message: 'Choose an icon or upload a picture, not both.' });
    }
    if (problems.length > 0) {
      throw new ShortcutError('invalid', 'Some of what you entered needs changing.', problems);
    }
    return {
      name: String(input.name).trim(),
      url: String(input.url),
      appUrl: appUrl ?? null,
      description: blank(input.description as string | undefined) ?? null,
      symbol: (symbol as ShortcutSymbol | undefined) ?? null,
      picture: input.image === undefined ? undefined : this.#picture(input.image),
    };
  }

  /** Adds a shortcut for everyone (`shared`) or for the asker alone (`own`). */
  async create(
    actor: ShortcutActor,
    scope: ShortcutScope,
    input: ShortcutInput,
  ): Promise<Shortcut> {
    await this.#allow(actor, scope);
    const fields = this.#fields(input);
    const id = randomUUID();
    await this.#database.transaction(async (tx) => {
      if (scope === 'own') {
        const { rows } = await tx.run(
          'select count(*) as count from launcher_shortcuts where owner_id = ?',
          [actor.id],
        );
        // node-postgres returns COUNT(*) as a string.
        if (Number(rows[0]?.count ?? 0) >= MAX_OWN_SHORTCUTS) {
          throw new ShortcutError('too-many', `You can keep up to ${MAX_OWN_SHORTCUTS} shortcuts.`);
        }
      }
      await tx.run(
        `insert into launcher_shortcuts (id, owner_id, name, url, app_url, description, icon_symbol, icon_type,
           icon_bytes, icon_size, icon_version, created_at, created_by)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          scope === 'own' ? actor.id : null,
          fields.name,
          fields.url,
          fields.appUrl,
          fields.description,
          fields.symbol,
          fields.picture?.contentType ?? null,
          fields.picture?.bytes ?? null,
          fields.picture?.bytes.length ?? null,
          fields.picture?.version ?? null,
          this.#now(),
          actor.id,
        ],
      );
    });
    const created = await this.get(actor, scope, id);
    if (!created) throw new ShortcutError('not-found', 'There is no such shortcut.');
    return created;
  }

  /** Changes a shortcut the asker may touch; another person's, or one that does not exist, is "not found". */
  async update(
    actor: ShortcutActor,
    scope: ShortcutScope,
    id: string,
    input: ShortcutInput,
  ): Promise<Shortcut> {
    await this.#allow(actor, scope);
    const fields = this.#fields(input);
    const { where, values } = this.#whose(actor, scope);
    // A new picture replaces the old; a symbol, or no icon at all, removes it; otherwise the old one is kept.
    const dropPicture = fields.symbol !== null || (!input.keepImage && !fields.picture);
    const picture = fields.picture
      ? 'icon_type = ?, icon_bytes = ?, icon_size = ?, icon_version = ?,'
      : dropPicture
        ? 'icon_type = null, icon_bytes = null, icon_size = null, icon_version = null,'
        : '';
    const pictureValues = fields.picture
      ? [
          fields.picture.contentType,
          fields.picture.bytes,
          fields.picture.bytes.length,
          fields.picture.version,
        ]
      : [];
    const { rowsAffected } = await this.#database.run(
      `update launcher_shortcuts set name = ?, url = ?, app_url = ?, description = ?, ${picture} icon_symbol = ?
        where id = ? and ${where}`,
      [
        fields.name,
        fields.url,
        fields.appUrl,
        fields.description,
        ...pictureValues,
        fields.symbol,
        id,
        ...values,
      ],
    );
    if (rowsAffected === 0) throw new ShortcutError('not-found', 'There is no such shortcut.');
    const updated = await this.get(actor, scope, id);
    if (!updated) throw new ShortcutError('not-found', 'There is no such shortcut.');
    return updated;
  }

  /** Removes a shortcut the asker may touch; another person's, or one that does not exist, is "not found". */
  async remove(actor: ShortcutActor, scope: ShortcutScope, id: string): Promise<void> {
    await this.#allow(actor, scope);
    const { where, values } = this.#whose(actor, scope);
    const { rowsAffected } = await this.#database.run(
      `delete from launcher_shortcuts where id = ? and ${where}`,
      [id, ...values],
    );
    if (rowsAffected === 0) throw new ShortcutError('not-found', 'There is no such shortcut.');
  }

  /** One shortcut the asker may manage in `scope`, for its form; nothing when there is none they may. */
  async get(actor: ShortcutActor, scope: ShortcutScope, id: string): Promise<Shortcut | undefined> {
    const { where, values } = this.#whose(actor, scope);
    const { rows } = await this.#database.run(
      `select ${COLUMNS} from launcher_shortcuts where id = ? and ${where}`,
      [id, ...values],
    );
    return rows[0] ? shortcutOf(rows[0]) : undefined;
  }

  /** The shortcuts of `scope` the asker may manage, in name order. */
  async list(actor: ShortcutActor, scope: ShortcutScope): Promise<Shortcut[]> {
    const { where, values } = this.#whose(actor, scope);
    const { rows } = await this.#database.run(
      `select ${COLUMNS} from launcher_shortcuts where ${where} order by name, id`,
      values,
    );
    return rows.map(shortcutOf);
  }

  /**
   * What the launcher shows the person: every shortcut for everyone and their own, and no one else's. The page
   * that calls it has checked `launcher:access`.
   */
  async forLauncher(userId: string): Promise<Shortcut[]> {
    const { rows } = await this.#database.run(
      `select ${COLUMNS} from launcher_shortcuts
        where owner_id is null or owner_id = ? order by name, id`,
      [userId],
    );
    return rows.map(shortcutOf);
  }

  /**
   * A shortcut's picture, for the person asking: one for everyone to anyone the caller let through, a person's
   * own to them alone. Nothing when there is no picture or it is not theirs to see.
   */
  async icon(userId: string, id: string): Promise<StoredShortcutIcon | undefined> {
    const { rows } = await this.#database.run(
      `select icon_type, icon_bytes, icon_version from launcher_shortcuts
        where id = ? and (owner_id is null or owner_id = ?) and icon_bytes is not null`,
      [id, userId],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      contentType: String(row.icon_type),
      bytes: toBuffer(row.icon_bytes),
      version: String(row.icon_version),
    };
  }
}
