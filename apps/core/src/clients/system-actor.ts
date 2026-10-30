import { AsyncLocalStorage } from 'node:async_hooks';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { ROLE_OWNER } from '../auth/roles';

/**
 * The actor `sovereign-admin` acts as (core-app §3.7.4): the registry's way of writing an app when nobody can sign
 * in to the Console, as on a first deployment. It is built in one place, the command's entry point
 * (`src/admin/main.ts`); no route and no server action imports this function, and
 * `system-actor.test.ts` fails when one does. Its trust is that the command runs inside core's container, where
 * whoever can run it already holds `SV_AUTH_SECRET`, so it grants nothing that was not already held.
 */
export type SystemActor = { readonly system: true; readonly headers: Headers };

/** Every actor made here, so an object that merely looks like one is not taken for one. */
const made = new WeakSet<object>();

export function systemActor(): SystemActor {
  const actor: SystemActor = { system: true, headers: new Headers() };
  made.add(actor);
  return actor;
}

export function isSystemActor(actor: unknown): actor is SystemActor {
  return typeof actor === 'object' && actor !== null && made.has(actor);
}

/** Set while the registry calls the provider for a system actor, in this process and nowhere else. */
const acting = new AsyncLocalStorage<true>();

/** Runs `work` as the system actor: the provider's client routes it calls then see a session. */
export function runAsSystem<T>(work: () => Promise<T>): Promise<T> {
  return acting.run(true, work);
}

/** The routes through which the provider writes an app. They ask for a session, and the system has none. */
const CLIENT_WRITES = new Set([
  '/admin/oauth2/create-client',
  '/oauth2/client/rotate-secret',
  '/oauth2/delete-client',
]);

/**
 * The provider's routes for writing an app need a signed-in account that `clientPrivileges` accepts. For a call the
 * registry makes as the system actor, and only then (`acting` is set by `runAsSystem` alone, and a request cannot
 * set it), this gives that route a session of the owner's role, which `client:manage` is judged against as for any
 * account. The session is not stored, has no cookie and lives for the call.
 */
export function systemSession() {
  return {
    id: 'core-system-session',
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && CLIENT_WRITES.has(context.path),
          handler: createAuthMiddleware(async () => {
            if (!acting.getStore()) return;
            const now = new Date();
            return {
              context: {
                context: {
                  session: {
                    session: {
                      id: 'system',
                      token: '',
                      userId: 'system',
                      createdAt: now,
                      updatedAt: now,
                      expiresAt: new Date(now.getTime() + 60_000),
                    },
                    user: {
                      id: 'system',
                      name: 'Core',
                      email: 'system@core.invalid',
                      emailVerified: true,
                      role: ROLE_OWNER,
                      createdAt: now,
                      updatedAt: now,
                    },
                  },
                },
              },
            };
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
