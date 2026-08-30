import { headers } from 'next/headers';
import { GrantRequiredError } from './errors';
import { requireHost } from './host';

/**
 * A plugin-scoped, resource-aware grant (RFC 0054) — the missing middle
 * between platform roles (`sdk.auth.hasCapability`, coarse, session-wide) and
 * "the plugin invents its own ad hoc table". Grants live in the owning
 * plugin's own storage; the platform never persists them.
 */
export interface PluginGrant {
  id: string;
  tenantId: string;
  pluginId: string;
  userId: string;
  /** A local plugin role name declared in the manifest's `roles` object. */
  role?: string;
  /** Local plugin capability names, for a grant not backed by a role preset. */
  capabilities?: string[];
  scope: GrantScope;
  grantedByUserId: string;
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  metadata?: unknown;
}

/** What a grant applies to — the whole plugin, or one plugin-owned resource. */
export interface GrantScope {
  type: 'plugin' | 'resource';
  /** Required when `type === 'resource'` (e.g. `"project"`, `"inbox"`). */
  resourceType?: string;
  /** Required when `type === 'resource'` — the specific resource's id. */
  resourceId?: string;
}

/** What `hasGrant()`/`requireGrant()` check. */
export interface GrantCheck {
  /** The local plugin capability name being checked (e.g. `"project-edit"`). */
  capability: string;
  /** Omit for a plugin-scope check; provide for a resource-scope check. */
  resource?: {
    type: string;
    id: string;
  };
}

/**
 * A plugin registers exactly one of these to answer every `hasGrant()`/
 * `requireGrant()` call routed to it. `userId` is supplied by the SDK from
 * the current session — a resolver never receives a caller-suppliable
 * identity, mirroring `sdk.db.getClient()`'s zero-argument invariant for the
 * same reason (no plugin-authored code should be able to check grants on
 * another user's behalf by passing a different id).
 */
export type GrantResolver = (userId: string, check: GrantCheck) => Promise<boolean>;

/**
 * Plugin-scoped roles and grants (RFC 0054) — authorization *below* the
 * platform role layer, for plugins with their own domain roles (project
 * owner/editor/viewer, shared-inbox owner/agent, etc.) that must not become
 * platform roles and must not bloat the global session capability header.
 *
 * **Provider** — register one resolver for your plugin's grant checks
 * (typically at the top of a route handler or server component that runs
 * when the plugin is loaded; declare role presets in the manifest `roles`
 * object first):
 *
 * ```ts
 * await sdk.authz.provide(async (userId, check) => {
 *   if (!check.resource) return false; // this plugin only has resource-scoped roles
 *   return hasProjectRole(userId, check.resource.id, check.capability);
 * });
 * ```
 *
 * **Consumer** — check the current user's own grant (a plugin only ever
 * checks grants for itself; there is no cross-plugin grant query):
 *
 * ```ts
 * if (await sdk.authz.hasGrant({ capability: 'project-edit', resource: { type: 'project', id } })) {
 *   // ...
 * }
 *
 * await sdk.authz.requireGrant({ capability: 'project-manage-members', resource: { type: 'project', id } });
 * ```
 *
 * With no resolver registered for the calling plugin, both `hasGrant()` and
 * `requireGrant()` fail closed — `hasGrant()` returns `false`,
 * `requireGrant()` throws `GrantRequiredError` — rather than defaulting to
 * allow. A plugin that declares `roles` but never calls `provide()` grants
 * no one anything, matching RFC 0054 §2's "the manifest declares vocabulary
 * only" rule.
 *
 * Grants are never injected into the session capability header — middleware
 * has no plugin resource context to resolve them against (RFC 0054 §8).
 * Assignment/revocation, last-owner protection, and audit logging are the
 * provider plugin's own responsibility (log via `sdk.activity.log()`); see
 * `docs/plugin-development.md`'s "Plugin-scoped roles and grants" section
 * for the full assignment-flow and portability guidance.
 *
 * Registration reads the calling plugin's id from the request context, so
 * `provide()` must run inside a plugin route (where `x-sovereign-plugin-id`
 * is injected) — hence it is async. Registrations are in-process and reset
 * on restart, matching `sdk.portability`/`sdk.data`.
 */
export const authz = {
  /** Provider: register this plugin's grant resolver. */
  async provide(resolver: GrantResolver): Promise<void> {
    const pluginId = (await headers()).get('x-sovereign-plugin-id');
    if (!pluginId) {
      throw new Error(
        'sdk.authz.provide() must be called from a plugin route context ' +
          '(x-sovereign-plugin-id header missing).',
      );
    }
    requireHost().authz.provide(pluginId, resolver);
  },

  /**
   * Consumer: check whether the current user holds a grant for `check`
   * against the calling plugin's own resolver. Returns `false` (never
   * throws) when there is no session, no plugin context, or no registered
   * resolver — including when called outside a real Next.js request (e.g. a
   * background job/schedule handler), where `headers()` itself would throw.
   */
  async hasGrant(check: GrantCheck): Promise<boolean> {
    let h: Headers;
    try {
      h = await headers();
    } catch {
      return false;
    }
    const pluginId = h.get('x-sovereign-plugin-id');
    const userId = h.get('x-sovereign-user-id');
    if (!pluginId || !userId) return false;
    return requireHost().authz.hasGrant(pluginId, userId, check);
  },

  /** Consumer: same as `hasGrant()`, but throws `GrantRequiredError` instead of returning `false`. */
  async requireGrant(check: GrantCheck): Promise<void> {
    if (!(await authz.hasGrant(check))) {
      throw new GrantRequiredError();
    }
  },
};
