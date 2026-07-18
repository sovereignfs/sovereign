import { authGet } from './db';
import { getEnv } from './env';

/**
 * Parse the invites.plugins JSON column (RFC 0065 Task 1.17) into a plugin ID
 * array. Pure so it's directly unit-testable; a null/absent value, malformed
 * JSON, or a non-array shape all degrade to `[]` rather than throwing —
 * invite lookup/registration must never fail because of a corrupt scope.
 */
export function parseInvitePluginIds(pluginsJson: string | null | undefined): string[] {
  if (!pluginsJson) return [];
  try {
    const parsed: unknown = JSON.parse(pluginsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}

/**
 * Resolve a just-consumed invite's plugin scope (RFC 0065 Task 1.17) into
 * `plugin_access_users` grants (RFC 0065 Task 2.21) for the newly registered
 * user, so invite-scoped access is indistinguishable from an admin-granted
 * row once the account exists (Task 2.23).
 *
 * `plugin_access_users` is a platform-db table owned by `runtime`/`packages/db`
 * — apps/auth has no direct access (separate app, separate database) — so
 * this crosses the process boundary over the admin-key-gated HTTP API, same
 * pattern as `platform-email.ts`'s `reportDeliveryOutcomeToActivityLog`.
 *
 * Never throws: a failure here (runtime unreachable, plugin removed, etc.)
 * must never break registration, which already succeeded by the time this
 * runs. Re-queries the invites table by email rather than being passed data
 * from the `before` hook, since better-auth's `after` hook only receives the
 * created user record — this is safe because email uniqueness means at most
 * one registration can be consuming a given email's invite at a time.
 */
export async function resolveInvitePluginGrants(user: {
  id: string;
  email: string;
}): Promise<void> {
  try {
    const invite = await authGet<{ invited_by_id: string | null; plugins: string | null }>(
      'SELECT invited_by_id, plugins FROM invites WHERE email = ? AND consumed_at IS NOT NULL ORDER BY consumed_at DESC LIMIT 1',
      [user.email],
    );
    if (!invite?.invited_by_id) return;
    const pluginIds = parseInvitePluginIds(invite.plugins);
    if (pluginIds.length === 0) return;

    const env = getEnv();
    for (const pluginId of pluginIds) {
      await grantIfScopedPolicy(
        env.runtimeUrl,
        env.adminKey,
        pluginId,
        user.id,
        invite.invited_by_id,
      );
    }
  } catch {
    // Intentionally silent — see module doc.
  }
}

/**
 * Grants only when the plugin's *current* access policy is `selected_users`
 * or `selected_groups` — the invite grants eligibility, it never overrides
 * the plugin's policy (e.g. a plugin left at `everyone` needs no grant, and
 * one now `disabled` must not silently reopen because of a stale invite).
 */
async function grantIfScopedPolicy(
  runtimeUrl: string,
  adminKey: string,
  pluginId: string,
  newUserId: string,
  invitedByUserId: string,
): Promise<void> {
  const accessRes = await fetch(
    `${runtimeUrl}/api/admin/plugins/${encodeURIComponent(pluginId)}/access`,
    { headers: { authorization: `Bearer ${adminKey}` } },
  );
  if (!accessRes.ok) return;
  const access = (await accessRes.json()) as { accessPolicy?: string };
  if (access.accessPolicy !== 'selected_users' && access.accessPolicy !== 'selected_groups') return;

  await fetch(`${runtimeUrl}/api/admin/plugins/${encodeURIComponent(pluginId)}/access/users`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${adminKey}`,
      'x-sovereign-user-id': invitedByUserId,
    },
    body: JSON.stringify({ userId: newUserId, source: 'invite' }),
  });
}
