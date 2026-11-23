import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appIcon,
  appIconPath,
  forgetAppIcons,
  ICON_FAILURE_KEPT_MS,
  ICON_KEPT_MS,
  type AppIconDeps,
} from '../clients/app-icons';
import type { LauncherApp } from '../clients/launcher';
import { png } from './image-fixtures';

const NOTES: LauncherApp = {
  id: 'notes',
  name: 'Notes',
  description: undefined,
  icon: 'https://notes.sovereign.local/icon.png',
  launchUrl: 'https://notes.sovereign.local/',
};
const BARE: LauncherApp = { ...NOTES, id: 'bare', icon: undefined };

const answering = (body: BodyInit | null, status = 200) =>
  vi.fn(() => Promise.resolve(new Response(body, { status })));

function deps(fetch: ReturnType<typeof answering>, at = { now: 1_000 }): AppIconDeps {
  return {
    listed: () => Promise.resolve([NOTES, BARE]),
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => at.now,
  };
}

afterEach(forgetAppIcons);

describe('apps’ launcher icons, from core (core-app §3.8)', () => {
  it('fetches a listed app’s icon from the address its entry names, and serves the picture its bytes prove', async () => {
    const fetch = answering(new Uint8Array(png(64, 64)));
    const icon = await appIcon('notes', deps(fetch));
    expect(icon?.contentType).toBe('image/png');
    expect(icon?.etag).toMatch(/^"[\w-]{22}"$/);
    expect(fetch).toHaveBeenCalledWith(NOTES.icon, expect.objectContaining({ redirect: 'manual' }));
  });

  it('has nothing for an app the launcher does not list, or one with no icon, and fetches nothing for them', async () => {
    const fetch = answering(new Uint8Array(png(64, 64)));
    expect(await appIcon('elsewhere', deps(fetch))).toBeUndefined();
    expect(await appIcon('bare', deps(fetch))).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses what is not a picture, a redirect, an error and anything over 1 MB', async () => {
    for (const fetch of [
      answering('<html>not a picture</html>'),
      answering(null, 302),
      answering('gone', 404),
      answering(new Uint8Array(Buffer.concat([png(8, 8), Buffer.alloc(1024 * 1024)]))),
    ]) {
      forgetAppIcons();
      expect(await appIcon('notes', deps(fetch))).toBeUndefined();
    }
  });

  it('rebuilds an SVG safe before serving it', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script><rect width="1" height="1"/></svg>';
    const icon = await appIcon('notes', deps(answering(svg)));
    expect(icon?.contentType).toBe('image/svg+xml');
    expect(icon?.bytes.toString('utf8')).not.toContain('script');
    expect(icon?.bytes.toString('utf8')).toContain('rect');
  });

  it('keeps an icon an hour and a failure five minutes, then asks again', async () => {
    const at = { now: 1_000 };
    const fetch = answering(new Uint8Array(png(64, 64)));
    await appIcon('notes', deps(fetch, at));
    at.now += ICON_KEPT_MS - 1;
    await appIcon('notes', deps(fetch, at));
    expect(fetch).toHaveBeenCalledTimes(1);
    at.now += 2;
    fetch.mockImplementation(() => Promise.resolve(new Response('gone', { status: 404 })));
    expect(await appIcon('notes', deps(fetch, at))).toBeUndefined();
    at.now += ICON_FAILURE_KEPT_MS - 1;
    await appIcon('notes', deps(fetch, at));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('is served at a path on core for each app', () => {
    expect(appIconPath('notes')).toBe('/api/branding/apps/notes');
    expect(appIconPath('a b/c')).toBe('/api/branding/apps/a%20b%2Fc');
  });
});
