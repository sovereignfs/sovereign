/**
 * Only the launcher's own document may load pictures from other sites (`remoteImages` in `buildCsp`, for the path `/`
 * alone). A page's policy is the one its document arrived with, so a client-side navigation to `/` keeps the policy of
 * the page it started on, and every app icon from elsewhere is refused: the tiles fall back to initials until a reload.
 * Every link to `/` is therefore a document load, never `next/link` (directly, or through `renderLink`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appDir = fileURLToPath(new URL('../../app', import.meta.url));

/** Each opening tag of `Link` or of a `ButtonLink` given `renderLink`, whose `href` is the launcher's. */
const ROUTER_LINK_HOME =
  /<Link\b[^>]*\bhref=(?:"\/"|'\/'|\{['"]\/['"]\})[^>]*>|<ButtonLink\b(?=[^>]*\bhref=(?:"\/"|'\/'|\{['"]\/['"]\}))(?=[^>]*\brenderLink=)[^>]*>/g;

function routerLinksHome(source: string): string[] {
  return source.match(ROUTER_LINK_HOME) ?? [];
}

function pages(): string[] {
  return readdirSync(appDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => path.join(appDir, file));
}

describe('links to the launcher', () => {
  it('are document loads, so the launcher gets its own policy and shows app icons from other sites', () => {
    const found = pages().flatMap((file) =>
      routerLinksHome(readFileSync(file, 'utf8')).map(
        (tag) => `${path.relative(appDir, file)}: ${tag}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('are found however the router link is written', () => {
    expect(routerLinksHome('<Link href="/" className={styles.brand}>')).toHaveLength(1);
    expect(routerLinksHome('<Link className={styles.link} href="/">')).toHaveLength(1);
    expect(
      routerLinksHome(
        '<ButtonLink href="/" className={styles.wide} renderLink={(props) => <Link {...props} />}>',
      ),
    ).toHaveLength(1);
    expect(routerLinksHome('<ButtonLink href="/" className={styles.wide}>')).toEqual([]);
    expect(routerLinksHome('<Link href="/shortcuts">')).toEqual([]);
    expect(routerLinksHome('<a href="/" className={styles.brand}>')).toEqual([]);
  });
});
