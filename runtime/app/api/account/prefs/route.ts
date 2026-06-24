import { NextResponse } from 'next/server';
import { getAccountPrefs, setAccountPrefs, type SidebarPluginEntry } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { isValidTheme, isValidTimezone } from '@/src/account';

/**
 * Per-user Account preferences (ACC-07/08). Session-gated by the middleware,
 * which injects the verified `x-sovereign-user-id`. Plugins can't read the
 * platform DB directly (SDK boundary), so the Account plugin reads/writes here
 * (forwarding the session cookie) until `sdk.db` lands.
 */
function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

function isValidSidebarPlugins(value: unknown): value is SidebarPluginEntry[] | null {
  if (value === null) return true;
  if (!Array.isArray(value)) return false;
  return value.every(
    (e) =>
      e !== null &&
      typeof e === 'object' &&
      typeof (e as Record<string, unknown>).id === 'string' &&
      typeof (e as Record<string, unknown>).hidden === 'boolean',
  );
}

export async function GET(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json(await getAccountPrefs(await getPlatformDb(), userId));
}

export async function PATCH(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await request.json()) as {
    timezone?: unknown;
    theme?: unknown;
    sidebar_plugins?: unknown;
  };
  const patch: Parameters<typeof setAccountPrefs>[2] = {};

  if (body.timezone !== undefined) {
    if (!isValidTimezone(body.timezone)) {
      return NextResponse.json({ error: 'invalid timezone' }, { status: 400 });
    }
    patch.timezone = body.timezone;
  }
  if (body.theme !== undefined) {
    if (!isValidTheme(body.theme)) {
      return NextResponse.json({ error: 'invalid theme' }, { status: 400 });
    }
    patch.theme = body.theme;
  }
  if ('sidebar_plugins' in body) {
    if (!isValidSidebarPlugins(body.sidebar_plugins)) {
      return NextResponse.json({ error: 'invalid sidebar_plugins' }, { status: 400 });
    }
    patch.sidebarPlugins = body.sidebar_plugins;
  }

  const next = await setAccountPrefs(await getPlatformDb(), userId, patch);
  const res = NextResponse.json(next);

  // Mirror the theme to a cookie so the shell can resolve it before first paint
  // without a DB round-trip (ACC-08; account.md open question 4).
  if (patch.theme) {
    res.cookies.set('sv-theme', patch.theme, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }
  return res;
}
