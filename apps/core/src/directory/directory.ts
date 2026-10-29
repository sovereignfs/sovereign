import type { Database } from '@sovereignfs/database';

/** One person as the Directory API returns them (`DirectoryUser` in the Core API contract). */
export type DirectoryUser = { sub: string; name: string; picture: string | null };
export type DirectoryUserStatus = DirectoryUser & { active: boolean };

const COLUMNS = 'id, name, image, deactivated_at';

type Row = Record<string, unknown>;

/** The stored picture is core's own path, which means nothing on another site: an absolute address, or none. */
const pictureOf = (image: unknown, baseUrl: string): string | null =>
  typeof image === 'string' && image !== '' ? new URL(image, baseUrl).href : null;

const userOf = (row: Row, baseUrl: string): DirectoryUser => ({
  sub: String(row.id),
  name: String(row.name),
  picture: pictureOf(row.image, baseUrl),
});

const active = (row: Row): boolean =>
  row.deactivated_at === null || row.deactivated_at === undefined;

/** A text as a `like` pattern that means what was typed: `%`, `_` and the escape are characters, not wildcards. */
const escaped = (text: string): string =>
  text.replace(/[\\%_]/g, (char) => `\\${char}`).toLowerCase();

/**
 * People whose name contains the text, best match first: a name that is exactly it, then those that start with it,
 * then the rest, each in name order. Deactivated accounts are not returned. Only names are matched: an email
 * address is never searched, so no part of one finds anybody (core-app §3.9).
 */
export async function searchUsers(
  database: Database,
  query: string,
  limit: number,
  baseUrl: string,
): Promise<DirectoryUser[]> {
  const text = query.trim().toLowerCase();
  const { rows } = await database.run(
    `select ${COLUMNS} from users
      where deactivated_at is null and lower(name) like ? escape '\\'
      order by case when lower(name) = ? then 0 when lower(name) like ? escape '\\' then 1 else 2 end,
               lower(name), id
      limit ?`,
    [`%${escaped(text)}%`, text, `${escaped(text)}%`, limit],
  );
  return rows.map((row) => userOf(row, baseUrl));
}

/**
 * The people with these `sub` values, in the order asked, each with whether the account is active. A deactivated
 * account is returned with `active: false`; a deleted one is left out, so an app learns nothing about an account that
 * is gone, and a `sub` asked for twice is answered once.
 */
export async function resolveUsers(
  database: Database,
  subs: readonly string[],
  baseUrl: string,
): Promise<DirectoryUserStatus[]> {
  const wanted = [...new Set(subs)];
  if (wanted.length === 0) return [];
  const { rows } = await database.run(
    `select ${COLUMNS} from users where id in (${wanted.map(() => '?').join(', ')})`,
    wanted,
  );
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return wanted.flatMap((sub) => {
    const row = byId.get(sub);
    return row ? [{ ...userOf(row, baseUrl), active: active(row) }] : [];
  });
}

/**
 * The person whose email address is exactly this one, whatever the case, and nobody else: the whole address is
 * compared, never part of it, and nothing here lists or counts addresses. A deactivated account is not returned.
 */
export async function findUserByEmail(
  database: Database,
  email: string,
  baseUrl: string,
): Promise<DirectoryUser | undefined> {
  const { rows } = await database.run(
    `select ${COLUMNS} from users where deactivated_at is null and lower(email) = ? limit 1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ? userOf(rows[0], baseUrl) : undefined;
}
