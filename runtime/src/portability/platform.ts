import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_TENANT_ID,
  createE2eeDeviceEnrollment,
  createE2eeProfile,
  getAccountPrefs,
  getE2eeProfile,
  getE2eeRecoveryWrapper,
  listE2eeDeviceEnrollments,
  listUserPluginSecretRefs,
  setAccountPrefs,
  upsertE2eeRecoveryWrapper,
} from '@sovereignfs/db';
import { isValidTheme, isValidTimezone } from '@/src/account';
import { avatarsDir, findAvatarFile } from '@/src/avatars';
import { getPlatformDb } from '@/src/db';
import { getDisabledPluginIds } from '@/src/plugin-status';
import { getInstalledPlugins } from '@/src/registry';
import type { PlatformE2eeExportData, PlatformExportData } from './assemble';
import type { PlatformAccountSection } from './restore';
import { toSecretRef } from '@/src/secrets';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;
const ALLOWED_AVATAR_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);

/**
 * Ids of installed, enabled plugins that declare the given portability
 * permission. The export assembler / import restorer only act on plugins in
 * this allow-list (RFC 0007 §6 — `data:export` / `data:import` gate participation).
 */
export async function eligiblePluginIds(
  permission: 'data:export' | 'data:import',
): Promise<string[]> {
  const disabled = new Set(await getDisabledPluginIds(await getPlatformDb()));
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

  const pdb = await getPlatformDb();
  const prefs = await getAccountPrefs(pdb, userId);
  const vaultSecrets = (await listUserPluginSecretRefs(pdb, userId)).map((row) => ({
    ...toSecretRef(row),
    pluginId: row.pluginId,
    scope: 'user' as const,
  }));

  let avatar: { ext: string; bytes: Uint8Array } | null = null;
  const path = findAvatarFile(userId);
  if (path) {
    const ext = (path.split('.').pop() ?? 'bin').toLowerCase();
    avatar = { ext, bytes: new Uint8Array(readFileSync(path)) };
  }

  const e2ee = await gatherE2eeExport(pdb, userId);

  return {
    name,
    email,
    image,
    timezone: prefs.timezone,
    theme: prefs.theme,
    vaultSecrets,
    avatar,
    e2ee,
  };
}

/**
 * Client-side encryption material for export (RFC 0060) — wrapped ciphertext
 * and non-sensitive algorithm/KDF metadata only, same as everything `sdk.e2ee`
 * already persists. `null` when the user has no encryption profile.
 */
export async function gatherE2eeExport(
  pdb: Awaited<ReturnType<typeof getPlatformDb>>,
  userId: string,
): Promise<PlatformExportData['e2ee']> {
  const profile = await getE2eeProfile(pdb, DEFAULT_TENANT_ID, userId);
  if (!profile) return null;

  const recoveryWrapperRow = await getE2eeRecoveryWrapper(pdb, DEFAULT_TENANT_ID, userId);
  const deviceRows = await listE2eeDeviceEnrollments(pdb, DEFAULT_TENANT_ID, userId);

  return {
    profile: { status: profile.status, cmkAlgorithm: profile.cmkAlgorithm },
    recoveryWrapper: recoveryWrapperRow
      ? {
          wrappedCmk: recoveryWrapperRow.wrappedCmk,
          kdfAlgorithm: recoveryWrapperRow.kdfAlgorithm,
          kdfParams: recoveryWrapperRow.kdfParams,
          kdfSalt: recoveryWrapperRow.kdfSalt,
          algorithmVersion: recoveryWrapperRow.algorithmVersion,
        }
      : null,
    deviceEnrollments: deviceRows.map((row) => ({
      deviceId: row.deviceId,
      deviceLabel: row.deviceLabel,
      wrappedCmk: row.wrappedCmk,
      algorithmVersion: row.algorithmVersion,
    })),
  };
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

  if (account.e2ee) {
    await applyE2eeImport(userId, account.e2ee);
  }
}

/**
 * Restore client-side encryption material from an import bundle (RFC 0060).
 * Never overwrites an existing encryption setup — if the importing user
 * already has a profile on this instance, the imported e2ee data is silently
 * skipped, since it may not correspond to the same CMK. Row ids are
 * regenerated; `deviceId`/`wrappedCmk`/`algorithmVersion` are preserved
 * verbatim, so a device enrollment is only useful again if the *same*
 * browser (same locally-stored device key) performs the re-import.
 */
export async function applyE2eeImport(userId: string, e2ee: PlatformE2eeExportData): Promise<void> {
  const pdb = await getPlatformDb();
  const existing = await getE2eeProfile(pdb, DEFAULT_TENANT_ID, userId);
  if (existing) return;

  await createE2eeProfile(pdb, {
    id: randomUUID(),
    tenantId: DEFAULT_TENANT_ID,
    userId,
    cmkAlgorithm: e2ee.profile.cmkAlgorithm,
  });

  if (e2ee.recoveryWrapper) {
    await upsertE2eeRecoveryWrapper(pdb, {
      id: randomUUID(),
      tenantId: DEFAULT_TENANT_ID,
      userId,
      wrappedCmk: e2ee.recoveryWrapper.wrappedCmk,
      kdfAlgorithm: e2ee.recoveryWrapper.kdfAlgorithm,
      kdfParams: e2ee.recoveryWrapper.kdfParams,
      kdfSalt: e2ee.recoveryWrapper.kdfSalt,
      algorithmVersion: e2ee.recoveryWrapper.algorithmVersion,
    });
  }

  for (const device of e2ee.deviceEnrollments) {
    await createE2eeDeviceEnrollment(pdb, {
      id: randomUUID(),
      tenantId: DEFAULT_TENANT_ID,
      userId,
      deviceId: device.deviceId,
      deviceLabel: device.deviceLabel,
      wrappedCmk: device.wrappedCmk,
      algorithmVersion: device.algorithmVersion,
    });
  }
}
