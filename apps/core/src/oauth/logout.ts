import { randomBytes } from 'node:crypto';
import type { Executor } from '@sovereignfs/database';
import { signJWT } from 'better-auth/plugins/jwt';
import type { AccountStates } from '../accounts/states';
import type { Auth } from '../auth/auth';
import { NAMES } from './schema-names';
import { revokeAllTokens } from './revocation';

/** One app to tell that a person's session ended (OpenID Connect Back-Channel Logout, core-app §3.6.5). */
export type LogoutNotice = {
  clientId: string;
  /** The address the app registered to be told at. */
  uri: string;
  /** The session that ended: the `sid` the app saw in its ID token. */
  sessionId: string;
  /** The person, as the app knows them: the `sub`. */
  userId: string;
};

const EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const LIFETIME_SECONDS = 120;
const TIMEOUT_MS = 5000;

/**
 * Which apps to tell, read before an account's sessions are deleted: deleting a session clears the pointer
 * from the app's tokens to it, so afterwards nothing says which app the session was used with. An app is
 * told once for each session it holds a token for, if it registered a back-channel logout address and is
 * not switched off.
 */
export async function planLogoutNotices(tx: Executor, userId: string): Promise<LogoutNotice[]> {
  const found = new Map<string, LogoutNotice>();
  const sources = [
    [NAMES.accessTokens, NAMES.access],
    [NAMES.refreshTokens, NAMES.refresh],
  ] as const;
  for (const [table, c] of sources) {
    const { rows } = await tx.run(
      `select t.${c.sessionId} as session_id, t.${c.clientId} as client_id, a.${NAMES.client.backchannelLogoutUri} as uri,
         a.${NAMES.client.disabled} as disabled
       from ${table} t join ${NAMES.clients} a on a.${NAMES.client.clientId} = t.${c.clientId}
       where t.${c.userId} = ? and t.${c.sessionId} is not null`,
      [userId],
    );
    for (const row of rows) {
      const disabled = row.disabled === true || row.disabled === 1;
      if (typeof row.uri !== 'string' || row.uri === '' || disabled) continue;
      const sessionId = String(row.session_id);
      const clientId = String(row.client_id);
      found.set(`${clientId}\n${sessionId}`, { clientId, uri: row.uri, sessionId, userId });
    }
  }
  return [...found.values()];
}

/**
 * Sends each app its logout token: a JWT signed with the key the ID tokens use, so any app that checks ID
 * tokens can check this, carrying `sub` and `sid` and the logout event and no nonce. One attempt each, within
 * five seconds, never following a redirect, and a failure is logged and never raised: the app has to treat
 * its own session as over when its tokens stop working (core-app §3.6.5).
 */
export async function sendLogoutNotices(
  auth: Pick<Auth, '$context'>,
  notices: readonly LogoutNotice[],
  options: { fetch?: typeof fetch; log?: (message: string) => void } = {},
): Promise<void> {
  if (notices.length === 0) return;
  const send = options.fetch ?? fetch;
  const log = options.log ?? ((message: string) => console.warn(message));
  const context = await auth.$context;
  const jwt = (
    context.getPlugin('jwt') as { options?: Parameters<typeof signJWT>[1]['options'] } | null
  )?.options;
  const issuer = (jwt as { jwt?: { issuer?: string } } | undefined)?.jwt?.issuer;
  const iat = Math.floor(Date.now() / 1000);

  await Promise.allSettled(
    notices.map(async (notice) => {
      try {
        const token = await signJWT({ context } as Parameters<typeof signJWT>[0], {
          options: jwt,
          payload: {
            iss: issuer,
            aud: notice.clientId,
            sub: notice.userId,
            sid: notice.sessionId,
            iat,
            exp: iat + LIFETIME_SECONDS,
            jti: randomBytes(16).toString('hex'),
            events: { [EVENT]: {} },
          },
          header: { typ: 'logout+jwt' },
        });
        const response = await send(notice.uri, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body: new URLSearchParams({ logout_token: token }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: 'error',
        });
        if (response.status !== 200 && response.status !== 204) {
          log(`Telling app ${notice.clientId} its session ended returned ${response.status}.`);
        }
      } catch (error) {
        log(
          `Telling app ${notice.clientId} its session ended failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }),
  );
}

/**
 * What deactivating an account does to the apps (core-app §3.6.3, §3.6.5), in the transaction that ends its
 * sessions: every access token and refresh token is revoked (offline ones too), and once the deactivation
 * has been committed each app that registered a back-channel logout address is told.
 */
export function revokeOnDeactivation(states: AccountStates, auth: () => Promise<Auth>): void {
  states.addPreparation(async (tx, userId) => {
    const notices = await planLogoutNotices(tx, userId);
    if (notices.length === 0) return undefined;
    return async () => sendLogoutNotices(await auth(), notices);
  });
  states.addStep(async (tx, userId, at) => {
    await revokeAllTokens(tx, at, userId);
  });
}
