import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAccountPrefs, listDisabledPluginIds, setAccountPrefs } from '@sovereignfs/db';
import { isValidTheme, isValidTimezone } from '@/src/account';
import { avatarsDir, findAvatarFile } from '@/src/avatars';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import type { PlatformExportData } from './assemble';
import type { PlatformAccountSection } from './restore';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';
const ALLOWED_AVATAR_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);

/**
 * Ids of installed, enabled plugins that declare the given portability
 * permission. The export assembler / import restorer only act on plugins in
 * this allow-list (RFC 0007 §6 — `data:export` / `data:import` gate participation).
 */
export async function eligiblePluginIds(
  permission: 'data:export' | 'data:import',
): Promise<string[]> {
  const disabled = new Set(await listDisabledPluginIds(await getPlatformDb()));
  return getInstalledPlugins()
    .filter((m) => !disabled.has(m.id) && m.permissions.includes(permission))
    .map((m) => m.id);
}

/** Gather the platform-owned slice of a user's data for export. */
export async function gatherPlatformExport(
  userId: string,
  cookie: string,
): Promise<PlatformExportData> {
  let name: string | null = null;
  let email: string | null = null;
  let image: string | null = null;
  try {
    // Fresh read (bypass the signed cookie cache) so the export reflects the
    // authoritative profile, not a stale session snapshot.
    const res = await fetch(`${AUTH_URL}/api/auth/get-session?disableCookieCache=true`, {
      headers: { cookie, origin: AUTH_URL },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        user?: { name?: string | null; email?: string | null; image?: string | null };
      } | null;
      if (data?.user) {
        name = data.user.name ?? null;
        email = data.user.email ?? null;
        image = data.user.image ?? null;
      }
    }
  } catch {
    // best-effort; fall through with nulls
  }

  const prefs = await getAccountPrefs(await getPlatformDb(), userId);

  let avatar: { ext: string; bytes: Uint8Array } | null = null;
  const path = findAvatarFile(userId);
  if (path) {
    const ext = (path.split('.').pop() ?? 'bin').toLowerCase();
    avatar = { ext, bytes: new Uint8Array(readFileSync(path)) };
  }

  return { name, email, image, timezone: prefs.timezone, theme: prefs.theme, avatar };
}

/** Server-to-server better-auth update-user (CSRF Origin = the auth base URL). */
async function authUpdateUser(cookie: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`${AUTH_URL}/api/auth/update-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, origin: AUTH_URL },
    body: JSON.stringify(body),
  });
}

/**
 * Apply an imported platform slice into the current user's account. Profile
 * fields and prefs are restored onto the importing user (their own account);
 * email is intentionally NOT imported (identity is not transferable). Additive
 * for collections is the plugins' concern; the platform slice is singular.
 */
export async function applyPlatformImport(
  userId: string,
  cookie: string,
  account: PlatformAccountSection,
  avatar: { ext: string; bytes: Uint8Array } | null,
): Promise<void> {
  const name = account.profile?.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    await authUpdateUser(cookie, { name: name.trim().slice(0, 100) });
  }

  const patch: { timezone?: string; theme?: string } = {};
  if (isValidTimezone(account.preferences?.timezone)) patch.timezone = account.preferences.timezone;
  if (isValidTheme(account.preferences?.theme)) patch.theme = account.preferences.theme;
  if (Object.keys(patch).length > 0) {
    await setAccountPrefs(await getPlatformDb(), userId, patch);
  }

  if (avatar && ALLOWED_AVATAR_EXT.has(avatar.ext.toLowerCase())) {
    const ext = avatar.ext.toLowerCase();
    const dir = avatarsDir();
    mkdirSync(dir, { recursive: true });
    for (const entry of readdirSync(dir)) {
      if (entry === userId || entry.startsWith(`${userId}.`))
        rmSync(join(dir, entry), { force: true });
    }
    writeFileSync(join(dir, `${userId}.${ext}`), Buffer.from(avatar.bytes));
    await authUpdateUser(cookie, {
      image: `/api/account/avatar/${userId}?v=${String(Date.now())}`,
    });
  }
}
