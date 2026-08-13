import type { PluginEventAuthorizerDecl } from '../generated/plugin-events';
import { PLUGIN_EVENT_AUTHORIZERS } from '../generated/plugin-events';
import { logger } from './logger';

/**
 * Match a manifest channel pattern (e.g. `"list:*"` or an exact
 * `"list:overview"`) against a plugin-local channel string. `*` is only ever
 * a full trailing segment (enforced at manifest-validation time,
 * `packages/manifest/src/schema.ts`), so matching is a simple prefix check,
 * not a general glob.
 */
export function patternMatches(pattern: string, channel: string): boolean {
  if (pattern.endsWith(':*')) {
    return channel.startsWith(pattern.slice(0, -1));
  }
  return pattern === channel;
}

export interface AuthorizeChannelContext {
  userId: string;
  headers: Headers;
}

/**
 * Authorize a subscribe request for `pluginId`'s plugin-local `channel`
 * (RFC 0045). **Fails closed**: no manifest-declared pattern matches the
 * channel, every matching handler returns falsy, or every matching handler
 * throws → denied. Any one matching handler returning `true` allows —
 * multiple declared patterns for the same plugin can match one channel
 * (e.g. `list:*` and an exact `list:overview`), and any of them vouching is
 * enough.
 *
 * A throwing handler is logged and treated as a deny for that handler, not
 * a hard failure of the whole authorization check — one broken authorizer
 * must not take down every channel for the plugin if another declared
 * pattern also matches and succeeds.
 */
export async function authorizeChannel(
  pluginId: string,
  channel: string,
  ctx: AuthorizeChannelContext,
  decls: readonly PluginEventAuthorizerDecl[] = PLUGIN_EVENT_AUTHORIZERS,
): Promise<boolean> {
  const candidates = decls.filter(
    (d) => d.pluginId === pluginId && patternMatches(d.pattern, channel),
  );
  if (candidates.length === 0) return false;

  for (const decl of candidates) {
    try {
      const allowed = await decl.handler({
        pluginId,
        userId: ctx.userId,
        channel,
        headers: ctx.headers,
      });
      if (allowed) return true;
    } catch (err) {
      logger.error('events: channel authorizer threw — treating as denied', {
        pluginId,
        pattern: decl.pattern,
        channel,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return false;
}
