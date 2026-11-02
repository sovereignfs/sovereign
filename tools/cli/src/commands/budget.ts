import { databaseOf } from '../apply/apps.js';
import type { Connections } from '../apply/database-use.js';
import type { Context } from '../context.js';
import { Refused } from '../errors.js';
import { readManifest } from '../manifest.js';
import {
  connectionBudget,
  describeBudget,
  maxConnectionsOf,
  type Budget,
} from '../suite/connections.js';
import { readLock } from '../suite/files.js';
import { hasDatabase, isExternal, type Suite } from '../suite/types.js';

/**
 * Which hosted apps have a database, read from their manifests as `sv app add` reads them. An app whose manifest cannot be read counts as
 * having one, so the budget is never lower than it is: the names are returned so the operator is told.
 */
export async function appsWithDatabase(
  ctx: Context,
  suite: Suite,
): Promise<{ has: (name: string) => boolean; unread: string[] }> {
  const lock = await readLock(ctx.root);
  const answers = new Map<string, boolean>();
  const unread: string[] = [];
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    if (isExternal(app)) continue;
    try {
      const manifest = await readManifest(
        name,
        app,
        ctx.registry,
        suite.core.version,
        ctx.fetch,
        lock?.apps?.[name]?.digest,
      );
      answers.set(name, hasDatabase(manifest));
    } catch {
      unread.push(name);
    }
  }
  return { has: (name) => answers.get(name) ?? true, unread };
}

/** The budget for `suite`, refused when the limits do not fit: what `sv database set` and `sv app update --connections` write must. */
export async function refuseOverBudget(
  ctx: Context,
  suite: Suite,
): Promise<{ budget: Budget; unread: string[] }> {
  const { has, unread } = await appsWithDatabase(ctx, suite);
  const budget = connectionBudget(suite, has);
  if (budget.exceeded) {
    throw new Refused(
      describeBudget(budget, maxConnectionsOf(suite)),
      'Lower the pools with sv database set --core N --app N, or raise the server with --max-connections N. Nothing was changed.',
    );
  }
  return { budget, unread };
}

/** What a role is called to an operator: core, or the app it was made for. */
export function serviceOfRole(suite: Suite, role: string): string {
  if (role === 'core') return 'core';
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    if (!isExternal(app) && databaseOf(name) === role) return name;
  }
  return role;
}

/** The connections the server reports, in a sentence, and which of them are near what they may hold (operator-cli §6.4.4). */
export function describeUse(
  suite: Suite,
  connections: Connections,
): { summary: string; pressure: string[] } {
  const roles = connections.roles.map((r) => ({ ...r, service: serviceOfRole(suite, r.role) }));
  const pressure: string[] = [];
  for (const r of roles) {
    if (r.used >= Math.ceil(r.limit * 0.8))
      pressure.push(`${r.service} holds ${r.used} of ${r.limit}`);
  }
  const usable = connections.max - connections.reserved;
  if (connections.total >= Math.ceil(usable * 0.8))
    pressure.push(`${connections.total} are open of the ${usable} the server leaves for them`);
  const held = roles.map((r) => `${r.service} ${r.used}/${r.limit}`).join(', ');
  return {
    summary: `${connections.total} open of ${connections.max}${held ? ` (${held})` : ''}`,
    pressure,
  };
}
