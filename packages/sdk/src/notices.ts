import {
  createRemoteJWKSet,
  customFetch as joseFetch,
  errors as joseErrors,
  jwtVerify,
} from 'jose';
import { ConfigurationError, CoreUnavailableError, InvalidNoticeError } from './errors';

export const BACK_CHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
export const ACCOUNT_DELETED_EVENT = 'urn:sovereignfs:event:account-deleted';
/** How far an `iat` may be ahead of this clock before a notice is refused. */
const SKEW_SECONDS = 60;
/** How long core's discovery document and keys may take to answer. */
const FETCH_MILLISECONDS = 10_000;

/** Core's keys, as `jose` reads them. */
export type NoticeKeys = ReturnType<typeof createRemoteJWKSet>;

export type NoticeRules = {
  /** The token's header `typ`: `logout+jwt` or `account-deleted+jwt`. */
  typ: string;
  /** The event the token must carry. */
  event: string;
  /** Core's issuer, which the token's `iss` must be. */
  issuer: string;
  /** This app's client ID, which the token's `aud` must include. */
  audience: string;
  keys: NoticeKeys;
  /** This clock, in milliseconds. */
  now: number;
};

export type VerifiedNotice = {
  sub: string | undefined;
  sid: string | undefined;
  jti: string;
  /** When the token expires, in seconds. */
  exp: number;
};

/**
 * The rules a notice from core must meet (sdk §9.1), for a logout token and an account-deleted token alike: its type, its signature, its
 * issuer, its audience, an `iat` not in the future, its expiry, its event, a `jti`, no `nonce`, and a `sub` or a `sid`. It returns the
 * notice, or `undefined` for one to refuse, and throws `CoreUnavailableError` when core's keys could not be had, which is not a verdict
 * on the token. It does not look for a replay: what has been seen is the caller's to keep.
 */
export async function checkNotice(
  token: string,
  rules: NoticeRules,
): Promise<VerifiedNotice | undefined> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, rules.keys, {
      issuer: rules.issuer,
      audience: rules.audience,
      typ: rules.typ,
      currentDate: new Date(rules.now),
      requiredClaims: ['iat', 'exp', 'jti'],
    }));
  } catch (error) {
    if (error instanceof CoreUnavailableError) throw error;
    // The key set could not be fetched in time. (A timeout is a `JOSEError` too, so it is asked first.)
    if (error instanceof joseErrors.JWKSTimeout) {
      throw new CoreUnavailableError('Core’s keys could not be fetched.');
    }
    // Anything else is a verdict on the token: its signature, its type, its claims, or a key that is not core's.
    return undefined;
  }
  const now = Math.floor(rules.now / 1000);
  if (typeof payload.iat !== 'number' || payload.iat > now + SKEW_SECONDS) return undefined;
  const events = payload.events as Record<string, unknown> | undefined;
  if (!events || typeof events !== 'object' || !(rules.event in events)) return undefined;
  if ('nonce' in payload) return undefined;
  const sub = typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : undefined;
  const sid = typeof payload.sid === 'string' && payload.sid !== '' ? payload.sid : undefined;
  if (!sub && !sid) return undefined;
  return { sub, sid, jti: payload.jti as string, exp: payload.exp as number };
}

export type NoticeOptions = {
  /** Core's address, which is its issuer (`<PREFIX>_CORE_URL`). */
  coreUrl: string;
  /** This app's client ID at core (`<PREFIX>_CORE_CLIENT_ID`), the audience of a notice. */
  clientId: string;
  /**
   * Whether this notice was seen before. It MUST record the `jti` until `expiresAt` (milliseconds) and answer `true` if it was
   * recorded already. It is asked last, of a notice that has met every other rule, so a forged one fills nothing. Required: a verifier
   * with no replay protection is a mistake this export does not make easy.
   */
  seen: (jti: string, expiresAt: number) => Promise<boolean>;
  /** How to reach core, for its discovery document and its keys. Default: `fetch`, with ten seconds to answer. */
  fetch?: typeof fetch;
};

/**
 * Verifies a back-channel logout token from core without the SDK's sessions (sdk §9.2). Give it the `POST` core made (its form holds
 * `logout_token`; the body is read) or the token itself. It returns who the token names, and ends nothing: ending the sessions of
 * that `sub`, or of that `sid`, is the app's. It throws `InvalidNoticeError` (answer `400`) for any notice to refuse, and
 * `CoreUnavailableError` (answer `503`) when core could not be asked.
 */
export async function verifyLogoutToken(
  notice: Request | string,
  options: NoticeOptions,
): Promise<{ sub?: string; sid?: string }> {
  const verified = await verify(notice, 'logout_token', 'logout+jwt', BACK_CHANNEL_EVENT, options);
  return {
    ...(verified.sub === undefined ? {} : { sub: verified.sub }),
    ...(verified.sid === undefined ? {} : { sid: verified.sid }),
  };
}

/**
 * Verifies an account-deleted token from core without the SDK's sessions (sdk §9.2, core-app §4.5), as `verifyLogoutToken` does a
 * logout token: the form field is `account_deleted_token`, and the person is the token's `sub`. The app deletes what it holds of them,
 * and answers `200` only after it has; each attempt of core's carries a new `jti`, so a retry is not a replay.
 */
export async function verifyAccountDeletedToken(
  notice: Request | string,
  options: NoticeOptions,
): Promise<{ sub: string }> {
  const verified = await verify(
    notice,
    'account_deleted_token',
    'account-deleted+jwt',
    ACCOUNT_DELETED_EVENT,
    options,
    true,
  );
  return { sub: verified.sub as string };
}

async function verify(
  notice: Request | string,
  field: string,
  typ: string,
  event: string,
  options: NoticeOptions,
  needsSub = false,
): Promise<VerifiedNotice> {
  const { coreUrl, clientId, seen } = checked(options);
  const token = await tokenOf(notice, field);
  const keys = await keysOf(coreUrl, options.fetch ?? fetch);
  const now = Date.now();
  const verified = await checkNotice(token, {
    typ,
    event,
    issuer: coreUrl,
    audience: clientId,
    keys,
    now,
  });
  if (!verified || (needsSub && !verified.sub)) throw new InvalidNoticeError();
  if (await seen(verified.jti, Math.max(verified.exp * 1000, now) + 1000)) {
    throw new InvalidNoticeError();
  }
  return verified;
}

/** The options, or a `ConfigurationError` naming what is wrong with them and never a value. */
function checked(options: NoticeOptions): Pick<NoticeOptions, 'coreUrl' | 'clientId' | 'seen'> {
  const problems: string[] = [];
  if (typeof options?.coreUrl !== 'string' || !URL.canParse(options.coreUrl))
    problems.push('coreUrl must be core’s address');
  if (typeof options?.clientId !== 'string' || options.clientId === '')
    problems.push('clientId must be the app’s client ID');
  if (typeof options?.seen !== 'function')
    problems.push(
      'seen is required: it records each notice’s jti and says whether it was seen before',
    );
  if (problems.length > 0) throw new ConfigurationError(problems.join('; ') + '.');
  return options;
}

/** The token a notice carries: the string itself, or the field of the form core posted. */
async function tokenOf(notice: Request | string, field: string): Promise<string> {
  if (typeof notice === 'string') {
    if (notice === '') throw new InvalidNoticeError();
    return notice;
  }
  if (notice.method !== 'POST') throw new InvalidNoticeError();
  let token: string | null;
  try {
    token = new URLSearchParams(await notice.text()).get(field);
  } catch {
    throw new InvalidNoticeError();
  }
  if (!token) throw new InvalidNoticeError();
  return token;
}

/**
 * Core's keys, found through its discovery document, which may name them only on core's own address. Read on each call, since notices are rare and a key that rotated must not be
 * remembered. A failure to reach core, a timeout and an answer that is not a success are all `CoreUnavailableError`: none says the notice is bad.
 */
async function keysOf(coreUrl: string, fetchImpl: typeof fetch): Promise<NoticeKeys> {
  const get = async (url: string, init?: RequestInit): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_MILLISECONDS),
      });
    } catch (cause) {
      throw new CoreUnavailableError('Core could not be reached to check a notice.', { cause });
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new CoreUnavailableError(
        `Core answered ${response.status} to a request to check a notice.`,
        {
          status: response.status,
        },
      );
    }
    return response;
  };

  // Appended to the issuer, as OpenID Connect Discovery §4 says: an issuer with a path keeps it (a leading slash would replace it).
  const response = await get(`${coreUrl.replace(/\/+$/, '')}/.well-known/openid-configuration`, {
    headers: { accept: 'application/json' },
  });
  let document: { issuer?: unknown; jwks_uri?: unknown };
  try {
    document = (await response.json()) as typeof document;
  } catch (cause) {
    throw new CoreUnavailableError('Core’s discovery document could not be read.', { cause });
  }
  // The issuer is what a notice names, so a core that calls itself something else is not the core this app was set up with.
  if (document.issuer !== coreUrl) {
    throw new ConfigurationError('coreUrl is not the issuer that core’s discovery document names.');
  }
  if (typeof document.jwks_uri !== 'string' || !URL.canParse(document.jwks_uri)) {
    throw new CoreUnavailableError('Core’s discovery document names no keys.');
  }
  // Core's keys are on core's own address. A document that sends the app elsewhere for them is not asked, so what a notice can make the
  // app fetch is core's, and nothing else.
  if (new URL(document.jwks_uri).origin !== new URL(coreUrl).origin) {
    throw new CoreUnavailableError('Core’s discovery document names keys at another address.');
  }
  return createRemoteJWKSet(new URL(document.jwks_uri), {
    [joseFetch]: (url: string, init: RequestInit) => get(url, init),
  });
}
